import {
  Anchor,
  AnchorSide,
} from "@/features/whiteboard/types/whiteboard.types";

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ANCHOR_SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

export const buildAnchorId = (elementId: string, side: AnchorSide): string =>
  `${elementId}-anchor-${side}`;

export const parseAnchorSide = (anchorId: string): AnchorSide | null => {
  const tail = anchorId.split("-").pop();
  if (tail === "top" || tail === "right" || tail === "bottom" || tail === "left") {
    return tail;
  }
  return null;
};

export const boundsToShapeBounds = (bounds: BoundsLike): ShapeBounds => ({
  x: bounds.minX,
  y: bounds.minY,
  width: bounds.maxX - bounds.minX,
  height: bounds.maxY - bounds.minY,
});

export const generateAnchorsForShape = (
  shapeId: string,
  bounds: ShapeBounds,
): Anchor[] => {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  return [
    { id: buildAnchorId(shapeId, "top"), x: cx, y: top, side: "top" },
    { id: buildAnchorId(shapeId, "right"), x: right, y: cy, side: "right" },
    { id: buildAnchorId(shapeId, "bottom"), x: cx, y: bottom, side: "bottom" },
    { id: buildAnchorId(shapeId, "left"), x: left, y: cy, side: "left" },
  ];
};

export const defaultAnchorBySide = (
  elementId: string,
  side: AnchorSide,
): Anchor => ({
  id: buildAnchorId(elementId, side),
  x: 0,
  y: 0,
  side,
});
