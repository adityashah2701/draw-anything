import type { ToolExecutor } from "../executor";
import type { ToolGroup, ToolResult } from "../types";
import { formatResultForModel } from "./format";
import { suggestGroups } from "./groups";
import { stripImages } from "./images";
import type { CanvasMessage, CanvasToolCall, CanvasTurn } from "./types";

export type AgentEvent =
  | { type: "turn"; step: number }
  | { type: "assistant"; text: string }
  /** The model's own reasoning for a turn, when it exposes any. */
  | { type: "thinking"; step: number; text: string }
  /** Something about how a turn ran that the person should see (images read by another model). */
  | { type: "notice"; text: string }
  /** The calls of this step are about to run (a long one, like diagram generation, can take a while). */
  | { type: "calling"; step: number; calls: CanvasToolCall[] }
  | { type: "tool"; step: number; call: CanvasToolCall; result: ToolResult }
  | { type: "finished"; run: AgentRun };

export interface AgentRun {
  status: "done" | "max_steps" | "stalled" | "aborted" | "error";
  /** Which budget ended a "max_steps" run. */
  limit?: "turns" | "tool_calls" | "time";
  /** Problems the final check still found on the board (empty when it was clean, or nothing was changed). */
  remaining?: string[];
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
  /** Images attached to the prompt (`data:` URLs). They go to the model with this run only; the returned messages carry a note instead. */
  images?: string[];
  /** Earlier turns of the same conversation. */
  history?: readonly CanvasMessage[];
  executor: ToolExecutor;
  callTurn: (input: { messages: CanvasMessage[]; enabledGroups: ToolGroup[] }) => Promise<CanvasTurn>;
  /** Model turns (default 40). `maxSteps` is the older name. */
  maxSteps?: number;
  /** Budgets for one run; each can be raised or lowered, none can be switched off. */
  budget?: Partial<RunBudget>;
  /** Called with the current time in ms; tests pass a fake clock. */
  now?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

export interface RunBudget {
  turns: number;
  toolCalls: number;
  /** Time without the board changing (model waits count, work that changes it resets the clock): a hung or looping run, not a slow provider. */
  ms: number;
  /** Absolute ceiling on one run, however much it changes. */
  maxMs: number;
  /** Rounds of "the final check found problems, fix them" before the run ends and reports what is left. */
  verifyRounds: number;
}

/** Enough for a real edit of a large diagram, still bounded: a run that needs more says what is left and can be continued. */
export const DEFAULT_BUDGET: RunBudget = { turns: 40, toolCalls: 120, ms: 5 * 60_000, maxMs: 20 * 60_000, verifyRounds: 2 };
/** The same failing call this many times in a row ends the run instead of looping. */
const STALL_LIMIT = 3;
/** The same call, with the same arguments, on a board that did not change, this many times in a row is no progress. */
const NO_PROGRESS_LIMIT = 4;
/** This many steps in a row where every call named a tool that does not exist ends the run. */
const UNKNOWN_TOOL_LIMIT = 3;

const callKey = (call: CanvasToolCall) => `${call.name}:${JSON.stringify(call.args ?? {})}`;

/** What the final check counts as unfinished work: broken connectors and shapes on top of each other. */
/**
 * One deterministic tidy of what this run created or moved, before the final check: connected nodes onto one line
 * with one even gap. Only those nodes move, so a board the person drew is never rearranged; a model asked to do it
 * by hand tends to nudge things and leave kinks.
 */
const straightenWhatWasMade = async (executor: ToolExecutor, id: string) => {
  const ids = [...executor.session.touched];
  if (ids.length < 2) return;
  const check = await executor.execute({ id: `layout_check_${id}`, name: "validate_diagram", args: {} });
  const issues = check.ok ? (((check.data as { issues?: Array<{ code: string }> } | undefined)?.issues) ?? []) : [];
  if (!issues.some((issue) => issue.code === "misaligned_connection" || issue.code === "uneven_spacing")) return;
  executor.enable(["arrange"]);
  await executor.execute({ id: `layout_tidy_${id}`, name: "tidy_diagram", args: { ids } });
};

const BLOCKING = new Set(["dangling_connector", "stale_connector", "connector_through_node", "overlap", "invalid_geometry", "duplicate_id", "bad_anchor"]);

const tally = (results: readonly ToolResult[]) => ({
  calls: results.length,
  failed: results.filter((r) => !r.ok && r.error?.code !== "cancelled").length,
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
  const now = options.now ?? Date.now;
  const budget: RunBudget = { ...DEFAULT_BUDGET, ...(options.maxSteps !== undefined ? { turns: options.maxSteps } : {}), ...options.budget };
  const startedAt = now();
  let lastProgressAt = startedAt;
  let verifyRounds = 0;
  let wroteSinceCheck = false;
  const messages: CanvasMessage[] = [...(options.history ?? []), { role: "user", content: options.prompt, ...(options.images?.length ? { images: options.images } : {}) }];
  const results: ToolResult[] = [];
  executor.enable(suggestGroups(options.prompt));

  let remaining: string[] = [];
  let limit: AgentRun["limit"];
  const finish = (status: AgentRun["status"], text = "", error?: string, steps = 0): AgentRun => {
    const run: AgentRun = { status, text, ...(error ? { error } : {}), ...(limit ? { limit } : {}), ...(remaining.length > 0 ? { remaining } : {}), steps, results, totals: tally(results), messages: stripImages(messages) };
    onEvent?.({ type: "finished", run });
    return run;
  };

  let lastNotice = "";
  let lastFailure = "";
  let repeated = 0;
  let unknownStreak = 0;
  let lastSignature = "";
  let sameCalls = 0;

  /** Ends the run when a budget is spent, with the work kept and the way to carry on. */
  const exhausted = (kind: NonNullable<AgentRun["limit"]>, steps: number): AgentRun => {
    limit = kind;
    const what = kind === "turns" ? `${budget.turns} model turns` : kind === "tool_calls" ? `${budget.toolCalls} tool calls` : now() - startedAt > budget.maxMs ? `${Math.round((now() - startedAt) / 1000)} seconds in total` : `${Math.round(budget.ms / 1000)} seconds without changing the board`;
    return finish("max_steps", "", `Stopped after ${what} without finishing. The changes made so far are on the board and the work is saved; say "continue" to pick up from the board as it is now.`, steps);
  };

  for (let step = 1; step <= budget.turns; step += 1) {
    if (signal?.aborted) return finish("aborted", "", undefined, step - 1);
    if (now() - lastProgressAt > budget.ms || now() - startedAt > budget.maxMs) return exhausted("time", step - 1);
    if (results.length >= budget.toolCalls) return exhausted("tool_calls", step - 1);
    onEvent?.({ type: "turn", step });

    let turn: CanvasTurn;
    try {
      turn = await callTurn({ messages: [...messages], enabledGroups: [...executor.session.enabledGroups] });
    } catch (error) {
      if (signal?.aborted) return finish("aborted", "", undefined, step - 1);
      return finish("error", "", error instanceof Error ? error.message : "The assistant could not be reached.", step - 1);
    }
    if (signal?.aborted) return finish("aborted", "", undefined, step);
    if (turn.notice && turn.notice !== lastNotice) {
      lastNotice = turn.notice;
      onEvent?.({ type: "notice", text: turn.notice });
    }
    if (turn.thinking?.trim()) onEvent?.({ type: "thinking", step, text: turn.thinking });

    // Ids are made unique across turns (providers may reuse "call_1"), so a retried id is never mistaken for a replay.
    const calls: CanvasToolCall[] = turn.calls.map((call, index) => ({ id: `s${step}_${index}_${call.id}`.slice(0, 80), name: call.name, args: call.args }));
    messages.push({ role: "assistant", content: turn.text, ...(calls.length > 0 ? { toolCalls: calls } : {}) });
    if (turn.text.trim()) onEvent?.({ type: "assistant", text: turn.text });
    if (calls.length === 0) {
      // Never report success from tool responses alone: look at the board once the model says it is finished.
      if (wroteSinceCheck && verifyRounds < budget.verifyRounds) {
        verifyRounds += 1;
        wroteSinceCheck = false;
        await straightenWhatWasMade(executor, `${step}_${verifyRounds}`);
        const check = await executor.execute({ id: `verify_${step}_${verifyRounds}`, name: "validate_diagram", args: {} });
        const issues = check.ok ? (((check.data as { issues?: Array<{ code: string; severity: string; message: string; ids: string[] }> } | undefined)?.issues) ?? []).filter((issue) => BLOCKING.has(issue.code)) : [];
        remaining = issues.map((issue) => `${issue.message} (${issue.ids.slice(0, 5).join(", ")})`);
        if (issues.length > 0) {
          executor.enable(["edit", "arrange", "connect"]);
          messages.push({ role: "user", content: `Automatic check of the board after your changes found problems: ${remaining.join(" | ")} Fix them with the tools (reroute_connector, move_elements, tidy_diagram), or say plainly why they remain, then finish.` });
          onEvent?.({ type: "assistant", text: "Checking the result found problems; fixing them." });
          continue;
        }
        remaining = [];
      }
      return finish("done", turn.text, undefined, step);
    }

    onEvent?.({ type: "calling", step, calls });
    const stepResults = await executor.executeAll(calls.map((call) => ({ id: call.id, name: call.name, args: call.args })));
    calls.forEach((call, index) => {
      const result = stepResults[index];
      results.push(result);
      messages.push({ role: "tool", callId: call.id, name: call.name, content: formatResultForModel(result) });
      onEvent?.({ type: "tool", step, call, result });
    });

    if (stepResults.some((r, index) => r.ok && executor.tools.get(calls[index].name)?.access === "write")) {
      wroteSinceCheck = true;
      lastProgressAt = now();
    }
    // The same calls again on a board that did not change are no progress, however politely they succeed.
    const signatureOfStep = `${stepResults.at(-1)?.revision ?? ""}|${calls.map(callKey).join("&")}`;
    sameCalls = signatureOfStep === lastSignature ? sameCalls + 1 : 1;
    lastSignature = signatureOfStep;
    if (sameCalls >= NO_PROGRESS_LIMIT) return finish("stalled", turn.text, "The assistant kept asking the same thing without changing the board, so it was stopped. Say what to do next, or \"continue\" to try again.", step);

    const failures = stepResults.filter((r) => !r.ok);
    // Guessing names of tools that do not exist, step after step, is a loop the result messages did not break.
    const guessed = failures.filter((r) => r.error?.code === "unknown_tool");
    unknownStreak = guessed.length > 0 && guessed.length === failures.length && failures.length === stepResults.length ? unknownStreak + 1 : 0;
    if (unknownStreak >= UNKNOWN_TOOL_LIMIT) return finish("stalled", turn.text, `The assistant kept calling tools that do not exist (${[...new Set(results.filter((r) => r.error?.code === "unknown_tool").map((r) => r.tool))].slice(-4).join(", ")}), so it was stopped. Try rephrasing the request, or pick another model.`, step);
    const signature = failures.length === stepResults.length ? failures.map((r) => `${r.tool}:${r.error?.code}`).join("|") : "";
    if (signature && signature === lastFailure) repeated += 1;
    else repeated = signature ? 1 : 0;
    lastFailure = signature;
    if (repeated >= STALL_LIMIT) return finish("stalled", turn.text, "The assistant kept repeating a call that fails, so it was stopped.", step);
  }
  return exhausted("turns", budget.turns);
};

/** One plain sentence about what really happened, from the tool results. */
export const describeRun = (run: AgentRun): string => {
  const { totals } = run;
  const changes = [totals.created ? `${totals.created} added` : "", totals.updated ? `${totals.updated} changed` : "", totals.removed ? `${totals.removed} removed` : ""].filter(Boolean).join(", ");
  const parts = [changes || "no board changes", `${totals.calls} tool call${totals.calls === 1 ? "" : "s"}${totals.failed ? `, ${totals.failed} failed` : ""}`, ...(run.remaining?.length ? [`${run.remaining.length} problem${run.remaining.length === 1 ? "" : "s"} left on the board`] : [])];
  return parts.join(" · ");
};
