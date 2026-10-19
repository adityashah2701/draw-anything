import { unionBounds } from "@/core/geometry/box";
import { expandUnits, selectionUnits } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { FRAME_PADDING, FRAME_STROKE_WIDTH } from "@/features/ai/server/layout/frame-constants";
import { pathHitsBox } from "@/features/ai/server/layout/geometry";
import { estimateTextWidth } from "@/core/text/estimate";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { CommandContext } from "./context";

const TITLE_INSET = 16;
const TITLE_TOP = 8;
/** A frame the editor or the agent draws names itself in the size of a node caption, not as a poster heading. */
export const FRAME_HEADING_SIZE = 17;
export const FRAME_HEADING_WEIGHT = "700";
const HEADING_BAND = 34;

/**
 * Where a frame's heading goes: the left corner, unless a connector runs through it there, then the right corner
 * or the middle of the top edge. When every spot is crossed the left one stays, and the validator names it.
 */
export const frameHeadingPosition = (ctx: CommandContext, frame: Bounds, title: string, ignoreArrow?: (arrowId: string) => boolean): { x: number; y: number } => {
  const width = Math.ceil(estimateTextWidth(title || " ", FRAME_HEADING_SIZE, FRAME_HEADING_WEIGHT));
  const height = FRAME_HEADING_SIZE * LINE_HEIGHT_RATIO;
  const y = frame.minY + TITLE_TOP;
  const spots = [frame.minX + TITLE_INSET, frame.maxX - TITLE_INSET - width, frame.minX + (frame.width - width) / 2];
  const arrows = ctx.shapes.filter(isArrowElement).filter((arrow) => !ignoreArrow?.(arrow.id));
  for (const x of spots) {
    const box = { minX: x - 2, minY: y - 2, maxX: x + width + 2, maxY: y + height + 2 };
    if (!arrows.some((arrow) => pathHitsBox(arrow.points, box))) return { x, y };
  }
  return { x: spots[0], y };
};

export interface FramePlan {
  patch: DocPatch;
  /** The frame rectangle, then its heading. */
  ids: { frame: string; label: string };
  bounds: Bounds;
}

const boxOf = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({ minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY });

/**
 * A titled frame (a "section") around `selected`, or around `bounds` when no shapes are given. It is the
 * same pair of elements an AI diagram draws for a group (an unfilled `isGuide` rectangle with
 * `ai.role: "group"` and a heading text with `ai.role: "group-label"`), so diagram code reads it back as a
 * group, it is hit-tested on its border only and it is never a connection target. Nothing inside moves.
 */
export const planFrame = (
  ctx: CommandContext,
  selected: readonly string[],
  options: { title: string; id?: string; padding?: number; bounds?: Bounds },
): FramePlan | null => {
  const leaves = expandUnits(ctx.index, selectionUnits(ctx.index, selected));
  const content = unionBounds(leaves.flatMap((id) => ctx.getBounds(ctx.index.shapes.get(id)!) ?? []));
  const box = content ?? options.bounds ?? null;
  if (!box) return null;
  const padding = options.padding ?? FRAME_PADDING;
  const frameBox = content
    ? boxOf(box.minX - padding, box.minY - padding - HEADING_BAND, box.maxX + padding, box.maxY + padding)
    : box;
  const frameId = options.id ?? ctx.newId();
  const labelId = `${frameId}-label`;
  const ai = { semanticId: frameId };
  const frame: DrawingElement = {
    id: frameId,
    type: "rectangle",
    points: [
      { x: frameBox.minX, y: frameBox.minY },
      { x: frameBox.maxX, y: frameBox.maxY },
    ],
    color: "#000000",
    strokeWidth: FRAME_STROKE_WIDTH,
    isGuide: true,
    ai: { ...ai, role: "group" },
  };
  const label: DrawingElement = {
    id: labelId,
    type: "text",
    points: [frameHeadingPosition(ctx, frameBox, options.title)].map(({ x, y }) => ({ x, y })),
    color: "#000000",
    strokeWidth: 1,
    text: options.title,
    fontSize: FRAME_HEADING_SIZE,
    fontWeight: FRAME_HEADING_WEIGHT,
    fontStyle: "normal",
    isGuide: true,
    ai: { ...ai, role: "group-label" },
  };
  return { patch: { add: [frame, label], update: [], remove: [] }, ids: { frame: frameId, label: labelId }, bounds: frameBox };
};
