import { describe, expect, it } from "vitest";
import type { AIModelProvider } from "@/features/ai/types";
import {
  MAX_BODY_BYTES,
  MAX_CONTEXT_ELEMENTS,
  MAX_PROMPT_CHARS,
  createSlidingWindowLimiter,
  getEnabledProviders,
  parseGenerateRequest,
} from "@/features/ai/server/request-guard";

const enabled: readonly AIModelProvider[] = ["gemini", "groq"];
const parse = (body: unknown, providers: readonly AIModelProvider[] = enabled) =>
  parseGenerateRequest(typeof body === "string" ? body : JSON.stringify(body), {
    enabledProviders: providers,
  });

describe("parseGenerateRequest", () => {
  it("accepts a minimal valid request and trims the prompt", () => {
    const result = parse({ prompt: "  draw a login flow  " });
    expect(result).toEqual({
      ok: true,
      request: expect.objectContaining({
        prompt: "draw a login flow",
        provider: "gemini",
      }),
    });
  });

  it.each([
    ["not json", "{nope", 400],
    ["json array", "[1,2]", 400],
    ["missing prompt", {}, 400],
    ["non-string prompt", { prompt: 42 }, 400],
    ["blank prompt", { prompt: "   " }, 400],
    ["huge prompt", { prompt: "x".repeat(MAX_PROMPT_CHARS + 1) }, 400],
    ["unknown provider", { prompt: "a", provider: "skynet" }, 400],
    ["disabled provider", { prompt: "a", provider: "openai" }, 400],
    ["bad whiteboard id", { prompt: "a", whiteboardId: "../../etc" }, 400],
  ])("rejects %s", (_name, body, status) => {
    const result = parse(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(status);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("rejects an oversized body with 413 before parsing it", () => {
    const result = parse("x".repeat(MAX_BODY_BYTES + 1));
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("uses provider, then the legacy model alias, then the first enabled provider", () => {
    expect(parse({ prompt: "a", provider: "groq" })).toMatchObject({
      request: { provider: "groq" },
    });
    expect(parse({ prompt: "a", model: "groq" })).toMatchObject({
      request: { provider: "groq" },
    });
    expect(parse({ prompt: "a" }, ["groq"])).toMatchObject({
      request: { provider: "groq" },
    });
  });

  it("returns 503 when no provider is configured", () => {
    expect(parse({ prompt: "a" }, [])).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("keeps only the known, bounded parts of canvasContext", () => {
    const elements = Array.from({ length: MAX_CONTEXT_ELEMENTS + 50 }, (_, i) => ({
      id: `e${i}`,
      type: "rectangle",
      points: [{ x: 0, y: 0 }],
      color: "#000",
      strokeWidth: 1,
    }));
    const result = parse({
      prompt: "a",
      canvasContext: {
        elements,
        selectedElementIds: ["e1", 7, "e2"],
        viewport: { zoom: 1, panOffset: { x: 0, y: 0 }, width: 10, height: 10 },
        secret: "should be dropped",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ctx = result.request.canvasContext!;
      expect(ctx.elements).toHaveLength(MAX_CONTEXT_ELEMENTS);
      expect(ctx.selectedElementIds).toEqual(["e1", "e2"]);
      expect(ctx).not.toHaveProperty("secret");
    }
  });

  it("drops a malformed canvasContext instead of failing the request", () => {
    const result = parse({ prompt: "a", canvasContext: "nope" });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.request.canvasContext).toBeUndefined();
  });
});

describe("getEnabledProviders", () => {
  it("lists only providers whose credentials are configured", () => {
    expect(
      getEnabledProviders({ GEMINI_API_KEY: "k", OPENAI_API_KEY: "" } as never),
    ).toEqual(["gemini"]);
    expect(
      getEnabledProviders({
        GROQ_API_KEY: "k",
        LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
      } as never),
    ).toEqual(["groq", "local"]);
    expect(getEnabledProviders({} as never)).toEqual([]);
  });
});

describe("createSlidingWindowLimiter", () => {
  it("allows up to max per window per key, then reports Retry-After", () => {
    let now = 1_000_000;
    const limiter = createSlidingWindowLimiter({
      windowMs: 60_000,
      max: 2,
      now: () => now,
    });
    expect(limiter.check("u1").allowed).toBe(true);
    now += 1_000;
    expect(limiter.check("u1").allowed).toBe(true);
    now += 1_000;
    const blocked = limiter.check("u1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(58);
    expect(limiter.check("u2").allowed).toBe(true); // other users unaffected
    now += 59_000; // first hit has aged out
    expect(limiter.check("u1").allowed).toBe(true);
  });

  it("does not grow without bound", () => {
    let now = 0;
    const limiter = createSlidingWindowLimiter({
      windowMs: 1_000,
      max: 1,
      now: () => now,
      maxKeys: 50,
    });
    for (let i = 0; i < 500; i += 1) {
      now += 10;
      limiter.check(`user-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(50);
  });
});
