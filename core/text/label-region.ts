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

export const semanticIconSize = (height: number) => Math.min(SEMANTIC_ICON_MAX, height * 0.42);
export const SEMANTIC_ICON_LEFT = ICON_LEFT_MARGIN;

export const getShapeLabelRegion = (type: string, bounds: Bounds): LabelRegion => {
  if (type === "semantic-node") {
    const icon = semanticIconSize(bounds.height);
    const left = bounds.minX + icon + ICON_LEFT_MARGIN + ICON_LABEL_GAP;
    const width = Math.max(MIN_LABEL_WIDTH, bounds.width - icon - ICON_LEFT_MARGIN - ICON_LABEL_GAP - LABEL_RIGHT_MARGIN);
    return {
      centerX: left + width / 2,
      centerY: bounds.minY + bounds.height / 2,
      width,
      height: bounds.height * 0.72,
      maxLines: 2,
    };
  }
  return {
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
  };
};
