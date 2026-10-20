import { coerceArgs, normalizeArgs } from "./args";
import { notEnabledMessage, unknownToolMessage } from "./tool-names";
import { isEmptyPatch } from "@/core/groups/patch";
import { createCommandContext } from "@/features/whiteboard/commands/context";
import { ToolError, isToolError, type ToolErrorInfo } from "./errors";
import { checkPatch, diffAffected, normalizePatch } from "./integrity";
import { revisionOf } from "./revision";
import { describeIssues } from "./schemas";
import {
  TOOL_GROUPS,
  toolEnabled,
  type CanvasHost,
  type ToolCallRequest,
  type ToolDefinition,
  type ToolEnv,
  type ToolGroup,
  type ToolResult,
  type ToolSession,
} from "./types";

/**
 * One queue per board host: whoever calls `execute` (the agent loop, a retry, an undo from the UI), calls run one
 * at a time, each reading the board as the previous one left it. Without it two overlapping calls plan from the same
 * snapshot and the later write silently replaces the earlier one.
 */
const queues = new WeakMap<object, Promise<unknown>>();
const serialized = <T>(host: object, work: () => Promise<T>): Promise<T> => {
  const next = (queues.get(host) ?? Promise.resolve()).then(work, work);
  queues.set(host, next.catch(() => undefined));
  return next;
};

/** The arguments a tool really takes, to answer a bad call with the true schema. */
const isAbortError = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";

const argumentNames = (tool: ToolDefinition): string[] => Object.keys((tool.input as unknown as { shape?: Record<string, unknown> }).shape ?? {});

export interface ToolExecutorOptions {
  host: CanvasHost;
  tools: readonly ToolDefinition[];
  session?: Partial<ToolSession>;
  now?: () => number;
  /**
   * Runs before any tool body (after the call was accepted): loads what a tool may need, such as the icon
   * library, which is a separate chunk. A failure here is not fatal; the tool then sees the smaller registry.
   */
  prepare?: () => Promise<unknown>;
}

const emptyAffected = () => ({ created: [] as string[], updated: [] as string[], removed: [] as string[] });

/**
 * Runs tool calls against a host: the strict allowlist, argument validation, access and staleness
 * guards, the confirmation gate, patch integrity, the single atomic write and the structured result.
 * It owns no editing logic; every edit is a tool's pure plan applied through `host.applyPatch`.
 */
export const createToolExecutor = ({ host, tools, session: given, now = Date.now, prepare }: ToolExecutorOptions) => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const session: ToolSession = {
    runId: given?.runId ?? `run_${now().toString(36)}`,
    enabledGroups: given?.enabledGroups ?? new Set<ToolGroup>(["inspect"]),
    lastSeenRevision: given?.lastSeenRevision,
    replay: given?.replay ?? new Map(),
    touched: given?.touched ?? new Set<string>(),
    autoApproveDestructive: given?.autoApproveDestructive,
    log: given?.log,
  };

  const currentRevision = () => revisionOf(host.getStored());
  /** Revisions this run has seen or produced, to tell its own earlier changes from someone else's. */
  const known = new Set<string>();
  /** Read results by call and revision: asking again about an unchanged board repeats nothing. */
  const readCache = new Map<string, string>();

  const failure = (tool: string, info: ToolErrorInfo, started: number, callId?: string): ToolResult => {
    const revision = currentRevision();
    session.log?.({ tool, callId, runId: session.runId, ok: false, code: info.code, ms: now() - started, created: 0, updated: 0, removed: 0 });
    return { ok: false, tool, summary: info.message, affected: emptyAffected(), revision, error: info };
  };

  const confirm = async (tool: string, message: string) => {
    if (session.autoApproveDestructive) return;
    if (!host.capabilities.confirm || !host.requestConfirmation) {
      throw new ToolError("confirmation_denied", `${tool} needs the person's approval and none can be asked here, so nothing was changed.`);
    }
    const approved = await host.requestConfirmation({ tool, message });
    if (!approved) throw new ToolError("confirmation_denied", "The person declined, so nothing was changed. Do not retry without being asked to.");
  };

  const execute = (call: ToolCallRequest): Promise<ToolResult> => serialized(host, () => executeNow(call));

  const executeNow = async (call: ToolCallRequest): Promise<ToolResult> => {
    const started = now();
    const name = typeof call.name === "string" ? call.name : "";
    const tool = byName.get(name);
    if (!tool) {
      return failure(name || "unknown", { code: "unknown_tool", message: unknownToolMessage(name || "(none)", tools, session.enabledGroups) }, started, call.id);
    }
    if (!toolEnabled(tool, session.enabledGroups)) {
      // The model named a real tool: switch its group on now (what enable_tools would do) so the next call just works.
      session.enabledGroups.add(tool.group);
      return failure(tool.name, { code: "tool_not_enabled", message: notEnabledMessage(tool, argumentNames(tool), tools.filter((t) => t.group === tool.group).map((t) => t.name)), details: { group: tool.group, enabled: true } }, started, call.id);
    }

    if (call.id && tool.access === "write") {
      const previous = session.replay.get(call.id);
      if (previous) return { ...previous, replayed: true };
    }

    const { args: named, read: renamed } = normalizeArgs(tool, call.args ?? {});
    const { args: callArgs, adjusted } = coerceArgs(tool, named);
    const parsed = tool.input.safeParse(callArgs);
    if (!parsed.success) {
      const names = argumentNames(tool);
      return failure(tool.name, { code: "invalid_arguments", message: `Invalid arguments for ${tool.name}: ${describeIssues(parsed.error)}. ${names.length > 0 ? `${tool.name} takes only: ${names.join(", ")}.` : `${tool.name} takes no arguments.`}`, details: { accepts: names } }, started, call.id);
    }

    const document = host.getDocument();
    if (tool.access === "write" && !document.canEdit) {
      return failure(tool.name, { code: "read_only", message: "This board is read-only for you, so it cannot be changed." }, started, call.id);
    }
    const missing = (tool.needs ?? []).filter((need) => !host.capabilities[need]);
    if (missing.length > 0) {
      return failure(tool.name, { code: "unavailable", message: `${tool.name} is not available here (this editor cannot: ${missing.join(", ")}).` }, started, call.id);
    }

    if (prepare) await prepare().catch(() => undefined);
    const before = host.getStored();
    const revision = revisionOf(before);
    known.add(revision);
    const guard = (parsed.data as { expected_revision?: string }).expected_revision;
    if (tool.access === "write") {
      // A revision this run produced itself (an earlier call of the same reply) is not someone else's edit: when nothing
      // has touched the board since this run's last call, the guard is still good.
      const own = guard !== undefined && known.has(guard) && (session.lastSeenRevision === undefined || session.lastSeenRevision === revision);
      if (guard !== undefined && guard !== revision && !own) {
        return failure(tool.name, { code: "stale_document", message: `The board has changed since revision ${guard}; it is now ${revision}, so someone else edited it or an undo happened. Call get_document_state, check the plan still holds, then repeat the call without expected_revision or with ${revision}.`, details: { revision } }, started, call.id);
      }
      if (tool.strictRevision && session.lastSeenRevision !== undefined && session.lastSeenRevision !== revision && guard === undefined) {
        return failure(tool.name, { code: "stale_document", message: "The board has changed since you last looked (someone else edited it, or an undo happened). Call get_document_state, check it is still what you intend, then repeat this call.", details: { revision } }, started, call.id);
      }
    }

    // A read that does not look at the board (an icon search) is the same answer on any revision.
    const readKey = tool.access === "read" ? `${tool.name}|${tool.boardIndependent ? "any" : revision}|${JSON.stringify(parsed.data)}` : undefined;
    if (readKey && readCache.has(readKey)) {
      const summary = tool.boardIndependent ? `You asked this before; the earlier result still holds: ${readCache.get(readKey)}` : `Nothing has changed since you asked this before (revision ${revision}); the earlier result still holds: ${readCache.get(readKey)}`;
      session.log?.({ tool: tool.name, callId: call.id, runId: session.runId, ok: true, ms: now() - started, created: 0, updated: 0, removed: 0 });
      return { ok: true, tool: tool.name, summary, data: { repeated: true }, affected: emptyAffected(), revision, warnings: ["Repeated read: use your earlier result instead of asking again."] };
    }

    const ctx = createCommandContext(before, { newId: () => host.newId(), getBounds: host.getBounds });
    const env: ToolEnv = { host, ctx, session, revision, confirm: (message) => confirm(tool.name, message) };

    let run;
    try {
      run = await tool.run(parsed.data, env);
    } catch (error) {
      if (isToolError(error)) return failure(tool.name, error.info, started, call.id);
      // A person pressing Stop aborts the work in flight: that is a cancel, not a crash, and not worth a console error.
      if (isAbortError(error)) return failure(tool.name, { code: "cancelled", message: `${tool.name} was cancelled; nothing was changed.` }, started, call.id);
      console.error(`[canvas-tools] ${tool.name} failed`, error);
      return failure(tool.name, { code: "execution_failed", message: `${tool.name} failed unexpectedly; nothing was changed.` }, started, call.id);
    }

    let affected = emptyAffected();
    const planned = run.patch && !isEmptyPatch(run.patch) ? run.patch : null;
    const patch = planned && !isEmptyPatch(normalizePatch(before, planned)) ? normalizePatch(before, planned) : null;
    // A tool planned a change, but every element already had those values: say so instead of reporting a change.
    const unchanged = planned !== null && patch === null;
    if (planned && tool.access === "read") {
      return failure(tool.name, { code: "execution_failed", message: `${tool.name} is a read tool and cannot change the board.` }, started, call.id);
    }
    if (patch) {
      const problems = checkPatch(before, patch);
      if (problems.length > 0) {
        return failure(tool.name, { code: "invalid_state", message: `Refused, nothing was changed: ${problems.join("; ")}.`, details: { problems } }, started, call.id);
      }
      try {
        await host.applyPatch(patch);
      } catch (error) {
        console.error(`[canvas-tools] applying ${tool.name} failed`, error);
        return failure(tool.name, { code: "execution_failed", message: `The board rejected the change from ${tool.name}; nothing was changed.` }, started, call.id);
      }
    }
    // Report what the board shows now, not what was planned: it is true whatever the host did, and it is the only
    // account of what an undo, a redo or a load changed.
    if (tool.access === "write") {
      affected = diffAffected(before, host.getStored());
      for (const id of [...affected.created, ...affected.updated]) session.touched.add(id);
      for (const id of affected.removed) session.touched.delete(id);
      if (patch && affected.created.length + affected.updated.length + affected.removed.length === 0 && (patch.add.length > 0 || patch.remove.length > 0)) {
        return failure(tool.name, { code: "execution_failed", message: `${tool.name} was sent to the board but the board does not show the change. Check it with get_document_state before going on.` }, started, call.id);
      }
    }
    if (run.selection && host.capabilities.selection) host.setSelection(run.selection);

    const after = currentRevision();
    known.add(after);
    session.lastSeenRevision = after;
    if (readKey) readCache.set(readKey, run.summary.slice(0, 300));
    const result: ToolResult = {
      ok: true,
      tool: tool.name,
      summary: unchanged ? "Nothing changed: the board already matched what was asked." : run.summary,
      ...(run.data || unchanged ? { data: { ...(run.data ?? {}), ...(unchanged ? { requested: run.summary } : {}) } } : {}),
      affected,
      revision: after,
      ...(run.warnings || renamed.length > 0 || adjusted.length > 0
        ? {
            warnings: [
              ...(run.warnings ?? []),
              ...(renamed.length > 0 ? [`Read ${renamed.join(", ")}: ${tool.name} takes ${argumentNames(tool).join(", ")}.`] : []),
              ...(adjusted.length > 0 ? [`Adjusted ${adjusted.slice(0, 4).join(", ")}: send each argument in the type ${tool.name} lists.`] : []),
            ],
          }
        : {}),
      ...(run.skipped && run.skipped.length > 0 ? { skipped: run.skipped } : {}),
    };
    if (call.id && tool.access === "write") session.replay.set(call.id, result);
    session.log?.({ tool: tool.name, callId: call.id, runId: session.runId, ok: true, ms: now() - started, created: affected.created.length, updated: affected.updated.length, removed: affected.removed.length });
    return result;
  };

  /**
   * Runs calls strictly in order (they may depend on each other: a connector needs the shapes made just
   * before it). After a failed write the rest are not run: the plan they belonged to no longer holds.
   */
  const executeAll = async (calls: readonly ToolCallRequest[]): Promise<ToolResult[]> => {
    const results: ToolResult[] = [];
    let broken: string | null = null;
    for (const call of calls) {
      if (broken) {
        const started = now();
        results.push(failure(typeof call.name === "string" ? call.name : "unknown", { code: "skipped", message: `Not run, because ${broken} failed earlier in this turn. Re-check the board and plan again.` }, started, call.id));
        continue;
      }
      const result = await execute(call);
      results.push(result);
      if (!result.ok && byName.get(call.name)?.access === "write") broken = call.name;
    }
    return results;
  };

  const enable = (groups: readonly ToolGroup[]) => {
    for (const group of groups) if ((TOOL_GROUPS as readonly string[]).includes(group)) session.enabledGroups.add(group);
  };

  return { execute, executeAll, enable, session, tools: byName };
};

export type ToolExecutor = ReturnType<typeof createToolExecutor>;
