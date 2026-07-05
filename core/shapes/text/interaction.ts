import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { TextShape } from "@/core/shapes/text/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { measureTextShapeBlock } from "@/core/shapes/text/geometry";
import { resolveTextStyle } from "@/core/shapes/text/text-metrics";

export const containsPointInText = (
  _shape: TextShape,
  point: Point,
  bounds?: Bounds | null,
): boolean => {
  if (!bounds) return false;
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
};

export const getTextResizeHandles = (
  _shape: TextShape,
  bounds?: Bounds | null,
): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;

  return [
    { name: "nw", x: minX, y: minY },
    { name: "n", x: (minX + maxX) / 2, y: minY },
    { name: "ne", x: maxX, y: minY },
    { name: "e", x: maxX, y: (minY + maxY) / 2 },
    { name: "se", x: maxX, y: maxY },
    { name: "s", x: (minX + maxX) / 2, y: maxY },
    { name: "sw", x: minX, y: maxY },
    { name: "w", x: minX, y: (minY + maxY) / 2 },
  ];
};

export const resizeText = (
  shape: TextShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): TextShape => {
  if (!shape.text || !shape.fontSize || !originalBounds) return shape;

  const { fontWeight: weight } = resolveTextStyle(shape.fontSize, shape.fontWeight, shape.fontStyle);
  
  const originalSize = measureTextShapeBlock(
    shape.text,
    shape.fontSize,
    weight,
    shape.fontStyle || "normal",
  );
  const left = shape.points[0].x;
  const top = shape.points[0].y;
  const right = left + originalSize.width;
  const bottom = top + originalSize.height;

  const hasEast = handle.includes("e");
  const hasWest = handle.includes("w");
  const hasNorth = handle.includes("n");
  const hasSouth = handle.includes("s");

  const scaleXFromEast = (point.x - left) / Math.max(1, originalSize.width);
  const scaleXFromWest = (right - point.x) / Math.max(1, originalSize.width);
  const scaleYFromNorth = (bottom - point.y) / Math.max(1, originalSize.height);
  const scaleYFromSouth = (point.y - top) / Math.max(1, originalSize.height);

  let scaleX = 1;
  let scaleY = 1;

  if (hasEast) scaleX = scaleXFromEast;
  if (hasWest) scaleX = scaleXFromWest;
  if (hasNorth) scaleY = scaleYFromNorth;
  if (hasSouth) scaleY = scaleYFromSouth;

  let scaleFactor = 1;
  if ((hasEast || hasWest) && (hasNorth || hasSouth)) {
    scaleFactor = Math.max(scaleX, scaleY);
  } else if (hasEast || hasWest) {
    scaleFactor = scaleX;
  } else if (hasNorth || hasSouth) {
    scaleFactor = scaleY;
  }

  scaleFactor = Math.max(0.25, Math.min(6, scaleFactor));
  const nextFontSize = Math.max(
    12,
    Math.min(200, Math.round(shape.fontSize * scaleFactor)),
  );

  const resizedSize = measureTextShapeBlock(
    shape.text,
    nextFontSize,
    weight,
    shape.fontStyle || "normal",
  );
  let newX = shape.points[0].x;
  let newY = shape.points[0].y;

  if (hasWest) {
    newX = right - resizedSize.width;
  }
  if (hasNorth) {
    newY = bottom - resizedSize.height;
  }

  return {
    ...shape,
    points: [{ x: newX, y: newY }],
    fontSize: nextFontSize,
  };
};
