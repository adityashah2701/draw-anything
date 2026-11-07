import { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import { CORNER_RADIUS_LIMITS } from "@/core/shapes/semantic-node/style";
import { planStyle, type StyleChange, type StyleKey } from "@/features/whiteboard/commands/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../../errors";
import { color, fill, targetIds } from "../../schemas";
import type { ToolEnv } from "../../types";
import { count, requireEditable, resolveTargets } from "../helpers";

export const strokeWidth = z.number().finite().min(0.5).max(24);
export const opacity = z.number().finite().min(0).max(1).describe("0 invisible to 1 opaque.");
export const fontSize = z.number().finite().min(6).max(200);
export const fontWeight = z.enum(["400", "500", "600", "700", "800"]);
export const skipLocked = z.boolean().optional().describe("Leave locked elements out instead of failing the call.");

export const normalizeText = (value: string) => value.replace(/\r\n?/g, "\n");
export const updatePatch = (changed: readonly DrawingElement[]): DocPatch | null =>
  changed.length === 0 ? null : { add: [], update: [...changed], remove: [] };

/** The editable shape ids behind `ids`, with locked ones either an error or skipped (and said so). */
export const editableTargets = (env: ToolEnv, ids: readonly string[], skip: boolean | undefined) => {
  const { shapeIds } = resolveTargets(env, ids);
  const { editable, skipped } = requireEditable(env.ctx, shapeIds, { skipLocked: skip });
  if (editable.length === 0) throw new ToolError("locked", "Every target is locked, so nothing was changed.", { ids: shapeIds });
  return { shapeIds, editable, skipped };
};

export interface StyleInput {
  color?: string;
  fill?: string | null;
  stroke_width?: number;
  opacity?: number;
  corner_radius?: number;
  font_size?: number;
  font_weight?: string;
  font_style?: "normal" | "italic";
}

export const toStyleChange = (input: StyleInput): StyleChange => ({
  ...(input.color !== undefined ? { color: input.color } : {}),
  ...(input.fill !== undefined ? { fill: input.fill } : {}),
  ...(input.stroke_width !== undefined ? { strokeWidth: input.stroke_width } : {}),
  ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
  ...(input.corner_radius !== undefined ? { cornerRadius: input.corner_radius } : {}),
  ...(input.font_size !== undefined ? { fontSize: input.font_size } : {}),
  ...(input.font_weight !== undefined ? { fontWeight: input.font_weight } : {}),
  ...(input.font_style !== undefined ? { fontStyle: input.font_style } : {}),
});

/**
 * Restyles with the editor's own command. A property an element cannot show leaves that element out and
 * is reported; a call where nothing could be applied is an error, never a quiet success.
 */
export const applyStyle = (env: ToolEnv, editable: readonly string[], change: StyleChange) => {
  const keys = Object.keys(change) as StyleKey[];
  if (keys.length === 0) throw new ToolError("invalid_arguments", "Give at least one property to change.");
  const plan = planStyle(env.ctx, editable, change, { strict: true });
  const skipped = plan.unsupported.map(({ id, keys: bad }) => ({
    id,
    reason: `a ${env.ctx.index.shapes.get(id)?.type ?? "element"} cannot take ${bad.join(", ")}`,
  }));
  if (plan.changed.length === 0 && plan.unsupported.length > 0) {
    throw new ToolError(
      "unsupported",
      `None of the ${count(editable.length, "element")} can take ${[...new Set(plan.unsupported.flatMap((u) => u.keys))].join(", ")}. ${skipped[0].reason}.`,
      { ids: plan.unsupported.map((u) => u.id) },
    );
  }
  return { patch: plan.patch, changed: plan.changed, skipped };
};

export const styleFields = {
  color: color.optional().describe("Outline / line / text colour."),
  fill: fill.optional(),
  stroke_width: strokeWidth.optional(),
  opacity: opacity.optional(),
  corner_radius: z.number().finite().min(0).max(CORNER_RADIUS_LIMITS.max * 2).optional().describe("Rectangles and semantic nodes; 0 is square."),
};
