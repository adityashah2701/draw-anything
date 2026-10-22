import { ICON_CAPTION_HEIGHT } from "@/core/shapes/icon/caption";
import { layoutSemanticNode } from "@/core/shapes/semantic-node/layout";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";

export { SEMANTIC_INSET_WIDTH, SEMANTIC_MAX_LINES } from "@/core/shapes/semantic-node/layout";

/** Where a shape's label lives, in world units. Canvas drawing and the DOM editor both read this. */
export interface LabelRegion {
  centerX: number;
  centerY: number;
  /** Box handed to `layoutShapeLabel` (it subtracts its own padding). */
  width: number;
  height: number;
  maxLines?: number;
  /** How lines sit in the region: centred (the default) or flush with its left padding edge. */
  align?: "left" | "center";
}

const MIN_LABEL_WIDTH = 32;

/**
 * The text box of a pill (a rectangle with fully rounded ends): inset by half a radius at each end and
 * 70% of the height, which keeps its corners inside the rounded ends. The renderer, the node sizing
 * and the layout metrics all read it from here.
 */
export const PILL_MAX_LINES = 3;
const PILL_HEIGHT_SHARE = 0.7;
export const pillLabelBox = (width: number, height: number) => ({
  width: Math.max(MIN_LABEL_WIDTH, width - height / 2),
  height: height * PILL_HEIGHT_SHARE,
  maxLines: PILL_MAX_LINES,
});
/** The inverse of `pillLabelBox`: the smallest pill (not below `min`) whose label box holds `box`. */
export const pillSizeForLabel = (box: { width: number; height: number }, min: { width: number; height: number }) => {
  const height = Math.max(min.height, Math.ceil(box.height / PILL_HEIGHT_SHARE));
  return { width: Math.max(min.width, Math.ceil(box.width + height / 2)), height };
};

/** Share of a shape's bounds its label may use; the renderers and the editor both read these. */
export const ELLIPSE_LABEL_FRACTION = 0.72;
export const DIAMOND_LABEL_FRACTION = 0.66;
const SHAPE_LABEL_FRACTION: Record<string, number> = {
  circle: ELLIPSE_LABEL_FRACTION,
  ellipse: ELLIPSE_LABEL_FRACTION,
  diamond: DIAMOND_LABEL_FRACTION,
};
const FRACTION_MAX_LINES = 3;

/**
 * `nodeStyle` is the element's stored `nodeStyle`; only a semantic node reads it (its icon placement and
 * size decide where the text goes). `variant` is the element's `variant`; only an outline reads it.
 */
export const getShapeLabelRegion = (type: string, bounds: Bounds, nodeStyle?: unknown, variant?: string): LabelRegion => {
  if (type === "outline") {
    const text = resolveOutlineVariant(variant).textRegion(bounds.width, bounds.height);
    return { centerX: bounds.minX + text.x + text.width / 2, centerY: bounds.minY + text.y + text.height / 2, width: text.width, height: text.height, maxLines: FRACTION_MAX_LINES };
  }
  if (type === "icon") {
    // An icon node names itself in a caption under the glyph (see core/shapes/icon/caption.ts).
    return { centerX: bounds.minX + bounds.width / 2, centerY: bounds.maxY - ICON_CAPTION_HEIGHT / 2, width: bounds.width, height: ICON_CAPTION_HEIGHT, maxLines: 2 };
  }
  if (type === "pill") {
    const box = pillLabelBox(bounds.width, bounds.height);
    return { centerX: bounds.minX + bounds.width / 2, centerY: bounds.minY + bounds.height / 2, ...box };
  }
  const fraction = SHAPE_LABEL_FRACTION[type];
  if (fraction) {
    return {
      centerX: bounds.minX + bounds.width / 2,
      centerY: bounds.minY + bounds.height / 2,
      width: bounds.width * fraction,
      height: bounds.height * fraction,
      maxLines: FRACTION_MAX_LINES,
    };
  }
  if (type === "semantic-node") {
    // The node's layout decides where the icon is and so where the text may go.
    return layoutSemanticNode(bounds, nodeStyle).region;
  }
  return {
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
  };
};
