import type { DocPatch } from "@/core/groups/patch";
import { mergeNodeStyle } from "@/core/shapes/semantic-node/style";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { editableIds } from "./editable";
import type { CommandContext } from "./context";

/** The look of an element that the toolbar, the inspector and the AI can change without replacing anything else. */
export interface StyleChange {
  color?: string;
  /** A colour, or null to remove the fill. */
  fill?: string | null;
  strokeWidth?: number;
  /** 0 (invisible) to 1. */
  opacity?: number;
  /** World units; rectangles, semantic nodes and frames. */
  cornerRadius?: number;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
}

export type StyleKey = keyof StyleChange;

const config = (shape: DrawingElement) => getShapeDefinition(shape.type)?.propertiesConfig;

/** Whether a property means something for this element. The editor's toolbar does not care; the AI is told. */
export const supportsStyle = (shape: DrawingElement, key: StyleKey): boolean => {
  switch (key) {
    case "color":
    case "opacity":
      return true;
    case "fill":
      return config(shape)?.supportsFill === true;
    case "strokeWidth":
      return config(shape)?.supportsStrokeWidth === true;
    case "cornerRadius":
      return shape.type === "rectangle" || shape.type === "semantic-node" || shape.type === "frame";
    case "fontSize":
    case "fontWeight":
    case "fontStyle":
      return shape.type === "text" || getShapeDefinition(shape.type)?.labelConfig?.anchor === "center";
  }
};

export interface StylePlan {
  patch: DocPatch | null;
  /** Elements that were (or would be) changed. */
  changed: string[];
  /** Elements asked to take a property they cannot (strict mode only: they are left alone). */
  unsupported: Array<{ id: string; keys: StyleKey[] }>;
  locked: string[];
  missing: string[];
}

const apply = (shape: DrawingElement, change: StyleChange, keys: StyleKey[]): DrawingElement => {
  const next: Record<string, unknown> = { ...shape };
  for (const key of keys) {
    const value = change[key];
    if (key === "fill") {
      next.fill = value === null ? undefined : value;
    } else if (key === "cornerRadius") {
      if (shape.type === "semantic-node") next.nodeStyle = mergeNodeStyle((shape as { nodeStyle?: unknown }).nodeStyle, { cornerRadius: value as number });
      else next.cornerRadius = value;
    } else if (key === "opacity") {
      // Fully opaque is the default: store nothing, so an untouched element stays byte-identical.
      next.opacity = value === 1 ? undefined : value;
    } else {
      next[key] = value;
    }
  }
  return next as unknown as DrawingElement;
};

/**
 * Restyles shapes (a group's shapes when a group id was expanded by the caller). Locked shapes are never
 * restyled. In `strict` mode (the AI) a property an element cannot show is reported and that element is
 * skipped whole, so a call never half-applies; the editor's toolbar passes `strict: false` and sets
 * whatever it is given, as it always has.
 */
export const planStyle = (ctx: CommandContext, ids: readonly string[], change: StyleChange, { strict }: { strict: boolean }): StylePlan => {
  const keys = (Object.keys(change) as StyleKey[]).filter((key) => change[key] !== undefined || key === "fill");
  const unlocked = new Set(editableIds(ctx, ids));
  const plan: StylePlan = { patch: null, changed: [], unsupported: [], locked: [], missing: [] };
  const update: DrawingElement[] = [];
  for (const id of ids) {
    const shape = ctx.index.shapes.get(id);
    if (!shape) {
      plan.missing.push(id);
      continue;
    }
    if (!unlocked.has(id)) {
      plan.locked.push(id);
      continue;
    }
    const applicable = strict ? keys.filter((key) => supportsStyle(shape, key)) : keys.filter((key) => key !== "cornerRadius" || supportsStyle(shape, key));
    if (strict && applicable.length !== keys.length) {
      plan.unsupported.push({ id, keys: keys.filter((key) => !applicable.includes(key)) });
      continue;
    }
    const next = apply(shape, change, applicable);
    if (JSON.stringify(next) !== JSON.stringify(shape)) {
      update.push(next);
      plan.changed.push(id);
    }
  }
  plan.patch = update.length === 0 ? null : { add: [], update, remove: [] };
  return plan;
};
