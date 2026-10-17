import { UnparseableModelOutputError } from "@/features/ai/server/errors";
import { withRetry, type RetryOptions } from "@/features/ai/server/retry";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { checkDiagram } from "./tools/check-diagram";
import { runTool } from "./tools/index";
import type { AgentMessage, ModelTurn, ToolCall, ToolTransport } from "./types";

const DEFAULT_MAX_TURNS = 4;
/** Extra turns granted for turns that only searched icons. */
const MAX_LOOKUP_TURNS = 3;
/** Stop when what would be resent (after `compactHistory`) exceeds this many characters, about 7.5k tokens. */
const MAX_CONVERSATION_CHARS = 30_000;

export type AgentProgress =
  | { type: "model.turn"; turn: number }
  | { type: "tool"; name: ToolCall["name"]; turn: number }
  | { type: "fallback"; from: string; to: string };

export interface AgentRunInput {
  transport: ToolTransport;
  system: string;
  user: string;
  maxTurns?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
  retry?: Partial<RetryOptions>;
}

export interface AgentResult {
  /** The diagram code to compile. */
  code: string;
  /** The model called `finish` with a diagram that parsed. False when the budget ran out. */
  finished: boolean;
  turns: number;
  transport: ToolTransport["kind"];
  /** Tool names in the order they were called, for telemetry and the eval. */
  toolTrail: string[];
}

interface Candidate {
  code: string;
  errors: number;
  nodes: number;
}

const evaluate = (code: string): Candidate => {
  const parsed = parseDiagramCode(code);
  return { code, errors: parsed.issues.filter((i) => i.severity === "error").length, nodes: parsed.nodes.length };
};

const OMITTED = "(earlier draft omitted to save space)";
const OLD_TEXT_CHARS = 400;
const OLD_REVIEW_CHARS = 600;

/**
 * What is actually sent to the model. History is resent every turn, and a provider with a small
 * per-request token limit (Groq's free tier) fails once old drafts pile up. So everything before the
 * model's latest reply is shrunk, never dropped: diagram code in old tool calls and replies is replaced by
 * a marker and long reviews are cut, but every call, every tool answer (an icon lookup is small and the
 * model must not repeat it) and every pairing of a call with its result stays. Dropping whole turns made
 * the model forget its lookups and repeat them until the turns ran out.
 */
export const compactHistory = (messages: readonly AgentMessage[]): AgentMessage[] => {
  let lastAssistant = -1;
  for (let i = messages.length - 1; i >= 2; i -= 1) {
    if (messages[i].role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  return messages.map((message, i) => {
    if (i < 2 || i >= lastAssistant) return message;
    switch (message.role) {
      case "assistant":
        return {
          ...message,
          content: message.content.length > OLD_TEXT_CHARS ? OMITTED : message.content,
          toolCalls: message.toolCalls?.map((call) => (call.name === "search_icons" ? call : { ...call, arg: OMITTED })),
        };
      case "tool":
        return message.name === "search_icons" || message.content.length <= OLD_REVIEW_CHARS
          ? message
          : { ...message, content: `${message.content.slice(0, OLD_REVIEW_CHARS)}…` };
      default:
        return message.content.length > OLD_REVIEW_CHARS ? { ...message, content: `${message.content.slice(0, OLD_REVIEW_CHARS)}…` } : message;
    }
  });
};

const FORMAT_REMINDER =
  "Reply with the diagram as diagram code (not JSON, not Mermaid) and call finish with it. Example line: `API [icon: api] > DB [icon: postgres]`.";

const abortError = () => Object.assign(new Error("Generation cancelled"), { name: "AbortError" });

/**
 * The whole generation: the model drafts diagram code, may look up icons and check the layout, and
 * ends by calling `finish`. Any version that parsed is kept, so running out of turns, a model that
 * never calls `finish`, or one bad reply degrade to "use the best draft", not to an error. Only
 * "nothing readable was ever produced" throws.
 */
export const runDiagramAgent = async (input: AgentRunInput): Promise<AgentResult> => {
  const { transport, signal, onProgress } = input;
  const baseTurns = Math.max(1, input.maxTurns ?? DEFAULT_MAX_TURNS);
  // Turns spent only looking up icons do not use up the budget (up to MAX_LOOKUP_TURNS of them): the model
  // that asks one question per turn would otherwise run out before it writes anything.
  let maxTurns = baseTurns;
  let lookupTurns = 0;
  const messages: AgentMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ];
  const toolTrail: string[] = [];
  let best: Candidate | undefined;
  let lastReply = "";
  let used = 0;

  const consider = (code: string | undefined) => {
    if (!code || !code.trim()) return;
    const c = evaluate(code);
    if (c.nodes === 0) return;
    // Fewer errors wins; on a tie the later version (the model's most recent thinking) wins.
    if (!best || c.errors <= best.errors) best = c;
  };

  const result = (finished: boolean, turns: number): AgentResult => ({
    code: best!.code,
    finished,
    turns,
    transport: transport.kind,
    toolTrail,
  });

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    if (signal?.aborted) throw abortError();
    used = turn;
    onProgress?.({ type: "model.turn", turn });

    const reply: ModelTurn = await withRetry(
      () => transport.complete(compactHistory(messages), { signal }),
      { maxAttempts: 3, baseDelayMs: 800, ...input.retry },
    );
    if (signal?.aborted) throw abortError();
    lastReply = reply.text;
    messages.push({ role: "assistant", content: reply.text, toolCalls: reply.toolCalls.length > 0 ? reply.toolCalls : undefined });
    consider(reply.code);

    if (reply.toolCalls.length === 0) {
      // A truncated reply may be cut mid-diagram yet still parse: never accept it as final.
      const clean = !reply.truncated && reply.code ? evaluate(reply.code) : undefined;
      if (reply.code && clean && clean.errors === 0 && clean.nodes > 0) {
        // A clean diagram without a finish call: accept it, but let the review run once if there is time.
        if (turn < maxTurns && turn === 1) {
          const report = checkDiagram(reply.code);
          if (report.advice.length > 0) {
            toolTrail.push("check_diagram");
            messages.push({ role: "user", content: `Review of your diagram:\n${report.text}\nImprove it if the review is right, then call finish with the final diagram.` });
            continue;
          }
        }
        return result(true, turn);
      }
      messages.push({
        role: "user",
        content: reply.truncated
          ? `Your reply was cut off. Send the complete diagram, shorter if needed. ${FORMAT_REMINDER}`
          : reply.code
            ? `That diagram has errors:\n${checkDiagram(reply.code).text}\n${FORMAT_REMINDER}`
            : FORMAT_REMINDER,
      });
      continue;
    }

    let accepted = false;
    for (const call of reply.toolCalls) {
      onProgress?.({ type: "tool", name: call.name, turn });
      toolTrail.push(call.name);
      const outcome = runTool(call);
      consider(outcome.code);
      messages.push({ role: "tool", name: call.name, content: outcome.content, callId: call.id });
      if (outcome.accepted) accepted = true;
    }
    if (accepted) return result(true, turn);

    const lookupOnly = reply.toolCalls.every((call) => call.name === "search_icons");
    if (lookupOnly && lookupTurns < MAX_LOOKUP_TURNS) {
      lookupTurns += 1;
      maxTurns += 1;
    }
    // Lookups alone never make a diagram. A model that keeps searching gets told once it has enough.
    if (!best && lookupOnly && lookupTurns >= 2 && turn < maxTurns) {
      messages.push({ role: "user", content: `You have the icon ids you need. Write the complete diagram code now and call check_diagram or finish with it. ${FORMAT_REMINDER}` });
    }

    if (compactHistory(messages).reduce((n, m) => n + m.content.length, 0) > MAX_CONVERSATION_CHARS) break;
  }

  if (best) return result(false, used);
  throw new UnparseableModelOutputError(lastReply.trim() ? "not-json" : "empty", lastReply.slice(0, 500));
};
