import { pickDefaultProvider } from "@/features/ai/default-provider";
import { normalizeArgs } from "../args";
import { unknownToolMessage } from "../tool-names";
import { isSelectableNvidiaModel, modelSupportsVision } from "@/features/ai/nvidia-models";
import { getAIModelProviderConfig } from "@/features/ai/server/model-providers";
import type { AIModelProvider } from "@/features/ai/types";
import { toUserFacingMessage } from "@/features/ai/server/errors";
import { MAX_BODY_BYTES, type SlidingWindowLimiter } from "@/features/ai/server/request-guard";
import { buildTools, specsFor } from "../registry";
import { describeIssues } from "../schemas";
import { TOOL_GROUPS, toolEnabled, type ToolDefinition, type ToolGroup } from "../types";
import { buildSystemPrompt, type MemoryNote } from "./prompt";
import type { CanvasTransport, ModelReply } from "./transport";
import { MAX_TOTAL_IMAGE_CHARS, countImages } from "./images";
import { MAX_CALLS_PER_TURN, MAX_THINKING_CHARS, MAX_TURN_CHARS, messageChars, turnRequestSchema, type CanvasTurn } from "./types";

export interface CanvasAgentLog {
  event: "canvas_agent_turn";
  provider?: AIModelProvider;
  transport?: string;
  ok: boolean;
  status: number;
  calls: string[];
  ms: number;
}

export interface CanvasAgentHandlerDeps {
  /** The signed-in user's id, or null. */
  getUserId: () => Promise<string | null>;
  /** May this user edit this whiteboard? Resolves with an HTTP-style verdict; it must fail closed. */
  checkBoardAccess: (input: { userId: string; whiteboardId: string }) => Promise<{ ok: true } | { ok: false; status: number; message: string }>;
  enabledProviders: () => readonly AIModelProvider[];
  limiter: SlidingWindowLimiter;
  /** Runs one model turn for the provider; the route wires the real provider abstraction, tests a scripted model. */
  createTransport: (provider: AIModelProvider, specs: ReturnType<typeof specsFor>, model?: string, vision?: boolean) => CanvasTransport;
  /** The notes saved for this board, read as the signed-in user. A failure only means the prompt carries no memory. */
  loadMemories?: (input: { userId: string; whiteboardId: string }) => Promise<readonly MemoryNote[]>;
  /** The summary of earlier turns of this board's conversation. A failure only means the prompt carries none. */
  loadSummary?: (input: { userId: string; whiteboardId: string }) => Promise<string | null>;
  /** Provider used when the request names none. */
  defaultProvider?: () => AIModelProvider | undefined;
  /** Structured log sink: events carry names and counts only, never arguments, content or keys. */
  log?: (event: CanvasAgentLog) => void;
  now?: () => number;
}

const json = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const fail = (status: number, error: string, headers?: Record<string, string>) => json(status, { error }, headers);

/** What a client may see about a failure: a friendly sentence for known errors, a generic one otherwise (no payloads, URLs or keys). */
const publicMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (error instanceof Error && error.name === "MissingAIProviderKeyError") return "The selected AI provider is not configured on this server.";
  if (/timeout|timed out/i.test(raw)) return "The AI provider timed out. Please try again.";
  const friendly = toUserFacingMessage(error);
  return friendly === raw ? "The assistant could not complete this step. Please try again." : friendly;
};

const asArgs = (args: unknown): unknown => {
  if (typeof args !== "string") return args ?? {};
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

/**
 * The model's calls for this turn, each checked against the allowlist, the groups enabled (counting an
 * `enable_tools` call earlier in the same reply) and the tool's schema. A call that fails a check is still
 * returned, with `problem`, so the client can answer the model with the reason instead of losing the call.
 */
export const checkModelCalls = (reply: ModelReply, tools: readonly ToolDefinition[], enabled: ReadonlySet<ToolGroup>, newId: () => string): CanvasTurn["calls"] => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const offered = new Set(tools.map((tool) => tool.group));
  const on = new Set(enabled);
  return reply.calls.slice(0, MAX_CALLS_PER_TURN).map((call) => {
    const id = call.id && call.id.length <= 80 ? call.id : newId();
    const tool = byName.get(call.name);
    if (!tool) return { id, name: call.name, args: call.args, problem: { code: "unknown_tool" as const, message: unknownToolMessage(call.name, tools, on) } };
    if (!toolEnabled(tool, on)) {
      return { id, name: tool.name, args: call.args, problem: { code: "tool_not_enabled" as const, message: `"${tool.name}" belongs to the "${tool.group}" tools, which are not enabled. Call enable_tools with {"groups":["${tool.group}"]} first.` } };
    }
    const args = asArgs(call.args);
    const parsed = tool.input.safeParse(normalizeArgs(tool, args).args);
    if (!parsed.success) return { id, name: tool.name, args, problem: { code: "invalid_arguments" as const, message: `Invalid arguments for ${tool.name}: ${describeIssues(parsed.error)}.` } };
    if (tool.name === "enable_tools") for (const group of (parsed.data as { groups: ToolGroup[] }).groups) if (offered.has(group)) on.add(group);
    return { id, name: tool.name, args };
  });
};

let counter = 0;

/**
 * `POST /api/ai/canvas-agent`: ONE stateless model turn. It authenticates, checks the person may use the
 * board, rate limits, validates the conversation, builds the system prompt itself, asks the model, and
 * returns the model's text and its tool calls (validated). The browser runs the calls against the live
 * board and posts the results back for the next turn. The provider key never leaves this process.
 */
export const createCanvasAgentHandler = (deps: CanvasAgentHandlerDeps) => {
  const now = deps.now ?? Date.now;
  const tools = buildTools(() => undefined);

  return async (req: Request): Promise<Response> => {
    const started = now();
    const base: Pick<CanvasAgentLog, "event" | "calls"> = { event: "canvas_agent_turn", calls: [] };
    const done = (response: Response, extra: Partial<CanvasAgentLog> = {}) => {
      deps.log?.({ ...base, ok: response.status < 400, status: response.status, ms: now() - started, ...extra });
      return response;
    };

    const userId = await deps.getUserId();
    if (!userId) return done(fail(401, "Sign in to use the assistant."));

    const limit = deps.limiter.check(userId);
    if (!limit.allowed) return done(fail(429, "Too many requests. Please wait a moment.", { "Retry-After": String(limit.retryAfterSeconds) }));

    let body: string;
    try {
      body = await req.text();
    } catch {
      return done(fail(400, "Request body could not be read."));
    }
    if (body.length > MAX_BODY_BYTES + MAX_TOTAL_IMAGE_CHARS) return done(fail(413, "The request is too large."));
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return done(fail(400, "The request is not valid JSON."));
    }
    const parsed = turnRequestSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[canvas-agent] request rejected:", describeIssues(parsed.error));
      return done(fail(400, "The request is not valid."));
    }
    const request = parsed.data;
    const first = request.messages[0];
    const last = request.messages[request.messages.length - 1];
    if (first.role !== "user" || last.role === "assistant") return done(fail(400, "The conversation must start with the user and end with a user or tool message."));
    // Images count against their own budget; the text of the conversation keeps the ordinary one.
    if (body.length - request.messages.reduce((sum, m) => sum + (m.role === "user" ? (m.images ?? []).reduce((n, i) => n + i.length, 0) : 0), 0) > MAX_BODY_BYTES) return done(fail(413, "The request is too large."));
    if (request.messages.reduce((sum, message) => sum + messageChars(message), 0) > MAX_TURN_CHARS) return done(fail(413, "The conversation is too long. Start a new one."));

    const access = await deps.checkBoardAccess({ userId, whiteboardId: request.whiteboardId });
    if (!access.ok) return done(fail(access.status, access.message));

    const enabledProviders = deps.enabledProviders();
    const provider = request.provider ?? deps.defaultProvider?.() ?? pickDefaultProvider(enabledProviders);
    if (!provider || !enabledProviders.includes(provider)) return done(fail(400, "That AI provider is not available on this server."));

    // A model is a variant of the NVIDIA provider; anything not on its list is refused, never forwarded. The request must name the provider itself; the default provider does not imply one.
    if (request.model !== undefined && (request.provider !== "nvidia" || !isSelectableNvidiaModel(request.model))) return done(fail(400, "That AI model is not available."), { provider });

    // Images only ever go to a model that can read them. A text-only choice that has a vision sibling (the GLM models,
    // Groq's default) is swapped for it, and the person is told; a provider with none refuses.
    const images = countImages(request.messages);
    let notice: string | undefined;
    if (images > 0) {
      if (provider === "local") return done(fail(400, "The local model cannot read images. Remove the images or choose another model."), { provider });
      try {
        const chosen = getAIModelProviderConfig(provider, { model: request.model });
        const seen = getAIModelProviderConfig(provider, { model: request.model, vision: true });
        if (seen.modelName !== chosen.modelName || !modelSupportsVision(provider, request.model)) {
          notice = `${chosen.displayName} cannot read images, so ${seen.displayName === chosen.displayName ? seen.modelName : seen.displayName} was used for this request.`;
        }
      } catch {
        // Unknown configuration: the transport decides; there is just no notice.
      }
    }

    const groups = new Set<ToolGroup>(["inspect", ...(request.enabledGroups ?? [])].filter((group): group is ToolGroup => TOOL_GROUPS.includes(group as ToolGroup)));
    const specs = specsFor(tools, groups);

    let memories: readonly MemoryNote[] = [];
    if (deps.loadMemories) {
      try {
        memories = await deps.loadMemories({ userId, whiteboardId: request.whiteboardId });
      } catch (error) {
        console.warn("[canvas-agent] board memory unavailable, continuing without it:", error instanceof Error ? error.message : error);
      }
    }

    let summary: string | null = null;
    if (deps.loadSummary) {
      try {
        summary = await deps.loadSummary({ userId, whiteboardId: request.whiteboardId });
      } catch (error) {
        console.warn("[canvas-agent] conversation summary unavailable, continuing without it:", error instanceof Error ? error.message : error);
      }
    }

    try {
      const transport = deps.createTransport(provider, specs, request.model, images > 0);
      const reply = await transport.complete(
        (kind) => buildSystemPrompt({ groups: [...groups], specs, protocol: kind, memories, summary }),
        request.messages,
      );
      const calls = checkModelCalls(reply, tools, groups, () => `call_${now().toString(36)}_${(counter += 1).toString(36)}`);
      const turn: CanvasTurn = { text: reply.text, calls, transport: transport.kind, ...(reply.thinking ? { thinking: reply.thinking.slice(0, MAX_THINKING_CHARS) } : {}), ...(notice ? { notice } : {}) };
      return done(json(200, turn), { provider, ...(request.model ? { model: request.model } : {}), transport: transport.kind, calls: calls.map((call) => call.name) });
    } catch (error) {
      console.error("[canvas-agent] model turn failed:", error);
      return done(fail(502, publicMessage(error)), { provider });
    }
  };
};

