import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";

/** Where a shape's label lives, in world units. Canvas drawing and the DOM editor both read this. */
export interface LabelRegion {
  centerX: number;
  centerY: number;
  /** Box handed to `layoutShapeLabel` (it subtracts its own padding). */
  width: number;
  height: number;
  maxLines?: number;
}

export const SEMANTIC_ICON_MAX = 28;
const ICON_LEFT_MARGIN = 14;
const ICON_LABEL_GAP = 12; // label starts iconSize + 26 from the edge: margin + gap
const LABEL_RIGHT_MARGIN = 12;
const MIN_LABEL_WIDTH = 32;
/** Lines a semantic node may show; node sizing grows the height to fit them (see node-size.ts). */
export const SEMANTIC_MAX_LINES = 4;
/** Width a semantic node spends on everything but its label region's own text: icon, margins, gap. */
export const SEMANTIC_INSET_WIDTH = SEMANTIC_ICON_MAX + ICON_LEFT_MARGIN + ICON_LABEL_GAP + LABEL_RIGHT_MARGIN;

export const semanticIconSize = (height: number) => Math.min(SEMANTIC_ICON_MAX, height * 0.42);
export const SEMANTIC_ICON_LEFT = ICON_LEFT_MARGIN;

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

export const getShapeLabelRegion = (type: string, bounds: Bounds): LabelRegion => {
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
    const icon = semanticIconSize(bounds.height);
    const left = bounds.minX + icon + ICON_LEFT_MARGIN + ICON_LABEL_GAP;
    const width = Math.max(MIN_LABEL_WIDTH, bounds.width - icon - ICON_LEFT_MARGIN - ICON_LABEL_GAP - LABEL_RIGHT_MARGIN);
    return {
      centerX: left + width / 2,
      centerY: bounds.minY + bounds.height / 2,
      width,
      // The whole node height: layoutShapeLabel subtracts its own padding, so a node sized by
      // node-size.ts holds exactly the lines it was sized for.
      height: bounds.height,
      maxLines: SEMANTIC_MAX_LINES,
    };
  }
  return {
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
  };
};
