import type { ToolExecutor } from "../executor";
import type { ToolGroup, ToolResult } from "../types";
import { formatResultForModel } from "./format";
import { suggestGroups } from "./groups";
import type { CanvasMessage, CanvasToolCall, CanvasTurn } from "./types";

export type AgentEvent =
  | { type: "turn"; step: number }
  | { type: "assistant"; text: string }
  | { type: "tool"; step: number; call: CanvasToolCall; result: ToolResult }
  | { type: "finished"; run: AgentRun };

export interface AgentRun {
  status: "done" | "max_steps" | "stalled" | "aborted" | "error";
  /** The assistant's closing words (empty when the run stopped for another reason). */
  text: string;
  error?: string;
  steps: number;
  results: ToolResult[];
  /** Totals taken from the actual results, not from what the model says. */
  totals: { calls: number; failed: number; created: number; updated: number; removed: number };
  messages: CanvasMessage[];
}

export interface RunAgentOptions {
  prompt: string;
  /** Earlier turns of the same conversation. */
  history?: readonly CanvasMessage[];
  executor: ToolExecutor;
  callTurn: (input: { messages: CanvasMessage[]; enabledGroups: ToolGroup[] }) => Promise<CanvasTurn>;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

const DEFAULT_MAX_STEPS = 12;
/** The same failing call this many times in a row ends the run instead of looping. */
const STALL_LIMIT = 3;

const tally = (results: readonly ToolResult[]) => ({
  calls: results.length,
  failed: results.filter((r) => !r.ok).length,
  created: results.reduce((n, r) => n + r.affected.created.length, 0),
  updated: results.reduce((n, r) => n + r.affected.updated.length, 0),
  removed: results.reduce((n, r) => n + r.affected.removed.length, 0),
});

/**
 * The agent loop, in the browser: ask the server for a model turn, run the calls it returns against the live
 * board (in order, one at a time), send the results back, and repeat until the model stops calling tools.
 * What it reports comes from the tool results. It never talks to a model or holds a key.
 */
export const runCanvasAgent = async (options: RunAgentOptions): Promise<AgentRun> => {
  const { executor, callTurn, onEvent, signal } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const messages: CanvasMessage[] = [...(options.history ?? []), { role: "user", content: options.prompt }];
  const results: ToolResult[] = [];
  executor.enable(suggestGroups(options.prompt));

  const finish = (status: AgentRun["status"], text = "", error?: string, steps = 0): AgentRun => {
    const run: AgentRun = { status, text, ...(error ? { error } : {}), steps, results, totals: tally(results), messages };
    onEvent?.({ type: "finished", run });
    return run;
  };

  let lastFailure = "";
  let repeated = 0;

  for (let step = 1; step <= maxSteps; step += 1) {
    if (signal?.aborted) return finish("aborted", "", undefined, step - 1);
    onEvent?.({ type: "turn", step });

    let turn: CanvasTurn;
    try {
      turn = await callTurn({ messages: [...messages], enabledGroups: [...executor.session.enabledGroups] });
    } catch (error) {
      if (signal?.aborted) return finish("aborted", "", undefined, step - 1);
      return finish("error", "", error instanceof Error ? error.message : "The assistant could not be reached.", step - 1);
    }
    if (signal?.aborted) return finish("aborted", "", undefined, step);

    // Ids are made unique across turns (providers may reuse "call_1"), so a retried id is never mistaken for a replay.
    const calls: CanvasToolCall[] = turn.calls.map((call, index) => ({ id: `s${step}_${index}_${call.id}`.slice(0, 80), name: call.name, args: call.args }));
    messages.push({ role: "assistant", content: turn.text, ...(calls.length > 0 ? { toolCalls: calls } : {}) });
    if (turn.text.trim()) onEvent?.({ type: "assistant", text: turn.text });
    if (calls.length === 0) return finish("done", turn.text, undefined, step);

    const stepResults = await executor.executeAll(calls.map((call) => ({ id: call.id, name: call.name, args: call.args })));
    calls.forEach((call, index) => {
      const result = stepResults[index];
      results.push(result);
      messages.push({ role: "tool", callId: call.id, name: call.name, content: formatResultForModel(result) });
      onEvent?.({ type: "tool", step, call, result });
    });

    const failures = stepResults.filter((r) => !r.ok);
    const signature = failures.length === stepResults.length ? failures.map((r) => `${r.tool}:${r.error?.code}`).join("|") : "";
    if (signature && signature === lastFailure) repeated += 1;
    else repeated = signature ? 1 : 0;
    lastFailure = signature;
    if (repeated >= STALL_LIMIT) return finish("stalled", turn.text, "The assistant kept repeating a call that fails, so it was stopped.", step);
  }
  return finish("max_steps", "", `Stopped after ${maxSteps} steps without finishing. The changes made so far are on the board.`, maxSteps);
};

/** One plain sentence about what really happened, from the tool results. */
export const describeRun = (run: AgentRun): string => {
  const { totals } = run;
  const changes = [totals.created ? `${totals.created} added` : "", totals.updated ? `${totals.updated} changed` : "", totals.removed ? `${totals.removed} removed` : ""].filter(Boolean).join(", ");
  const parts = [changes || "no board changes", `${totals.calls} tool call${totals.calls === 1 ? "" : "s"}${totals.failed ? `, ${totals.failed} failed` : ""}`];
  return parts.join(" · ");
};
