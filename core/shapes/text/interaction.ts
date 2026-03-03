import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { TextShape } from "@/core/shapes/text/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

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

  const weight =
    shape.fontWeight ||
    (shape.fontSize >= 36
      ? "800"
      : shape.fontSize >= 26
        ? "700"
        : shape.fontSize >= 20
          ? "600"
          : "400");

  const estimateTextSize = (size: number) => {
    const baseSize = size;
    let effectiveSize = baseSize;
    if (weight === "800") effectiveSize = Math.max(baseSize, 36);
    else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
    else if (weight === "600" && baseSize >= 20) {
      effectiveSize = Math.max(baseSize, 20);
    }

    const lines = shape.text!.split("\n");
    const maxChars = Math.max(...lines.map((line) => line.length), 1);
    const width = maxChars * effectiveSize * 0.62 + 8;
    const lineHeight = effectiveSize * 1.2;
    const height = Math.max(
      effectiveSize,
      effectiveSize + Math.max(0, lines.length - 1) * lineHeight,
    );

    return { width, height };
  };

  const originalSize = estimateTextSize(shape.fontSize);
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

  const resizedSize = estimateTextSize(nextFontSize);
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
