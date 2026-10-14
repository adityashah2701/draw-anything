import type {
  AIGenerateDiagramRequest,
  AIModelProvider,
  AIStreamEvent,
} from "@/features/ai/types";
import { encodeSse, toV1CompatibilityEvents } from "@/features/ai/server/sse";
import { toUserFacingMessage } from "@/features/ai/server/errors";
import {
  type SlidingWindowLimiter,
  parseGenerateRequest,
} from "@/features/ai/server/request-guard";

export interface GenerateDiagramHandlerDeps {
  /** Resolves the signed-in user's id, or null for anonymous callers. */
  getUserId: () => Promise<string | null>;
  enabledProviders: () => readonly AIModelProvider[];
  limiter: SlidingWindowLimiter;
  runWorkflow: (
    request: AIGenerateDiagramRequest,
  ) => AsyncIterable<AIStreamEvent>;
  /** Pause after each element batch so the canvas animates; 0 disables it. */
  pacingMs?: number;
}

const GENERIC_FAILURE = "AI generation failed. Please try again.";

const json = (status: number, error: string, headers?: Record<string, string>) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/**
 * What a client may see about a failure. Typed and recognised provider errors
 * get a friendly sentence; everything else is replaced by a generic one so
 * provider payloads, URLs or credentials never reach the browser.
 */
export const toPublicErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (error instanceof Error && error.name === "MissingAIProviderKeyError") {
    return "The selected AI provider is not configured on this server.";
  }
  if (/timeout|timed out/i.test(raw)) {
    return "The AI provider timed out. Please try again with a simpler request.";
  }
  const friendly = toUserFacingMessage(error);
  return friendly === raw ? GENERIC_FAILURE : friendly;
};

export const createGenerateDiagramHandler =
  (deps: GenerateDiagramHandlerDeps) =>
  async (req: Request): Promise<Response> => {
    const userId = await deps.getUserId();
    if (!userId) return json(401, "Sign in to generate diagrams.");

    const limit = deps.limiter.check(userId);
    if (!limit.allowed) {
      return json(429, "Too many requests. Please wait before generating again.", {
        "Retry-After": String(limit.retryAfterSeconds),
      });
    }

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return json(400, "Request body could not be read.");
    }
    const parsed = parseGenerateRequest(rawBody, {
      enabledProviders: deps.enabledProviders(),
    });
    if (!parsed.ok) {
      if (parsed.detail) console.warn("[ai-generate-diagram] Request rejected:", parsed.detail);
      return json(parsed.status, parsed.message);
    }

    const encoder = new TextEncoder();
    const pacingMs = deps.pacingMs ?? 50;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let activeFrameId = `ai_frame_error_${Date.now()}`;
        let closed = false;
        const write = (event: unknown) => {
          if (closed || cancelled) return;
          controller.enqueue(encoder.encode(encodeSse(event)));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // The client already cancelled; nothing left to close.
          }
        };

        try {
          for await (const event of deps.runWorkflow(parsed.request)) {
            if (cancelled) break; // leaving the loop calls the generator's return()
            if ("frameId" in event) {
              activeFrameId = event.frameId;
            } else if (event.type === "frame.created") {
              activeFrameId = event.frame.frameId;
            }
            write(event);
            for (const compat of toV1CompatibilityEvents(event)) write(compat);
            if (event.type === "element.batch" && pacingMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, pacingMs));
            }
          }
        } catch (error) {
          console.error("[ai-generate-diagram] Workflow error:", error);
          const message = toPublicErrorMessage(error);
          write({ type: "frame.error", frameId: activeFrameId, message });
          write({ type: "error", message });
        } finally {
          close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };

/** Which providers this server can call, for the provider picker. Sign-in required. */
export const createProvidersHandler =
  (deps: Pick<GenerateDiagramHandlerDeps, "getUserId" | "enabledProviders">) =>
  async (): Promise<Response> => {
    const userId = await deps.getUserId();
    if (!userId) return json(401, "Sign in to generate diagrams.");
    return new Response(JSON.stringify({ providers: deps.enabledProviders() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  };
