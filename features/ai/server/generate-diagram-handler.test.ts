import { describe, expect, it, vi } from "vitest";
import {
  createGenerateDiagramHandler,
  createProvidersHandler,
} from "@/features/ai/server/generate-diagram-handler";
import { createSlidingWindowLimiter } from "@/features/ai/server/request-guard";
import { MissingAIProviderKeyError } from "@/features/ai/server/model-providers";
import { RateLimitError } from "@/features/ai/server/errors";
import type { AIStreamEvent } from "@/features/ai/types";

const post = (body: unknown) =>
  new Request("http://localhost/api/ai/generate-diagram", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const makeHandler = (
  overrides: Partial<Parameters<typeof createGenerateDiagramHandler>[0]> = {},
) => {
  const runWorkflow = vi.fn(async function* (): AsyncGenerator<AIStreamEvent> {
    yield { type: "phase.started", frameId: "f1", phase: "contextRetriever", message: "go" };
    yield { type: "frame.done", frameId: "f1", count: 0, graph: {} as never };
  });
  const handler = createGenerateDiagramHandler({
    getUserId: async () => "user_1",
    enabledProviders: () => ["gemini", "groq"],
    limiter: createSlidingWindowLimiter({ windowMs: 60_000, max: 100 }),
    runWorkflow,
    pacingMs: 0,
    ...overrides,
  });
  return { handler, runWorkflow };
};

const readAll = async (response: Response) => {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
};

describe("generate-diagram handler", () => {
  it("rejects anonymous callers with 401 and never starts the workflow", async () => {
    const { handler, runWorkflow } = makeHandler({ getUserId: async () => null });
    const response = await handler(post({ prompt: "hi" }));
    expect(response.status).toBe(401);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("rate limits per user with Retry-After", async () => {
    const limiter = createSlidingWindowLimiter({ windowMs: 60_000, max: 1 });
    const { handler, runWorkflow } = makeHandler({ limiter });
    expect((await handler(post({ prompt: "one" }))).status).toBe(200);
    const blocked = await handler(post({ prompt: "two" }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(runWorkflow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["malformed json", "{nope", 400],
    ["missing prompt", {}, 400],
    ["unavailable provider", { prompt: "x", provider: "openai" }, 400],
  ])("returns a JSON error for %s without starting the workflow", async (_n, body, status) => {
    const { handler, runWorkflow } = makeHandler();
    const response = await handler(post(body));
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toHaveProperty("error");
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("streams workflow events plus v1 compatibility events and closes cleanly", async () => {
    const { handler, runWorkflow } = makeHandler();
    const response = await handler(post({ prompt: "hi" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const events = await readAll(response);
    expect(events.map((e) => e.type)).toEqual([
      "phase.started",
      "thought",
      "frame.done",
      "done",
    ]);
    expect(runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hi", provider: "gemini" }),
    );
  });

  it("does not leak unknown error text to the client", async () => {
    const secret = "postgres://admin:hunter2@internal-db:5432/prod";
    const { handler } = makeHandler({
      runWorkflow: async function* () {
        throw new Error(`boom ${secret}`);
      },
    });
    const events = await readAll(await handler(post({ prompt: "hi" })));
    const errors = events.filter((e) => e.type === "error" || e.type === "frame.error");
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(JSON.stringify(e)).not.toContain("hunter2");
      expect(e.message).toMatch(/failed|try again/i);
    }
  });

  it("maps known failures to friendly messages without env var names", async () => {
    const missing = makeHandler({
      runWorkflow: async function* () {
        throw new MissingAIProviderKeyError("gemini", "GEMINI_API_KEY");
      },
    });
    const missingEvents = await readAll(await missing.handler(post({ prompt: "hi" })));
    const missingMsg = missingEvents.find((e) => e.type === "error")!.message as string;
    expect(missingMsg).not.toContain("GEMINI_API_KEY");
    expect(missingMsg).toMatch(/not configured/i);

    const limited = makeHandler({
      runWorkflow: async function* () {
        throw new RateLimitError();
      },
    });
    const limitedEvents = await readAll(await limited.handler(post({ prompt: "hi" })));
    expect(limitedEvents.find((e) => e.type === "error")!.message).toMatch(/limit/i);
  });

  it("stops the workflow when the client goes away", async () => {
    let finished = false;
    let produced = 0;
    const { handler } = makeHandler({
      runWorkflow: async function* () {
        try {
          for (;;) {
            produced += 1;
            yield { type: "phase.started", frameId: "f", phase: "contextRetriever", message: `m${produced}` } as AIStreamEvent;
            await new Promise((r) => setTimeout(r, 1));
          }
        } finally {
          finished = true;
        }
      },
    });
    const response = await handler(post({ prompt: "hi" }));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 30));
    expect(finished).toBe(true);
    const before = produced;
    await new Promise((r) => setTimeout(r, 20));
    expect(produced).toBe(before);
  });
});

describe("providers handler", () => {
  it("lists only the configured providers, to signed-in users only", async () => {
    const handler = createProvidersHandler({
      getUserId: async () => "user_1",
      enabledProviders: () => ["groq", "gemini"],
    });
    const response = await handler();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ providers: ["groq", "gemini"] });

    const anonymous = createProvidersHandler({
      getUserId: async () => null,
      enabledProviders: () => ["groq"],
    });
    expect((await anonymous()).status).toBe(401);
  });
});
