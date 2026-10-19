import { z } from "zod";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import { unitBoxes } from "@/core/groups/units";
import { planAlign, planDistribute, planSpacing } from "@/features/whiteboard/commands/arrange";
import { planAutoLayout, planTidy, type LayoutPlan } from "@/features/whiteboard/commands/layout";
import { ToolError } from "../errors";
import { expectedRevision, targetIds } from "../schemas";
import type { ToolDefinition, ToolEnv, ToolRun } from "../types";
import { count, lockedSkips, resolveTargets } from "./helpers";

const unitsIn = (env: ToolEnv, shapeIds: readonly string[]) => {
  const { ctx } = env;
  return unitBoxes(ctx.index, shapeIds, (id) => {
    const shape = ctx.index.shapes.get(id);
    return shape ? ctx.getBounds(shape) : null;
  });
};

const lockedIn = (env: ToolEnv, shapeIds: readonly string[]) => lockedSkips(shapeIds.filter((id) => isEffectivelyLocked(env.ctx.index, id)));

const moved = (patch: { update: Array<{ id: string }> } | null) => patch?.update.map((item) => item.id) ?? [];

// ── align / distribute / spacing ───────────────────────────────────────────────

const alignInput = z
  .object({
    ids: targetIds.min(2),
    mode: z.enum(["left", "center", "right", "top", "middle", "bottom"]).describe("left/center/right line up vertical edges; top/middle/bottom line up horizontal edges. Aligned to the outermost edge (or centre) of the selection."),
    expected_revision: expectedRevision,
  })
  .strict();

export const alignElements: ToolDefinition<typeof alignInput> = {
  name: "align_elements",
  group: "arrange",
  description: "Line elements up on a shared edge or centre. Groups count as one box; locked elements stay where they are and others align to them. Connectors follow.",
  input: alignInput,
  access: "write",
  run: ({ ids, mode }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const units = unitsIn(env, shapeIds);
    if (units.length < 2) throw new ToolError("invalid_state", "Aligning needs at least two separate elements or groups.");
    const patch = planAlign(env.ctx, shapeIds, mode);
    const changed = moved(patch);
    return { summary: patch ? `Aligned ${count(units.length, "item")} (${mode}); moved ${count(changed.length, "element")}.` : `Already aligned (${mode}); nothing moved.`, data: { mode, moved: changed }, patch, skipped: lockedIn(env, shapeIds) };
  },
};

const distributeInput = z
  .object({
    ids: targetIds.min(3),
    axis: z.enum(["horizontal", "vertical"]).describe("horizontal: equal gaps left to right; vertical: equal gaps top to bottom. The outermost items stay put."),
    expected_revision: expectedRevision,
  })
  .strict();

export const distributeElements: ToolDefinition<typeof distributeInput> = {
  name: "distribute_elements",
  group: "arrange",
  description: "Space three or more elements evenly along an axis (equal gaps between neighbours); the two outermost stay where they are. Groups count as one box; locked elements are left out. Connectors follow.",
  input: distributeInput,
  access: "write",
  run: ({ ids, axis }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const units = unitsIn(env, shapeIds).filter((unit) => !unit.locked);
    if (units.length < 3) throw new ToolError("invalid_state", "Distributing needs at least three unlocked elements or groups.");
    const patch = planDistribute(env.ctx, shapeIds, axis);
    const changed = moved(patch);
    return { summary: patch ? `Distributed ${count(units.length, "item")} ${axis}ly; moved ${count(changed.length, "element")}.` : "Already evenly spaced; nothing moved.", data: { axis, moved: changed }, patch, skipped: lockedIn(env, shapeIds) };
  },
};

const spacingInput = z
  .object({
    ids: targetIds.min(2),
    axis: z.enum(["horizontal", "vertical"]).describe("horizontal: side-by-side gaps; vertical: stacked gaps."),
    gap: z.number().finite().min(0).max(2000).describe("The exact clear space between neighbours, in board units."),
    expected_revision: expectedRevision,
  })
  .strict();

export const setElementSpacing: ToolDefinition<typeof spacingInput> = {
  name: "set_element_spacing",
  group: "arrange",
  description: "Set an exact gap between neighbouring elements along an axis (the first in reading order stays put, the rest shift). Groups count as one box; locked elements are left out. Connectors follow.",
  input: spacingInput,
  access: "write",
  run: ({ ids, axis, gap }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const units = unitsIn(env, shapeIds).filter((unit) => !unit.locked);
    if (units.length < 2) throw new ToolError("invalid_state", "Spacing needs at least two unlocked elements or groups.");
    const patch = planSpacing(env.ctx, shapeIds, axis, gap);
    const changed = moved(patch);
    return { summary: patch ? `Set the ${axis} gap to ${gap} between ${count(units.length, "item")}; moved ${count(changed.length, "element")}.` : `The ${axis} gap is already ${gap}; nothing moved.`, data: { axis, gap, moved: changed }, patch, skipped: lockedIn(env, shapeIds) };
  },
};

// ── layouts ──────────────────────────────────────────────────────────────────

const layoutRun = (plan: LayoutPlan, label: string): ToolRun => {
  const changed = moved(plan.patch);
  const hardFail = plan.patch === null && plan.units < 2 && plan.notes.length > 0;
  if (hardFail) throw new ToolError("invalid_state", plan.notes[0]);
  return {
    summary: plan.patch ? `${label}: arranged ${plan.units} item${plan.units === 1 ? "" : "s"}; moved ${count(changed.length, "element")}.` : `${label}: nothing needed to move.`,
    data: { moved: plan.moved, units: plan.units },
    patch: plan.patch,
    warnings: plan.notes,
  };
};

const layoutInput = z
  .object({
    ids: targetIds.optional().describe("Arrange only these (groups count as one box). Omit to arrange every node on the board."),
    algorithm: z.enum(["layered", "row", "column", "grid", "circle"]).describe("layered: ranks following the connectors (flows, architectures); row / column: one line in reading order; grid; circle."),
    direction: z.enum(["down", "right"]).optional().describe("layered only: ranks run downwards (default) or to the right."),
    gap: z.number().finite().min(0).max(1000).optional().describe("Clear space between neighbours (default 48)."),
    columns: z.number().int().min(1).max(50).optional().describe("grid only: number of columns (default about square)."),
    expected_revision: expectedRevision,
  })
  .strict();

export const autoLayout: ToolDefinition<typeof layoutInput> = {
  name: "auto_layout",
  group: "arrange",
  description: "Re-arrange nodes with a layout algorithm. Only positions change: ids, labels, sizes, connections and groups are kept, connectors are re-routed, locked elements stay, and the result stays where the nodes were. Moves many elements: pass the board's current revision.",
  input: layoutInput,
  access: "write",
  strictRevision: true,
  run: ({ ids, algorithm, direction, gap, columns }, env) => {
    const shapeIds = ids ? resolveTargets(env, ids).shapeIds : null;
    return layoutRun(planAutoLayout(env.ctx, shapeIds, { algorithm, direction, gap, columns }), `auto_layout (${algorithm})`);
  },
};

const tidyInput = z
  .object({
    ids: targetIds.optional().describe("Tidy only these; omit for every node on the board."),
    tolerance: z.number().finite().min(0).max(200).optional().describe("Centres closer than this count as one row or column (default 24)."),
    min_gap: z.number().finite().min(0).max(400).optional().describe("Clear space kept when overlapping shapes are pulled apart (default 24)."),
    expected_revision: expectedRevision,
  })
  .strict();

export const tidyDiagram: ToolDefinition<typeof tidyInput> = {
  name: "tidy_diagram",
  group: "arrange",
  description: "Clean up an untidy diagram without changing what it says: near-aligned shapes snap into rows and columns, rows and columns get equal gaps, overlapping shapes are pulled apart. Ids, labels, connections, groups and stacking are untouched; connectors are re-routed; locked shapes stay. Moves elements: pass the board's current revision.",
  input: tidyInput,
  access: "write",
  strictRevision: true,
  run: ({ ids, tolerance, min_gap }, env) => {
    const shapeIds = ids ? resolveTargets(env, ids).shapeIds : null;
    return layoutRun(planTidy(env.ctx, shapeIds, { tolerance, minGap: min_gap }), "tidy_diagram");
  },
};

const PRESETS = {
  flow_down: { label: "Flow, top to bottom", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "layered", direction: "down", gap: 64 }) },
  flow_right: { label: "Flow, left to right", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "layered", direction: "right", gap: 64 }) },
  row: { label: "Single row", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "row", gap: 48 }) },
  column: { label: "Single column", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "column", gap: 48 }) },
  grid: { label: "Grid", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "grid", gap: 48 }) },
  compact_grid: { label: "Compact grid", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "grid", gap: 24 }) },
  circle: { label: "Circle", run: (env: ToolEnv, ids: string[] | null) => planAutoLayout(env.ctx, ids, { algorithm: "circle", gap: 48 }) },
  tidy: { label: "Tidy", run: (env: ToolEnv, ids: string[] | null) => planTidy(env.ctx, ids, {}) },
} as const;

const presetInput = z
  .object({
    preset: z.enum(Object.keys(PRESETS) as [keyof typeof PRESETS, ...Array<keyof typeof PRESETS>]).describe("flow_down / flow_right (follow the connectors), row, column, grid, compact_grid, circle, tidy (clean up in place)."),
    ids: targetIds.optional().describe("Only these elements; omit for every node on the board."),
    expected_revision: expectedRevision,
  })
  .strict();

export const applyLayoutPreset: ToolDefinition<typeof presetInput> = {
  name: "apply_layout_preset",
  group: "arrange",
  description: "Apply a named layout (flow_down, flow_right, row, column, grid, compact_grid, circle, tidy) with sensible spacing. Same guarantees as auto_layout: only positions change, connectors are re-routed, locked shapes stay.",
  input: presetInput,
  access: "write",
  strictRevision: true,
  run: ({ preset, ids }, env) => {
    const shapeIds = ids ? resolveTargets(env, ids).shapeIds : null;
    const entry = PRESETS[preset];
    return layoutRun(entry.run(env, shapeIds), entry.label);
  },
};

export const ARRANGE_TOOLS = [alignElements, distributeElements, setElementSpacing, autoLayout, tidyDiagram, applyLayoutPreset] as const;

