import { QuotaExceededError, RateLimitError, UnparseableModelOutputError } from "@/features/ai/server/errors";
import { categorizeError, withRetry, type RetryOptions } from "@/features/ai/server/retry";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { runTool } from "../tools/index";
import type { AgentMessage, ModelTurn, ToolCall, ToolTransport } from "../types";
import { buildCanvas, diffElements, type BuiltCanvas, type CanvasDiff } from "./canvas";
import { buildStateMessage } from "./prompt";
import { reportCanvas, type CanvasReport } from "./report";
import { addLines, adjust, createState, describeMoved, type BuilderState } from "./state";

/** Each turn is a model call, and free tiers allow few calls a minute: keep the default small. */
const DEFAULT_MAX_TURNS = 12;
const DEFAULT_MAX_REVIEWS = 2;
/** Turns spent only looking up icons do not use the budget, up to this many. */
const MAX_LOOKUP_TURNS = 3;
/** Replies with neither a tool call nor code, in a row, before the run settles for what is on the canvas. */
const MAX_EMPTY_TURNS = 2;
const PATIENT_RETRY: Partial<RetryOptions> = { maxAttempts: 6, baseDelayMs: 2_000, maxDelayMs: 60_000 };

export interface CanvasUpdate extends CanvasDiff {
  /** Everything now on the canvas. */
  elements: DrawingElement[];
}

export type BuilderStep =
  | { kind: "add"; turn: number; summary: string }
  | { kind: "adjust"; turn: number; summary: string }
  | { kind: "icons"; turn: number; summary: string }
  | { kind: "view"; turn: number; summary: string }
  | { kind: "review"; turn: number; summary: string; problems: string[] };

export interface BuilderInput {
  transport: ToolTransport;
  system: string;
  goal: string;
  generationId: string;
  frameId: string;
  maxTurns?: number;
  maxReviews?: number;
  /** Undo an adjustment that made the picture worse (default on). */
  guardAdjustments?: boolean;
  /** Renders the canvas to an image for a vision model; its absence means the agent works from text alone. */
  renderImage?: (elements: DrawingElement[]) => Promise<string | undefined>;
  signal?: AbortSignal;
  retry?: Partial<RetryOptions>;
  /** Called as soon as a step changed the canvas, so the client can draw it before the next model call. */
  onCanvas?: (update: CanvasUpdate) => void | Promise<void>;
  onStep?: (step: BuilderStep) => void;
}

export interface BuilderResult {
  state: BuilderState;
  built: BuiltCanvas;
  /** The agent called `finish` and it was accepted. False when the budget ran out. */
  finished: boolean;
  turns: number;
  reviews: number;
  /** The provider's quota or rate limit ended the run; what was built so far is kept. */
  stoppedByQuota: boolean;
  toolTrail: string[];
  transport: ToolTransport["kind"];
}

const abortError = () => Object.assign(new Error("Generation cancelled"), { name: "AbortError" });
const NO_CENTRES = { get: () => undefined };

/**
 * Builds a diagram one step at a time on a live canvas. Every turn is a fresh conversation (system
 * prompt plus the current canvas as code, its problems and the last step's notes), so the cost per turn
 * stays flat however many steps it takes. After each step that changed the canvas the diff is handed to
 * `onCanvas` immediately. `finish` is only accepted when nothing is left to fix, when the agent asks
 * again unchanged, or when the review budget is spent: that is what makes it polish before it stops.
 */
export const runDiagramBuilder = async (input: BuilderInput): Promise<BuilderResult> => {
  const { transport, signal } = input;
  const baseTurns = Math.max(1, input.maxTurns ?? DEFAULT_MAX_TURNS);
  const maxReviews = input.maxReviews ?? DEFAULT_MAX_REVIEWS;
  let maxTurns = baseTurns;
  let lookupTurns = 0;

  let state = createState();
  // Set by `redraw`, so kept in one object that type narrowing cannot freeze at its initial value.
  const live: { built: BuiltCanvas | null; report: CanvasReport | undefined } = { built: null, report: undefined };
  let drawn = new Map<string, string>();
  let notes: string[] = [];
  let wantDetail = false;
  let wantImage = false;
  let phase: "build" | "review" = "build";
  let reviews = 0;
  let lastFinishKey: string | undefined;
  let emptyTurns = 0;
  const toolTrail: string[] = [];
  let turn = 0;
  let finished = false;
  let stoppedByQuota = false;

  const redraw = async () => {
    live.built = buildCanvas(state, input.generationId, input.frameId);
    if (!live.built) return;
    live.report = reportCanvas(live.built, state);
    const diff = diffElements(drawn, live.built.elements);
    drawn = diff.signatures;
    if (diff.added.length + diff.updated.length + diff.removedIds.length > 0) {
      await input.onCanvas?.({ added: diff.added, updated: diff.updated, removedIds: diff.removedIds, elements: live.built.elements });
    }
  };

  for (turn = 1; turn <= maxTurns; turn += 1) {
    if (signal?.aborted) throw abortError();

    const image = wantImage && live.built && input.renderImage ? await input.renderImage(live.built.elements).catch(() => undefined) : undefined;
    const message: AgentMessage = {
      role: "user",
      content: buildStateMessage({
        goal: input.goal,
        code: state.code,
        turn,
        maxTurns,
        summary: live.report?.summary,
        problems: live.report?.problems,
        detail: wantDetail ? live.report?.detail : undefined,
        notes,
        moved: describeMoved(state),
        phase,
        reviewsLeft: maxReviews - reviews,
        hasImage: Boolean(image),
      }),
      images: image ? [image] : undefined,
    };
    notes = [];
    wantDetail = false;
    wantImage = phase === "review" && Boolean(input.renderImage);

    let reply: ModelTurn;
    try {
      reply = await withRetry(
        () => transport.complete([{ role: "system", content: input.system }, message], { signal }),
        // Many calls in a row: on a tokens-per-minute limit the wait for the next window is the normal case, not a failure.
        { ...PATIENT_RETRY, ...input.retry },
      );
    } catch (error) {
      // Out of quota with a picture already on the canvas: keep it. Without one there is nothing to keep.
      const typed = categorizeError(error);
      if (live.built && (typed instanceof RateLimitError || typed instanceof QuotaExceededError)) {
        stoppedByQuota = true;
        break;
      }
      throw error;
    }
    if (signal?.aborted) throw abortError();

    // A model that answers with a diagram in a fence instead of calling a tool is still adding to the canvas.
    const calls: ToolCall[] = reply.toolCalls.length > 0 ? reply.toolCalls : reply.code ? [{ name: "add", arg: reply.code }] : [];
    if (calls.length === 0) {
      emptyTurns += 1;
      notes.push("Your reply had no tool call. Call add, adjust, view or finish.");
      if (emptyTurns >= MAX_EMPTY_TURNS && live.built) break;
      continue;
    }
    emptyTurns = 0;

    const before = state;
    const scoreBefore = live.report?.score;
    let finishRequested = false;
    let lookupOnly = true;
    for (const call of calls) {
      toolTrail.push(call.name);
      if (call.name !== "search_icons") lookupOnly = false;
      switch (call.name) {
        case "search_icons": {
          const found = runTool(call).content;
          notes.push(found);
          input.onStep?.({ kind: "icons", turn, summary: "Choosing icons" });
          break;
        }
        case "add": {
          const result = addLines(state, call.arg);
          if (result.errors.length > 0) {
            notes.push(`add failed, nothing was added: ${result.errors.slice(0, 4).join("; ")}`);
          } else {
            state = result.state;
            notes.push(result.added.length > 0 ? `Added ${result.added.join(", ")}.` : "That was already on the canvas.");
            if (result.skipped > 0) notes.push(`Only the first statements were used; ${result.skipped} more were left out. Add them next.`);
            if (result.added.length > 0) input.onStep?.({ kind: "add", turn, summary: `Added ${result.added.slice(0, 3).join(", ")}${result.added.length > 3 ? "…" : ""}` });
          }
          break;
        }
        case "adjust": {
          const result = adjust(state, call.arg, live.built?.centres ?? NO_CENTRES);
          state = result.state;
          notes.push(...result.applied, ...result.errors.map((e) => `could not apply ${e}`));
          if (result.applied.length > 0) input.onStep?.({ kind: "adjust", turn, summary: result.applied.slice(0, 2).join("; ") });
          break;
        }
        case "view":
          wantDetail = true;
          wantImage = Boolean(input.renderImage);
          input.onStep?.({ kind: "view", turn, summary: "Looking at the canvas" });
          break;
        case "finish":
          finishRequested = true;
          break;
        default:
          notes.push(`${call.name} is not a tool here.`);
      }
    }

    if (state !== before) await redraw();

    // A tidy-up that made things worse is taken back, so a run of well-meant nudges cannot drift into a mess.
    const adjustedOnly = calls.some((c) => c.name === "adjust") && !calls.some((c) => c.name === "add");
    if ((input.guardAdjustments ?? true) && adjustedOnly && state !== before && state.code === before.code && scoreBefore && live.report) {
      const after = live.report.score;
      const worse = after.problems > scoreBefore.problems || (after.problems === scoreBefore.problems && after.connectorLength > scoreBefore.connectorLength * 1.25 + 120);
      if (worse) {
        state = before;
        await redraw();
        notes.push(
          `Undid that adjustment: it made the picture worse (problems ${scoreBefore.problems} -> ${after.problems}, connector length ${Math.round(scoreBefore.connectorLength)} -> ${Math.round(after.connectorLength)}px). Try something smaller, or a different fix.`,
        );
      }
    }

    if (finishRequested) {
      const { built, report } = live;
      if (!built || !report) {
        notes.push("Nothing is on the canvas yet. Add the diagram first.");
      } else {
        const key = `${state.code}|${[...state.offsets].join(";")}|${[...state.edgeSides].join(";")}`;
        const clean = report.problems.length === 0;
        // Asking again with nothing changed means the agent has judged the rest acceptable.
        if (clean || reviews >= maxReviews || key === lastFinishKey) {
          finished = true;
          break;
        }
        reviews += 1;
        lastFinishKey = key;
        phase = "review";
        wantImage = Boolean(input.renderImage);
        input.onStep?.({ kind: "review", turn, summary: `Reviewing: ${report.problems.length} thing${report.problems.length === 1 ? "" : "s"} to fix`, problems: report.problems });
      }
    } else if (phase === "review" && state !== before && live.report && live.report.problems.length === 0) {
      notes.push("The problems list is empty now.");
    }

    if (lookupOnly && lookupTurns < MAX_LOOKUP_TURNS) {
      lookupTurns += 1;
      maxTurns += 1;
    }
  }

  if (!live.built) throw new UnparseableModelOutputError("empty", "");
  return { state, built: live.built, finished, turns: Math.min(turn, maxTurns), reviews, stoppedByQuota, toolTrail, transport: transport.kind };
};
