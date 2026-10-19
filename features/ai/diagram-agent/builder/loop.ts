import { QuotaExceededError, RateLimitError, UnparseableModelOutputError } from "@/features/ai/server/errors";
import { categorizeError, withRetry, type RetryOptions } from "@/features/ai/server/retry";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { loadIconLibrary } from "@/core/icons/registry";
import { runTool } from "../tools/index";
import type { AgentMessage, ModelTurn, ToolCall, ToolTransport } from "../types";
import { buildCanvas, diffElements, type BuiltCanvas, type CanvasDiff } from "./canvas";
import { buildStateMessage } from "./prompt";
import { reportCanvas, type CanvasReport } from "./report";
import { addLines, adjust, createState, describeFlow, describeMoved, withBareIcons, withIconPriority, type BuilderState } from "./state";

/** Each turn is a model call, and free tiers allow few calls a minute: keep the default small. */
const DEFAULT_MAX_TURNS = 12;
const DEFAULT_MAX_REVIEWS = 2;
/** Wall-clock limit for the whole run: slow reasoning models can spend minutes per step, so steps alone do not bound it. */
const DEFAULT_MAX_MS = 240_000;
/** Turns spent only looking up icons do not use the budget, up to this many. */
const MAX_LOOKUP_TURNS = 3;
/** Replies with neither a tool call nor code, in a row, before the run settles for what is on the canvas. */
const MAX_EMPTY_TURNS = 2;
const PATIENT_RETRY: Partial<RetryOptions> = { maxAttempts: 6, baseDelayMs: 2_000, maxDelayMs: 60_000 };

export interface CanvasUpdate extends CanvasDiff {
  /** Everything now on the canvas. */
  elements: DrawingElement[];
}

/** What the agent did or found at a step, with the facts behind it; the stream turns these into the panel's timeline. */
export type BuilderNote = { turn: number } & (
  | { kind: "reasoning"; text: string }
  | { kind: "icons"; terms: string }
  | { kind: "add"; added: string[]; nodes: number; edges: number; flow: string; layout: string; skipped: number }
  | { kind: "adjust"; applied: string[]; failed: string[] }
  | { kind: "undo"; reason: string; undone: string[] }
  | { kind: "review"; problems: string[]; round: number }
  | { kind: "view" }
);

export interface BuilderInput {
  transport: ToolTransport;
  system: string;
  goal: string;
  /** Diagram code already on the board: the run edits it instead of starting empty. */
  initialCode?: string;
  /** Draw every node that has an icon as a bare icon (the person asked for icons only). */
  bareIcons?: boolean;
  /** Recognisable things with short names become bare icons, boxes stay for steps, decisions and long text. Off when the person asked for plain boxes. */
  iconPriority?: boolean;
  generationId: string;
  frameId: string;
  maxTurns?: number;
  maxReviews?: number;
  /** Stop starting new steps after this many ms once something is drawn (default 240 s). */
  maxMs?: number;
  /** Undo an adjustment that made the picture worse (default on). */
  guardAdjustments?: boolean;
  /** Renders the canvas to an image for a vision model; its absence means the agent works from text alone. */
  renderImage?: (elements: DrawingElement[]) => Promise<string | undefined>;
  signal?: AbortSignal;
  retry?: Partial<RetryOptions>;
  /** Called as soon as a step changed the canvas, so the client can draw it before the next model call. */
  onCanvas?: (update: CanvasUpdate) => void | Promise<void>;
  onNote?: (note: BuilderNote) => void;
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
  /** The time limit ended the run; what was built stays. */
  timedOut: boolean;
  /** Problems the report listed when the agent first asked to finish, and those still listed at the end. */
  firstReviewProblems: number;
  remainingProblems: string[];
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

  const bare = (s: BuilderState) => (input.bareIcons ? withBareIcons(s) : input.iconPriority ? withIconPriority(s) : s);
  let state = bare(createState(input.initialCode ?? ""));
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
  const searched = new Set<string>();
  const toolTrail: string[] = [];
  let turn = 0;
  let finished = false;
  let stoppedByQuota = false;
  let timedOut = false;
  const startedAt = Date.now();
  // The on-demand icon library, so search_icons finds brands (Stripe, SendGrid) instead of sending the agent round again.
  await loadIconLibrary().catch(() => undefined);
  let firstReviewProblems = 0;

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

  if (state.parsed.nodes.length > 0) await redraw();

  for (turn = 1; turn <= maxTurns; turn += 1) {
    if (signal?.aborted) throw abortError();
    const effectiveMaxMs = input.maxMs ?? DEFAULT_MAX_MS;
    if (Number.isFinite(effectiveMaxMs) && live.built && Date.now() - startedAt > effectiveMaxMs) {
      timedOut = true;
      break;
    }

    const image = wantImage && live.built && input.renderImage ? await input.renderImage(live.built.elements).catch(() => undefined) : undefined;
    const secondsLeft =
      Number.isFinite(effectiveMaxMs) && effectiveMaxMs > 0
        ? (effectiveMaxMs - (Date.now() - startedAt)) / 1000
        : undefined;

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
        secondsLeft,
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

    // The model's own reasoning, when it gave any, is the most useful thing to show.
    const reasoning = reply.text.replace(/<\/?tool[^>]*>/gi, "").trim();
    if (reasoning) input.onNote?.({ kind: "reasoning", turn, text: reasoning.length > 700 ? `${reasoning.slice(0, 699)}…` : reasoning });

    const before = state;
    const scoreBefore = live.report?.score;
    let finishRequested = false;
    let lookupOnly = true;
    let newLookup = false;
    let addedNow: string[] = [];
    let skippedNow = 0;
    let appliedNow: string[] = [];
    let failedNow: string[] = [];
    for (const call of calls) {
      toolTrail.push(call.name);
      if (call.name !== "search_icons") lookupOnly = false;
      switch (call.name) {
        case "search_icons": {
          const terms = call.arg.toLowerCase().split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
          if (terms.some((t) => !searched.has(t))) newLookup = true;
          terms.forEach((t) => searched.add(t));
          const found = runTool(call).content;
          notes.push(found);
          input.onNote?.({ kind: "icons", turn, terms: call.arg.trim().slice(0, 160) });
          break;
        }
        case "add": {
          const result = addLines(state, call.arg);
          if (result.errors.length > 0) {
            notes.push(`add failed, nothing was added: ${result.errors.slice(0, 4).join("; ")}`);
          } else {
            state = bare(result.state);
            notes.push(result.added.length > 0 ? `Added ${result.added.join(", ")}.` : "That was already on the canvas.");
            if (result.skipped > 0) notes.push(`Only the first statements were used; ${result.skipped} more were left out. Add them next.`);
            addedNow = [...addedNow, ...result.added];
            skippedNow += result.skipped;
          }
          break;
        }
        case "adjust": {
          const result = adjust(state, call.arg, live.built?.centres ?? NO_CENTRES);
          state = result.state;
          notes.push(...result.applied, ...result.errors.map((e) => `could not apply ${e}`));
          appliedNow = [...appliedNow, ...result.applied];
          failedNow = [...failedNow, ...result.errors];
          break;
        }
        case "view":
          wantDetail = true;
          wantImage = Boolean(input.renderImage);
          input.onNote?.({ kind: "view", turn });
          break;
        case "finish":
          finishRequested = true;
          break;
        default:
          notes.push(`${call.name} is not a tool here.`);
      }
    }

    if (state !== before) await redraw();

    if (addedNow.length > 0 && live.report) {
      const nodes = addedNow.filter((a) => !a.includes(" > ")).length;
      input.onNote?.({ kind: "add", turn, added: addedNow, nodes, edges: addedNow.length - nodes, flow: describeFlow(state), layout: live.report.summary, skipped: skippedNow });
    }
    if (appliedNow.length > 0 || failedNow.length > 0) input.onNote?.({ kind: "adjust", turn, applied: appliedNow, failed: failedNow });

    // A tidy-up that made things worse is taken back, so a run of well-meant nudges cannot drift into a mess.
    const adjustedOnly = calls.some((c) => c.name === "adjust") && !calls.some((c) => c.name === "add");
    if ((input.guardAdjustments ?? true) && adjustedOnly && state !== before && state.code === before.code && scoreBefore && live.report) {
      const after = live.report.score;
      const worse = after.problems > scoreBefore.problems || (after.problems === scoreBefore.problems && after.connectorLength > scoreBefore.connectorLength * 1.25 + 120);
      if (worse) {
        state = before;
        await redraw();
        input.onNote?.({
          kind: "undo",
          turn,
          undone: appliedNow,
          reason: `It made the picture worse (problems ${scoreBefore.problems} → ${after.problems}, connectors ${Math.round(scoreBefore.connectorLength)} → ${Math.round(after.connectorLength)}px), so it was taken back.`,
        });
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
        if (reviews === 1) firstReviewProblems = report.problems.length;
        input.onNote?.({ kind: "review", turn, problems: report.problems, round: reviews });
      }
    } else if (phase === "review" && state !== before && live.report && live.report.problems.length === 0) {
      notes.push("The problems list is empty now.");
    }

    // Looking up icons does not use the step budget, but asking for the same ones again does.
    if (lookupOnly && newLookup && lookupTurns < MAX_LOOKUP_TURNS) {
      lookupTurns += 1;
      maxTurns += 1;
    }
  }

  if (!live.built) throw new UnparseableModelOutputError("empty", "");
  return { state, built: live.built, finished, turns: Math.min(turn, maxTurns), reviews, stoppedByQuota, timedOut, toolTrail, transport: transport.kind, firstReviewProblems, remainingProblems: live.report?.problems ?? [] };
};
