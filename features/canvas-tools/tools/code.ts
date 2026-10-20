import { z } from "zod";
import { orderFramesBelowContents } from "@/core/frames/containment";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import { loadFromCanvas, planApply } from "@/features/diagram-code/apply";
import { compileDiagramCode } from "@/features/diagram-code/language/compile";
import { formatDiagramCode } from "@/features/diagram-code/language/format";
import { BLOCK_KEYWORDS, CONNECTORS, DIAGRAM_TYPES, KINDS, PROPERTIES, SIDES, shapeNames } from "@/features/diagram-code/language/vocab";
import type { Diagnostic } from "@/features/diagram-code/language/diagnostics";
import type { DiagramCodeIssue } from "@/features/diagram-code/types";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import { expectedRevision, targetIds } from "../schemas";
import type { ToolDefinition } from "../types";
import { claimId, count, listIds, resolveTargets } from "./helpers";

/**
 * The diagram-code tools. They call the language itself (`features/diagram-code`: parser, validated IR,
 * formatter, in-place apply with identity matching), so the agent and the code editor panel accept the same
 * text, report the same diagnostics and update the board the same way. Adding a NEW diagram from code stays
 * with import_diagram; reading the board as code stays with serialize_diagram.
 */

const MAX_CODE_CHARS = 60_000;
/** Removing this many elements through one code update needs the person's go-ahead, like delete_elements. */
const BULK_REMOVE = 6;

const where = (d: { line: number; column?: number }) => (d.column ? `line ${d.line}:${d.column}` : `line ${d.line}`);

const diagnosticData = (d: Diagnostic | DiagramCodeIssue) => ({ line: d.line, ...(d.column ? { column: d.column } : {}), severity: d.severity, ...(d.code ? { code: d.code } : {}), message: d.message, ...(d.suggestion ? { suggestion: d.suggestion } : {}) });

/** What the language accepts, read from its own vocabulary (never a copy), so new shapes and properties appear here when they appear there. */
const referenceOf = () => ({
  shapes: shapeNames(),
  kinds: KINDS,
  diagram_types: DIAGRAM_TYPES,
  connectors: CONNECTORS.map((c) => `${c.symbol}  ${c.summary}`),
  blocks: BLOCK_KEYWORDS.map((b) => `${b.keyword}: ${b.summary}`),
  properties: PROPERTIES.map((p) => `${p.key} (${p.appliesTo.join("/")}): ${p.summary} e.g. ${p.example}`),
  sides: [...SIDES],
  note: "Icons: search_icons finds ids. A node is `Name [kind: service, icon: postgres]`; a connection is `A > B` or `A > B : label`; `frame \"Title\" { ... }` and `group \"Title\" { ... }` hold nodes.",
});

// ── check_diagram_code ───────────────────────────────────────────────────────

const checkInput = z
  .object({
    code: z.string().min(1).max(MAX_CODE_CHARS).describe("Diagram code."),
    format: z.boolean().optional().describe("Also return the code in the canonical format (indentation, spacing, property order). Refused while it has errors."),
    reference: z.boolean().optional().describe("Also return what the language accepts: shapes, kinds, connectors, properties, blocks."),
  })
  .strict();

export const checkDiagramCodeTool: ToolDefinition<typeof checkInput> = {
  name: "check_diagram_code",
  group: "code",
  description:
    "Parse and validate diagram code without touching the board: errors and warnings with line and column, what it would draw (nodes, connections, groups, frames), optionally the formatted code and the language reference. Check before apply_diagram_code or import_diagram, and use format to reformat without changing the diagram.",
  input: checkInput,
  access: "read",
  boardIndependent: true,
  run: ({ code, format, reference }) => {
    const compiled = compileDiagramCode(code);
    const errors = compiled.diagnostics.filter((d) => d.severity === "error");
    const warnings = compiled.diagnostics.filter((d) => d.severity === "warning");
    const { ir } = compiled;
    const counts = { nodes: ir.nodes.length, edges: ir.edges.length, groups: ir.groups.length, frames: ir.frames.length };
    const data: Record<string, unknown> = {
      valid: compiled.valid,
      ...counts,
      errors: errors.slice(0, 10).map(diagnosticData),
      warnings: warnings.slice(0, 8).map(diagnosticData),
      ...(errors.length > 10 ? { moreErrors: errors.length - 10 } : {}),
    };
    if (format) {
      const formatted = formatDiagramCode(code);
      if (formatted.refused) data.formatRefused = formatted.refused.reason;
      else {
        data.formatted = formatted.text;
        data.formatChanged = formatted.changed;
      }
    }
    if (reference) data.reference = referenceOf();
    const drawn = `${count(counts.nodes, "node")}, ${count(counts.edges, "connection")}${counts.groups ? `, ${count(counts.groups, "group")}` : ""}${counts.frames ? `, ${count(counts.frames, "frame")}` : ""}`;
    const first = errors[0];
    return {
      summary: compiled.valid
        ? `The code is valid: ${drawn}${warnings.length > 0 ? `; ${count(warnings.length, "warning")}` : ""}.${format && data.formatted !== undefined ? (data.formatChanged ? " Formatted code returned." : " It is already formatted.") : ""}`
        : `The code has ${count(errors.length, "error")}; first at ${where(first)}: ${first.message}${first.suggestion ? ` (${first.suggestion})` : ""}. Nothing can be drawn until it is fixed.`,
      data,
    };
  },
};

// ── apply_diagram_code ───────────────────────────────────────────────────────

const applyInput = z
  .object({
    code: z.string().min(1).max(MAX_CODE_CHARS).describe("The whole diagram as code: what serialize_diagram returned, edited."),
    ids: targetIds.optional().describe("Only this part of the board (the same ids you passed to serialize_diagram). Default: the whole diagram."),
    with_layout: z.boolean().optional().describe("Must match serialize_diagram's with_layout: true when the code carries x, y, w, h and sides."),
    resolve: z.enum(["code", "canvas"]).optional().describe("When a person changed the same property on the board since you read it: take the code's value, or keep the board's."),
    confirm: z.literal(true).optional().describe(`Needed (the person is asked) when the update would remove ${BULK_REMOVE} or more elements.`),
    expected_revision: expectedRevision,
  })
  .strict();

/** The update entry for `after` over `before`: keys the new element dropped are sent as undefined, which the storage merge deletes. */
const asUpdate = (before: StoredElement | undefined, after: DrawingElement): DrawingElement => {
  if (!before) return after;
  const entry: Record<string, unknown> = { ...(after as unknown as Record<string, unknown>) };
  for (const key of Object.keys(before)) if (!(key in entry)) entry[key] = undefined;
  return entry as unknown as DrawingElement;
};

const coords = (el: unknown) => JSON.stringify(((el as { points?: Array<{ x: number; y: number }> }).points ?? []).map(({ x, y }) => [x, y]));
const rest = (el: unknown) => JSON.stringify({ ...(el as object), points: undefined });
/** The same element up to the anchor bookkeeping a connector's points may carry: writing it would change nothing anyone can see. */
const sameElement = (before: StoredElement | undefined, after: DrawingElement) => before !== undefined && coords(before) === coords(after) && rest(before) === rest(after);

export const applyDiagramCodeTool: ToolDefinition<typeof applyInput> = {
  name: "apply_diagram_code",
  group: "code",
  description:
    "Update the diagram on the board from edited diagram code (read it with serialize_diagram, change it, check it with check_diagram_code). Declarations are matched by name to the elements already there, so ids, styles, positions and connectors of what you did not change stay; only differences are written, as one undo step. Invalid code changes nothing. A new diagram is import_diagram.",
  input: applyInput,
  access: "write",
  run: async ({ code, ids, with_layout, resolve, confirm }, env) => {
    const { ctx } = env;
    const scope = ids ? resolveTargets(env, ids).shapeIds : [];
    const generationId = claimId(env, undefined);
    const loaded = loadFromCanvas(ctx.shapes, { selectedIds: scope, layout: with_layout === true, generationId });
    if (!loaded) throw new ToolError("invalid_state", "There is no diagram on the board to update (no labelled shapes). Use import_diagram to add one from code.");
    const outcome = planApply({ code, canvas: ctx.shapes, sync: loaded.sync, resolve, generationId });
    if (outcome.status === "invalid") {
      const issues = outcome.diagnostics.slice(0, 6).map((d) => `${where(d)}: ${d.message}`);
      throw new ToolError("invalid_arguments", `The code cannot be drawn, so the board was not changed: ${issues.join("; ")}. Fix these (check_diagram_code shows them all) and call again.`, { details: { issues: outcome.diagnostics.slice(0, 10).map(diagnosticData) } });
    }
    if (outcome.status === "conflict") {
      const list = outcome.conflicts.slice(0, 6).map((c) => `${c.key} ${c.field} (board: ${JSON.stringify(c.canvas)}, code: ${JSON.stringify(c.code)})`);
      throw new ToolError("conflict", `Someone changed the same things on the board since this code was read, so nothing was written: ${list.join("; ")}. Read the board again with serialize_diagram and redo your edit, or call again with resolve "code" (use the code's value) or "canvas" (keep the board's).`, { ids: outcome.conflicts.slice(0, 20).map((c) => c.elementId), details: { conflicts: outcome.conflicts.slice(0, 10) } });
    }

    const { plan } = outcome;
    const before = new Map(ctx.stored.map((item) => [item.id, item]));
    const removed = plan.patch.remove.filter((id) => before.has(id));
    const shapesGone = removed.filter((id) => ctx.index.shapes.has(id));
    if (shapesGone.length >= BULK_REMOVE || (shapesGone.length >= 3 && shapesGone.length > ctx.shapes.length / 2)) {
      if (!confirm) throw new ToolError("confirmation_required", `This code leaves out declarations that are on the board, so ${shapesGone.length} elements would be removed (${listIds(shapesGone)}). If the code is missing parts you did not mean to drop, add them back. If the removal is intended, repeat the call with confirm: true.`, { ids: shapesGone.slice(0, 20), details: { wouldRemove: shapesGone.length } });
      await env.confirm(`Remove ${shapesGone.length} elements that the code no longer declares?`);
    }

    const changed = plan.patch.update.filter((el) => !sameElement(before.get(el.id), el));
    const patch: DocPatch = { add: plan.patch.add, update: changed.map((el) => asUpdate(before.get(el.id), el)), remove: removed };
    const order = orderFramesBelowContents(applyPatch(ctx.stored, patch));
    if (order) patch.order = order;
    const { added, removed: gone, restored } = plan.summary;
    const updated = changed.length;
    const unchanged = plan.summary.unchanged + plan.summary.updated - changed.length;
    const changes = [added && `${added} added`, restored && `${restored} restored`, updated && `${updated} changed`, gone && `${gone} removed`].filter(Boolean).join(", ");
    return {
      summary: changes ? `Updated the diagram from code: ${changes}; ${count(unchanged, "element")} untouched.` : "The board already matches the code; nothing changed.",
      data: { added: plan.patch.add.map((el) => el.id).slice(0, 80), updated: changed.map((el) => el.id).slice(0, 80), removed, unchanged },
      patch,
      warnings: plan.issues.slice(0, 8).map((issue) => `${where(issue)}: ${issue.message}`),
    };
  },
};

export const CODE_TOOLS = [checkDiagramCodeTool, applyDiagramCodeTool] as const;
