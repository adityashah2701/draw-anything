import type {
  AIGenerateDiagramRequest,
  AIModelProvider,
} from "@/features/ai/types";

export const MAX_PROMPT_CHARS = 4_000;
export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_CONTEXT_ELEMENTS = 500;
const MAX_ID_LIST = 500;

const ALL_PROVIDERS: readonly AIModelProvider[] = [
  "gemini",
  "groq",
  "openai",
  "anthropic",
  "openrouter",
  "nvidia",
  "local",
];

const PROVIDER_ENV: Record<AIModelProvider, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  // The local provider needs no key; it is enabled by pointing it at a server.
  local: "LOCAL_AI_BASE_URL",
};

/** Providers this server can actually call, in a stable order. */
export const getEnabledProviders = (
  env: Record<string, string | undefined> = process.env,
): AIModelProvider[] => ALL_PROVIDERS.filter((p) => Boolean(env[PROVIDER_ENV[p]]));

export type ParseResult =
  | { ok: true; request: AIGenerateDiagramRequest }
  /** `message` is for the client; `detail` (if any) is for the server log only. */
  | { ok: false; status: number; message: string; detail?: string };

const fail = (status: number, message: string, detail?: string): ParseResult => ({
  ok: false,
  status,
  message,
  ...(detail ? { detail } : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Keep only the parts of the canvas context the pipeline reads, bounded in
 * size. The context is advisory, so a malformed one is dropped, not fatal.
 */
const sanitizeCanvasContext = (
  value: unknown,
): AIGenerateDiagramRequest["canvasContext"] => {
  if (!isRecord(value)) return undefined;
  const context: NonNullable<AIGenerateDiagramRequest["canvasContext"]> = {};

  if (Array.isArray(value.elements)) {
    context.elements = value.elements
      .filter(isRecord)
      .slice(0, MAX_CONTEXT_ELEMENTS) as never;
  }
  if (Array.isArray(value.selectedElementIds)) {
    context.selectedElementIds = value.selectedElementIds
      .filter((id): id is string => typeof id === "string" && id.length <= 80)
      .slice(0, MAX_ID_LIST);
  }
  const viewport = value.viewport;
  if (
    isRecord(viewport) &&
    isFiniteNumber(viewport.zoom) &&
    isFiniteNumber(viewport.width) &&
    isFiniteNumber(viewport.height) &&
    isRecord(viewport.panOffset) &&
    isFiniteNumber(viewport.panOffset.x) &&
    isFiniteNumber(viewport.panOffset.y)
  ) {
    context.viewport = {
      zoom: viewport.zoom,
      width: viewport.width,
      height: viewport.height,
      panOffset: { x: viewport.panOffset.x, y: viewport.panOffset.y },
    };
  }
  return context;
};

export const parseGenerateRequest = (
  rawBody: string,
  options: { enabledProviders: readonly AIModelProvider[] },
): ParseResult => {
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return fail(413, "Request is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return fail(400, "Request body must be valid JSON.");
  }
  if (!isRecord(body)) return fail(400, "Request body must be a JSON object.");

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return fail(400, "Prompt is required.");
  }
  const prompt = body.prompt.trim();
  if (prompt.length > MAX_PROMPT_CHARS) {
    return fail(400, `Prompt must be at most ${MAX_PROMPT_CHARS} characters.`);
  }

  if (options.enabledProviders.length === 0) {
    return fail(503, "No AI provider is configured on this server.");
  }
  // `model` is a legacy alias: it has always carried the provider name.
  const requested = body.provider ?? body.model;
  let provider: AIModelProvider;
  if (requested === undefined || requested === null || requested === "") {
    provider = options.enabledProviders.includes("gemini")
      ? "gemini"
      : options.enabledProviders[0];
  } else if (
    typeof requested !== "string" ||
    !ALL_PROVIDERS.includes(requested as AIModelProvider)
  ) {
    return fail(400, "Unsupported AI provider.");
  } else if (!options.enabledProviders.includes(requested as AIModelProvider)) {
    return fail(
      400,
      "That AI provider is not available on this server.",
      `"${requested}" was requested but ${PROVIDER_ENV[requested as AIModelProvider]} is not set in the server environment ` +
        `(enabled: ${options.enabledProviders.join(", ") || "none"}). Set it in .env.local and restart the dev server.`,
    );
  } else {
    provider = requested as AIModelProvider;
  }

  let whiteboardId: string | undefined;
  if (body.whiteboardId !== undefined && body.whiteboardId !== null) {
    if (
      typeof body.whiteboardId !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(body.whiteboardId)
    ) {
      return fail(400, "Invalid whiteboard id.");
    }
    whiteboardId = body.whiteboardId;
  }

  return {
    ok: true,
    request: {
      prompt,
      provider,
      model: provider,
      whiteboardId,
      ...(body.edit === true ? { edit: true } : {}),
      canvasContext: sanitizeCanvasContext(body.canvasContext),
    },
  };
};

export interface SlidingWindowLimiter {
  check: (key: string) => { allowed: boolean; retryAfterSeconds: number };
  size: () => number;
}

/**
 * In-memory sliding-window limiter. It is per server instance: on a
 * multi-instance deployment each instance enforces its own budget, so use a
 * shared store if a global limit is required.
 */
export const createSlidingWindowLimiter = ({
  windowMs,
  max,
  now = Date.now,
  maxKeys = 10_000,
}: {
  windowMs: number;
  max: number;
  now?: () => number;
  maxKeys?: number;
}): SlidingWindowLimiter => {
  const hits = new Map<string, number[]>();

  const prune = (current: number) => {
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || stamps[stamps.length - 1] <= current - windowMs) {
        hits.delete(key);
      }
    }
    // Still too many distinct keys: drop the least recently active ones.
    if (hits.size >= maxKeys) {
      const oldestFirst = [...hits.entries()].sort(
        (a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1],
      );
      for (const [key] of oldestFirst.slice(0, hits.size - maxKeys + 1)) {
        hits.delete(key);
      }
    }
  };

  return {
    check: (key) => {
      const current = now();
      if (hits.size >= maxKeys) prune(current);
      const stamps = (hits.get(key) ?? []).filter((t) => t > current - windowMs);
      if (stamps.length >= max) {
        hits.set(key, stamps);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((stamps[0] + windowMs - current) / 1000),
          ),
        };
      }
      stamps.push(current);
      hits.set(key, stamps);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size: () => hits.size,
  };
};
