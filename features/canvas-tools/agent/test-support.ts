import { createSlidingWindowLimiter } from "@/features/ai/server/request-guard";
import { createMemoryHost, type MemoryHostOptions } from "../memory-host";
import { createCanvasTools } from "../runtime";
import type { ToolResult } from "../types";
import { createTurnClient } from "./client";
import { createCanvasAgentHandler } from "./handler";
import { runCanvasAgent, type AgentEvent, type AgentRun } from "./run-agent";
import type { CanvasMessage } from "./types";
import type { ModelReply, SystemFor } from "./transport";

export interface ScriptContext {
  messages: readonly CanvasMessage[];
  /** The results the previous turn's calls produced, parsed. */
  results: ToolResult[];
  specs: string[];
  step: number;
  /** The board, so a script can play a collaborator editing between turns. */
  mem: ReturnType<typeof createMemoryHost>;
}

export type ScriptStep = ModelReply | ((context: ScriptContext) => ModelReply);

/** The real HTTP handler with a scripted model behind it; `mem` is only what a script's context may touch. */
export const createScriptedHandler = (options: {
  script: ScriptStep[];
  mem: ReturnType<typeof createMemoryHost>;
  checkBoardAccess?: Parameters<typeof createCanvasAgentHandler>[0]["checkBoardAccess"];
  enabledProviders?: () => readonly ("groq" | "gemini")[];
  /** Resolves before each model reply: lets a test hold a turn open (to press Stop). */
  beforeReply?: () => Promise<void>;
  fail?: () => Error | null;
  unified?: boolean;
  memories?: Array<{ kind: string; text: string }>;
  summary?: string | null;
}) => {
  const turns: Array<{ system: string; messages: readonly CanvasMessage[]; specs: string[] }> = [];
  let step = 0;
  const handler = createCanvasAgentHandler({
    getUserId: async () => "user_1",
    checkBoardAccess: options.checkBoardAccess ?? (async () => ({ ok: true })),
    enabledProviders: options.enabledProviders ?? (() => ["groq", "gemini"]),
    limiter: createSlidingWindowLimiter({ windowMs: 60_000, max: 1_000 }),
    unifiedAgent: () => options.unified === true,
    loadMemories: async () => options.memories ?? [],
    loadSummary: async () => options.summary ?? null,
    createTransport: (_provider, specs) => ({
      kind: "native",
      complete: async (system: SystemFor, messages) => {
        await options.beforeReply?.();
        const failure = options.fail?.();
        if (failure) throw failure;
        const names = specs.map((s) => s.name);
        turns.push({ system: system("native"), messages, specs: names });
        const scripted = options.script[step] ?? { text: "(script ended)", calls: [] };
        const results = messages
          .slice(-12)
          .filter((m) => m.role === "tool")
          .map((m) => JSON.parse((m as { content: string }).content) as ToolResult);
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant") as { toolCalls?: unknown[] } | undefined;
        const fresh = results.slice(-(lastAssistant?.toolCalls?.length ?? 0));
        step += 1;
        return typeof scripted === "function" ? scripted({ messages, results: fresh, specs: names, step, mem: options.mem }) : scripted;
      },
    }),
  });
  return { handler, turns, steps: () => step };
};

/**
 * Everything but the language model, for real: the HTTP handler (auth, access, validation, prompt, call
 * checking), the turn client, the agent loop, the executor, the tools and the commands, over an in-memory
 * board. Only the model's replies are scripted, so a test says "when the model asks for X, the system does Y".
 */
export const scriptedRun = async (options: {
  prompt: string;
  script: ScriptStep[];
  board?: MemoryHostOptions;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  checkBoardAccess?: Parameters<typeof createCanvasAgentHandler>[0]["checkBoardAccess"];
  autoApprove?: boolean;
  unified?: boolean;
  memories?: Array<{ kind: string; text: string }>;
}) => {
  const mem = createMemoryHost(options.board);
  const { handler, turns } = createScriptedHandler({ script: options.script, mem, checkBoardAccess: options.checkBoardAccess, enabledProviders: () => ["groq"], unified: options.unified, memories: options.memories });
  const fetchImpl = (async (url: string, init: RequestInit) => handler(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch;
  const executor = createCanvasTools({ host: mem.host, session: options.autoApprove ? { autoApproveDestructive: true } : undefined });
  const run: AgentRun = await runCanvasAgent({
    prompt: options.prompt,
    executor,
    callTurn: createTurnClient({ whiteboardId: "board_1", fetchImpl, signal: options.signal }),
    maxSteps: options.maxSteps,
    unified: options.unified,
    signal: options.signal,
    onEvent: options.onEvent,
  });
  return { run, mem, turns, executor };
};

export const reply = (text: string, calls: ModelReply["calls"] = []): ModelReply => ({ text, calls });
export const enable = (...groups: string[]) => call("enable_tools", { groups });
export const call = (name: string, args: unknown = {}, id?: string): ModelReply["calls"][number] => ({ name, args, ...(id ? { id } : {}) });
