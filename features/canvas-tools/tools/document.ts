import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import { splitStored } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { collectCopyGroups } from "@/core/groups/clone";
import { planInsertCopies } from "@/features/whiteboard/commands/duplicate";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import { confirmFlag, expectedRevision, MAX_ELEMENTS_ON_BOARD, MAX_IDS } from "../schemas";
import type { ToolDefinition } from "../types";
import { ISSUE_CODES, REPAIRABLE, repairBoard, type IssueCode } from "../validate";
import { count, defaultOrigin, resolveTargets } from "./helpers";

// ── undo / redo ──────────────────────────────────────────────────────────────

const historyInput = z.object({ steps: z.number().int().min(1).max(20).optional().describe("How many steps (default 1).") }).strict();

const historyTool = (name: "undo_action" | "redo_action", direction: "undo" | "redo"): ToolDefinition<typeof historyInput> => ({
  name,
  group: "document",
  description:
    direction === "undo"
      ? "Undo the most recent change(s) on this board, the same as the person pressing Undo. That can be a change someone else made; the result says what was undone."
      : "Redo change(s) that were undone, the same as the person pressing Redo.",
  input: historyInput,
  access: "write",
  needs: ["history"],
  run: async ({ steps = 1 }, { host }) => {
    const step = direction === "undo" ? host.undo : host.redo;
    if (!step) throw new ToolError("unavailable", `${name} is not available here.`);
    let done = 0;
    for (let i = 0; i < steps; i += 1) {
      const outcome = await step.call(host);
      if (!outcome.changed) break;
      done += 1;
    }
    return {
      summary: done === 0 ? `Nothing to ${direction}.` : `${direction === "undo" ? "Undid" : "Redid"} ${count(done, "step")}.`,
      data: { steps: done, requested: steps },
      ...(done < steps ? { warnings: [`Only ${count(done, "step")} could be ${direction === "undo" ? "undone" : "redone"}.`] } : {}),
    };
  },
});

export const undoAction = historyTool("undo_action", "undo");
export const redoAction = historyTool("redo_action", "redo");

// ── clear_canvas ──────────────────────────────────────────────────────────────

const clearInput = z.object({ confirm: confirmFlag, expected_revision: expectedRevision }).strict();

export const clearCanvas: ToolDefinition<typeof clearInput> = {
  name: "clear_canvas",
  group: "document",
  description: "Delete EVERYTHING on the board, including locked elements. Only for an explicit request to clear or empty the whole board. Needs confirm: true and the person's approval; undoable with undo_action.",
  input: clearInput,
  access: "write",
  destructive: true,
  strictRevision: true,
  run: async (_input, env) => {
    const { ctx } = env;
    if (ctx.stored.length === 0) return { summary: "The board is already empty.", data: { removed: 0 } };
    const locked = ctx.shapes.filter((shape) => shape.locked === true).length;
    await env.confirm(`Delete all ${ctx.shapes.length} elements on this board${locked > 0 ? ` (including ${locked} locked)` : ""}?`);
    const patch: DocPatch = { add: [], update: [], remove: ctx.stored.map((item) => item.id) };
    return { summary: `Cleared the board: removed ${count(ctx.shapes.length, "element")}.`, data: { removed: ctx.shapes.length }, patch, selection: [] };
  },
};

// ── export / save ────────────────────────────────────────────────────────────

const exportInput = z
  .object({
    format: z.enum(["png", "svg", "pdf"]),
    scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe("Pixel density for png (default 2)."),
    transparent: z.boolean().optional().describe("png/svg without a background (default false)."),
    ids: z.array(z.string().max(130)).min(1).max(MAX_IDS).optional().describe("Export only these elements; default is the whole board."),
  })
  .strict();

export const exportDiagram: ToolDefinition<typeof exportInput> = {
  name: "export_diagram",
  group: "document",
  description: "Export the board (or some elements) as PNG, SVG or PDF; the file is delivered to the person's browser as a download. Changes nothing on the board.",
  input: exportInput,
  access: "read",
  needs: ["export"],
  run: async ({ format, scale, transparent, ids }, env) => {
    const { host } = env;
    if (!host.exportDiagram) throw new ToolError("unavailable", "Export is not available here.");
    const targets = ids ? resolveTargets(env, ids).shapeIds : undefined;
    if (env.ctx.shapes.length === 0) throw new ToolError("invalid_state", "The board is empty; there is nothing to export.");
    const outcome = await host.exportDiagram({ format, scale: scale ?? 2, transparent: transparent === true, ...(targets ? { ids: targets } : {}) });
    return { summary: `Exported ${outcome.filename} (${format.toUpperCase()}, ${outcome.width}x${outcome.height}).`, data: { ...outcome } };
  },
};

const saveInput = z.object({}).strict();

export const saveDocument: ToolDefinition<typeof saveInput> = {
  name: "save_document",
  group: "document",
  description: "Save the board now (the same as Ctrl+S). The board also saves automatically; use this when the person asks to save.",
  input: saveInput,
  access: "write",
  needs: ["save"],
  run: async (_input, { host }) => {
    if (!host.save) throw new ToolError("unavailable", "Saving is not available here.");
    const outcome = await host.save();
    if (!outcome.saved) throw new ToolError("execution_failed", outcome.message ?? "The board could not be saved.");
    return { summary: outcome.message ?? "Saved.", data: { saved: true } };
  },
};

// ── load_document ────────────────────────────────────────────────────────────

const loadInput = z
  .object({
    whiteboard_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "a whiteboard id").optional().describe("Another whiteboard the person can open."),
    content: z.string().min(2).max(5_000_000).optional().describe("Saved board JSON (the editor's own format)."),
    mode: z.enum(["merge", "replace"]).describe("merge: add the loaded elements beside what is here (new ids; nothing is removed). replace: replace the whole board (needs confirm: true and the person's approval)."),
    confirm: confirmFlag.optional(),
    expected_revision: expectedRevision,
  })
  .strict();

export const loadDocument: ToolDefinition<typeof loadInput> = {
  name: "load_document",
  group: "document",
  description: "Load a saved board into this one, from another whiteboard the person is allowed to open or from saved JSON. The document is validated first; an invalid one is rejected whole. merge keeps everything here; replace swaps the whole board and needs confirmation.",
  input: loadInput,
  access: "write",
  needs: ["load"],
  strictRevision: true,
  run: async ({ whiteboard_id, content, mode, confirm }, env) => {
    const { host, ctx } = env;
    if (!host.load) throw new ToolError("unavailable", "Loading is not available here.");
    if ((whiteboard_id === undefined) === (content === undefined)) throw new ToolError("invalid_arguments", "Give exactly one of `whiteboard_id` or `content`.");
    if (mode === "replace" && ctx.stored.length > 0) {
      if (!confirm) throw new ToolError("confirmation_required", "Replacing the board removes everything on it. Repeat with confirm: true if that is what was asked for.");
      await env.confirm(`Replace this board's ${ctx.shapes.length} elements with the loaded document?`);
    }
    let loaded;
    try {
      loaded = await host.load(whiteboard_id !== undefined ? { kind: "whiteboard", id: whiteboard_id } : { kind: "content", content: content! });
    } catch (error) {
      // The host words these (no access, not found, not a saved board) without server detail, so the model can pass them on.
      throw new ToolError("not_found", error instanceof Error && error.message ? error.message : "The document could not be loaded.");
    }
    if (loaded.elements.length === 0) throw new ToolError("invalid_state", "The document has no elements.");
    if (loaded.elements.length > MAX_ELEMENTS_ON_BOARD) throw new ToolError("limit_exceeded", `The document has ${loaded.elements.length} elements; the limit is ${MAX_ELEMENTS_ON_BOARD}.`);

    if (mode === "replace") {
      // An id the old and new board share is rewritten in place (every old key cleared, then the new ones): remove-and-add of one id cannot be expressed in a single patch.
      const incoming = new Set(loaded.elements.map((item) => item.id));
      const existing = new Map(ctx.stored.map((item) => [item.id, item]));
      const rewrite = (item: (typeof loaded.elements)[number]) => ({ ...Object.fromEntries(Object.keys(existing.get(item.id) ?? {}).map((key) => [key, undefined])), ...item }) as (typeof loaded.elements)[number];
      const patch: DocPatch = {
        add: loaded.elements.filter((item) => !existing.has(item.id)),
        update: loaded.elements.filter((item) => existing.has(item.id)).map(rewrite),
        remove: ctx.stored.map((item) => item.id).filter((id) => !incoming.has(id)),
        order: loaded.elements.map((item) => item.id),
      };
      return { summary: `Replaced the board with ${count(loaded.elements.length, "element")}${loaded.title ? ` from "${loaded.title}"` : ""}.`, data: { loaded: loaded.elements.length, mode }, patch, selection: [] };
    }

    const { shapes: rawShapes, records } = splitStored(loaded.elements);
    // A group reference that points at nothing in the document must not latch onto a group of this board that happens to share the id.
    const known = new Set(records.map((record) => record.id));
    const shapes = rawShapes.map((shape) => (shape.groupId !== undefined && !known.has(shape.groupId) ? ({ ...shape, groupId: undefined } as DrawingElement) : shape));
    const origin = defaultOrigin(env);
    const box = unionBounds(shapes.flatMap((shape) => ctx.getBounds(shape) ?? []));
    const dx = origin.x - (box?.minX ?? 0);
    const dy = origin.y - (box?.minY ?? 0);
    const shifted = shapes.map((shape) => ({ ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })) as DrawingElement[];
    const plan = planInsertCopies(ctx, shifted, collectCopyGroups(loaded.elements, new Set(shifted.map((shape) => shape.id))), 0);
    return { summary: `Added ${count(plan.selection.length, "element")} from the loaded document beside the existing content.`, data: { loaded: plan.selection.length, mode, created: plan.selection }, patch: plan.patch };
  },
};

// ── validate_and_repair_diagram ──────────────────────────────────────────────────

const repairInput = z
  .object({
    codes: z.array(z.enum(ISSUE_CODES)).min(1).max(ISSUE_CODES.length).describe("Exactly which problems to fix, by code as reported by validate_diagram. Only repairable kinds are touched."),
    dangling_connectors: z.enum(["remove", "detach"]).optional().describe("For dangling_connector: remove them (default) or keep them as free arrows."),
    expected_revision: expectedRevision,
  })
  .strict();

export const validateAndRepairDiagram: ToolDefinition<typeof repairInput> = {
  name: "validate_and_repair_diagram",
  group: "document",
  description: `Fix the specific problems you name (${[...REPAIRABLE].join(", ")}) and nothing else: dangling connectors are removed or detached, bad anchors re-attached, empty groups and orphaned labels cleared. Run validate_diagram first and pass only the codes you intend to fix.`,
  input: repairInput,
  access: "write",
  run: ({ codes, dangling_connectors }, env) => {
    const unique = [...new Set(codes)] as IssueCode[];
    const result = repairBoard(env.ctx, unique, { danglingPolicy: dangling_connectors ?? "remove" });
    const notRepairable = unique.filter((code) => !REPAIRABLE.has(code));
    const warnings = [...notRepairable.map((code) => `${code} is reported by validate_diagram but cannot be fixed automatically.`), ...result.skipped.filter((s) => REPAIRABLE.has(s.code as IssueCode)).map((s) => `${s.code}: ${s.reason}`)];
    if (!result.patch && result.repaired.length === 0 && notRepairable.length === unique.length) throw new ToolError("unsupported", warnings[0]);
    return {
      summary: result.patch ? `Repaired ${result.repaired.map((r) => `${r.code} (${r.ids.length})`).join(", ")}.` : "Nothing to repair.",
      data: { repaired: result.repaired },
      patch: result.patch,
      warnings,
    };
  },
};

export const DOCUMENT_TOOLS = [undoAction, redoAction, clearCanvas, exportDiagram, saveDocument, loadDocument, validateAndRepairDiagram] as const;

