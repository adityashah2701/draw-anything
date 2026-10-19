import { makeBounds, normalizeDegrees } from "@/core/geometry/box";
import { clampFrame, minimumScale, scaleShape } from "@/core/groups/transform";
import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { InspectorFrame } from "./inspector-model";
import { planFrameScale, planRotation, planTransform } from "./move-plan";

/** The smallest width or height a field will accept. */
export const MIN_FIELD_SIZE = 1;

export interface FrameEdit {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const finite = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * The frame after `edit`. With `keepRatio`, changing only the width (or only the height) drives the
 * other so the proportions stay put; a size is never below `MIN_FIELD_SIZE`. Non-numbers are ignored.
 */
export const targetFrame = (frame: InspectorFrame, edit: FrameEdit, keepRatio: boolean): InspectorFrame => {
  const next = { ...frame };
  if (finite(edit.x)) next.x = edit.x;
  if (finite(edit.y)) next.y = edit.y;
  if (finite(edit.width)) next.width = edit.width;
  if (finite(edit.height)) next.height = edit.height;
  if (keepRatio && frame.width > 0 && frame.height > 0) {
    if (finite(edit.width) && !finite(edit.height)) next.height = (edit.width * frame.height) / frame.width;
    else if (finite(edit.height) && !finite(edit.width)) next.width = (edit.height * frame.width) / frame.height;
  }
  next.width = Math.max(MIN_FIELD_SIZE, next.width);
  next.height = Math.max(MIN_FIELD_SIZE, next.height);
  return next;
};

const toBounds = (frame: InspectorFrame): Bounds => makeBounds(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height);

/**
 * Changes for typing into X, Y, W or H.
 *
 * Everything goes through the same scale as dragging a frame handle, so child-relative positions are
 * preserved and connectors follow. W and H keep the top-left corner fixed; for one rotated shape (whose
 * fields describe its own unrotated box) they keep its centre fixed, since the corner is not where
 * the eye reads it. Sizes are held above the smallest the group's shapes can take.
 */
export const planFrameEdit = ({
  targets,
  frame,
  frameIsLocal,
  edit,
  keepRatio,
  getBounds,
  reroute,
}: {
  targets: readonly DrawingElement[];
  frame: InspectorFrame;
  frameIsLocal: boolean;
  edit: FrameEdit;
  keepRatio: boolean;
  getBounds: (shape: DrawingElement) => Bounds | null;
  reroute: (changed: DrawingElement[]) => DrawingElement[];
}): DrawingElement[] => {
  const wanted = targetFrame(frame, edit, keepRatio);
  const from = toBounds(frame);

  if (frameIsLocal) {
    const cx = frame.x + frame.width / 2 + (finite(edit.x) ? edit.x - frame.x : 0);
    const cy = frame.y + frame.height / 2 + (finite(edit.y) ? edit.y - frame.y : 0);
    const to = makeBounds(cx - wanted.width / 2, cy - wanted.height / 2, cx + wanted.width / 2, cy + wanted.height / 2);
    return planTransform(targets, (shape) => scaleShape(shape, from, to, 0), reroute);
  }

  const floor = minimumScale(targets.flatMap((shape) => getBounds(shape) ?? []));
  const to = clampFrame(from, toBounds(wanted), floor, { left: true, top: true });
  return planFrameScale(targets, from, to, reroute);
};

/** One shape set to an absolute angle (0 removes the field, so an upright shape stays exactly as old boards stored it). */
export const planSetRotation = (
  shape: DrawingElement,
  degrees: number,
  reroute: (changed: DrawingElement[]) => DrawingElement[],
): DrawingElement[] => {
  if (!finite(degrees)) return [];
  const angle = normalizeDegrees(degrees);
  return planTransform([shape], (s) => ({ ...s, rotation: angle === 0 ? undefined : angle }), reroute);
};

/** The selection turned by `degrees` about the centre of its frame, as one rigid body. */
export const planRotateBy = (
  targets: readonly DrawingElement[],
  frame: InspectorFrame,
  degrees: number,
  getBounds: (shape: DrawingElement) => Bounds | null,
  reroute: (changed: DrawingElement[]) => DrawingElement[],
): DrawingElement[] => {
  if (!finite(degrees) || normalizeDegrees(degrees) === 0) return [];
  const pivot: Point = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  return planRotation(targets, pivot, degrees, getBounds, reroute);
};
