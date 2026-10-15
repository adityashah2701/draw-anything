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

export const getShapeLabelRegion = (type: string, bounds: Bounds): LabelRegion => {
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
