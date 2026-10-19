import { isEmptyPatch } from "@/core/groups/patch";
import { createCommandContext } from "@/features/whiteboard/commands/context";
import { ToolError, isToolError, type ToolErrorInfo } from "./errors";
import { checkPatch } from "./integrity";
import { revisionOf } from "./revision";
import { describeIssues } from "./schemas";
import {
  TOOL_GROUPS,
  type CanvasHost,
  type ToolCallRequest,
  type ToolDefinition,
  type ToolEnv,
  type ToolGroup,
  type ToolResult,
  type ToolSession,
} from "./types";

export interface ToolExecutorOptions {
  host: CanvasHost;
  tools: readonly ToolDefinition[];
  session?: Partial<ToolSession>;
  now?: () => number;
}

const emptyAffected = () => ({ created: [] as string[], updated: [] as string[], removed: [] as string[] });

/**
 * Runs tool calls against a host: the strict allowlist, argument validation, access and staleness
 * guards, the confirmation gate, patch integrity, the single atomic write and the structured result.
 * It owns no editing logic; every edit is a tool's pure plan applied through `host.applyPatch`.
 */
export const createToolExecutor = ({ host, tools, session: given, now = Date.now }: ToolExecutorOptions) => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const session: ToolSession = {
    runId: given?.runId ?? `run_${now().toString(36)}`,
    enabledGroups: given?.enabledGroups ?? new Set<ToolGroup>(["inspect"]),
    lastSeenRevision: given?.lastSeenRevision,
    replay: given?.replay ?? new Map(),
    autoApproveDestructive: given?.autoApproveDestructive,
    log: given?.log,
  };

  const currentRevision = () => revisionOf(host.getStored());

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

  const execute = async (call: ToolCallRequest): Promise<ToolResult> => {
    const started = now();
    const name = typeof call.name === "string" ? call.name : "";
    const tool = byName.get(name);
    if (!tool) {
      return failure(name || "unknown", { code: "unknown_tool", message: `There is no tool called "${name}". Use only the tools you were given.` }, started, call.id);
    }
    if (!session.enabledGroups.has(tool.group)) {
      return failure(tool.name, { code: "tool_not_enabled", message: `"${tool.name}" belongs to the "${tool.group}" tools, which are not enabled. Call enable_tools with {"groups":["${tool.group}"]} first.`, details: { group: tool.group } }, started, call.id);
    }

    if (call.id && tool.access === "write") {
      const previous = session.replay.get(call.id);
      if (previous) return { ...previous, replayed: true };
    }

    const parsed = tool.input.safeParse(call.args ?? {});
    if (!parsed.success) {
      return failure(tool.name, { code: "invalid_arguments", message: `Invalid arguments for ${tool.name}: ${describeIssues(parsed.error)}.` }, started, call.id);
    }

    const document = host.getDocument();
    if (tool.access === "write" && !document.canEdit) {
      return failure(tool.name, { code: "read_only", message: "This board is read-only for you, so it cannot be changed." }, started, call.id);
    }
    const missing = (tool.needs ?? []).filter((need) => !host.capabilities[need]);
    if (missing.length > 0) {
      return failure(tool.name, { code: "unavailable", message: `${tool.name} is not available here (this editor cannot: ${missing.join(", ")}).` }, started, call.id);
    }

    const before = host.getStored();
    const revision = revisionOf(before);
    const guard = (parsed.data as { expected_revision?: string }).expected_revision;
    if (tool.access === "write") {
      if (guard !== undefined && guard !== revision) {
        return failure(tool.name, { code: "stale_document", message: `The board has changed since revision ${guard}. Look again (get_document_state) and redo the call.`, details: { revision } }, started, call.id);
      }
      if (tool.strictRevision && session.lastSeenRevision !== undefined && session.lastSeenRevision !== revision && guard === undefined) {
        return failure(tool.name, { code: "stale_document", message: "The board has changed since you last looked (someone else edited it, or an undo happened). Call get_document_state, check it is still what you intend, then repeat this call.", details: { revision } }, started, call.id);
      }
    }

    const ctx = createCommandContext(before, { newId: () => host.newId(), getBounds: host.getBounds });
    const env: ToolEnv = { host, ctx, session, revision, confirm: (message) => confirm(tool.name, message) };

    let run;
    try {
      run = await tool.run(parsed.data, env);
    } catch (error) {
      if (isToolError(error)) return failure(tool.name, error.info, started, call.id);
      console.error(`[canvas-tools] ${tool.name} failed`, error);
      return failure(tool.name, { code: "execution_failed", message: `${tool.name} failed unexpectedly; nothing was changed.` }, started, call.id);
    }

    const affected = emptyAffected();
    const patch = run.patch && !isEmptyPatch(run.patch) ? run.patch : null;
    if (patch) {
      if (tool.access === "read") {
        return failure(tool.name, { code: "execution_failed", message: `${tool.name} is a read tool and cannot change the board.` }, started, call.id);
      }
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
      const beforeIds = new Set(before.map((item) => item.id));
      affected.created = patch.add.map((item) => item.id);
      affected.updated = patch.update.map((item) => item.id).filter((id) => beforeIds.has(id));
      affected.removed = patch.remove.filter((id) => beforeIds.has(id));
    }
    if (run.selection && host.capabilities.selection) host.setSelection(run.selection);

    const after = currentRevision();
    session.lastSeenRevision = after;
    const result: ToolResult = {
      ok: true,
      tool: tool.name,
      summary: run.summary,
      ...(run.data ? { data: run.data } : {}),
      affected,
      revision: after,
      ...(run.warnings && run.warnings.length > 0 ? { warnings: run.warnings } : {}),
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
