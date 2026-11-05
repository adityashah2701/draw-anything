import { z } from "zod";
import { layoutEnginesEnabled } from "@/core/layout/flags";
import { planEngineLayout } from "@/features/whiteboard/commands/layout-engine";
import { ToolError } from "../errors";
import { expectedRevision, targetIds } from "../schemas";
import type { ToolDefinition } from "../types";
import { count, resolveTargets } from "./helpers";

const input = z
  .object({
    mode: z.enum(["preserve", "adjust", "overwrite"]).describe("preserve: nothing that exists moves. adjust (default): only elements a layout placed move; anything a person placed or locked stays. overwrite: also moves what a person placed (never locked), needs apply and confirm."),
    engine: z.string().max(40).optional().describe("architecture or freeform. Omit to use the diagram's own layout."),
    algorithm: z.string().max(40).optional(),
    ids: targetIds.optional().describe("Lay out only these. Omit for the whole diagram."),
    new_ids: z.array(z.string().max(100)).max(200).optional().describe("Elements just added that need a place."),
    apply: z.boolean().optional().describe("false (default): preview only, nothing changes. true: apply it."),
    confirm: z.boolean().optional().describe("overwrite only: the person agreed that elements they placed will move."),
    remember: z.boolean().optional().describe("Store the engine as the diagram's layout."),
    expected_revision: expectedRevision,
  })
  .strict();

export const layoutDiagramTool: ToolDefinition<typeof input> = {
  name: "layout_diagram",
  group: "arrange",
  description: "Preview or apply a layout engine on the diagram without overriding the person's placements: modes preserve / adjust / overwrite. The default only previews (nothing changes) and says what would move; set apply: true to apply it as one undo step. Elements a person placed and locked elements are never moved except by overwrite, and locked never.",
  input,
  access: "write",
  run: async ({ mode, engine, algorithm, ids, new_ids, apply, confirm, remember }, env) => {
    if (!layoutEnginesEnabled()) throw new ToolError("unavailable", "Layout engines are turned off in this build (NEXT_PUBLIC_LAYOUT_ENGINES=legacy).");
    const shapeIds = ids ? resolveTargets(env, ids).shapeIds : null;
    const plan = planEngineLayout(env.ctx, { mode, engine, algorithm, ids: shapeIds, newIds: new_ids, confirm, remember });
    const { preview } = plan;
    const summary = `${preview.engine}/${preview.algorithm}, ${mode}: ${preview.moves.length === 0 ? "nothing would move" : `${count(preview.moves.length, "element")} would move (largest ${Math.round(preview.stats.maxDisplacement)} units)`}; ${count(preview.stats.heldFixed, "element")} held in place.`;
    const data = { preview };
    if (!apply) return { summary: `Preview (not applied): ${summary}`, data, warnings: preview.warnings.length ? preview.warnings : undefined };
    if (preview.needsConfirmation) {
      if (!confirm) throw new ToolError("confirmation_required", `Overwrite would move ${count(preview.userPlacedMoved, "element")} the person placed by hand. Repeat with confirm: true if that is what was asked for.`);
    }
    if (mode === "overwrite" && preview.userPlacedMoved > 0) await env.confirm(`Re-lay out the diagram, moving ${count(preview.userPlacedMoved, "element")} you placed by hand?`);
    return { summary: plan.patch ? `Applied: ${summary}` : `Nothing to apply: ${summary}`, data, patch: plan.patch, warnings: preview.warnings.length ? preview.warnings : undefined };
  },
};

export const LAYOUT_TOOLS = [layoutDiagramTool] as const;
