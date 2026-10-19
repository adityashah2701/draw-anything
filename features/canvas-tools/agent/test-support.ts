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
}) => {
  const mem = createMemoryHost(options.board);
  const turns: Array<{ system: string; messages: readonly CanvasMessage[]; specs: string[] }> = [];
  let step = 0;
  const handler = createCanvasAgentHandler({
    getUserId: async () => "user_1",
    checkBoardAccess: options.checkBoardAccess ?? (async () => ({ ok: true })),
    enabledProviders: () => ["groq"],
    limiter: createSlidingWindowLimiter({ windowMs: 60_000, max: 1_000 }),
    createTransport: (_provider, specs) => ({
      kind: "native",
      complete: async (system: SystemFor, messages) => {
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
        return typeof scripted === "function" ? scripted({ messages, results: fresh, specs: names, step, mem }) : scripted;
      },
    }),
  });
  const fetchImpl = (async (url: string, init: RequestInit) => handler(new Request(`http://localhost${url}`, init))) as unknown as typeof fetch;
  const executor = createCanvasTools({ host: mem.host, session: options.autoApprove ? { autoApproveDestructive: true } : undefined });
  const run: AgentRun = await runCanvasAgent({
    prompt: options.prompt,
    executor,
    callTurn: createTurnClient({ whiteboardId: "board_1", fetchImpl, signal: options.signal }),
    maxSteps: options.maxSteps,
    signal: options.signal,
    onEvent: options.onEvent,
  });
  return { run, mem, turns, executor };
};

export const reply = (text: string, calls: ModelReply["calls"] = []): ModelReply => ({ text, calls });
export const enable = (...groups: string[]) => call("enable_tools", { groups });
export const call = (name: string, args: unknown = {}, id?: string): ModelReply["calls"][number] => ({ name, args, ...(id ? { id } : {}) });
