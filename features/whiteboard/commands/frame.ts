import { unionBounds } from "@/core/geometry/box";
import { expandUnits, selectionUnits } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import {
  FRAME_PADDING,
  FRAME_STROKE_WIDTH,
  FRAME_TITLE_FONT_SIZE,
  FRAME_TITLE_FONT_WEIGHT,
  FRAME_TITLE_HEIGHT,
} from "@/features/ai/server/layout/frame-constants";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { CommandContext } from "./context";

const TITLE_INSET = 16;
const TITLE_TOP = 8;

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
    ? boxOf(box.minX - padding, box.minY - padding - FRAME_TITLE_HEIGHT, box.maxX + padding, box.maxY + padding)
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
    points: [{ x: frameBox.minX + TITLE_INSET, y: frameBox.minY + TITLE_TOP }],
    color: "#000000",
    strokeWidth: 1,
    text: options.title,
    fontSize: FRAME_TITLE_FONT_SIZE,
    fontWeight: FRAME_TITLE_FONT_WEIGHT,
    fontStyle: "normal",
    isGuide: true,
    ai: { ...ai, role: "group-label" },
  };
  return { patch: { add: [frame, label], update: [], remove: [] }, ids: { frame: frameId, label: labelId }, bounds: frameBox };
};
