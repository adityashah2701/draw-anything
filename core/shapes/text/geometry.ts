import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeGeometryContext } from "@/core/shapes/base/base-shape-definition";
import { TextShape } from "@/core/shapes/text/types";

export const getTextBounds = (
  shape: TextShape,
  context?: ShapeGeometryContext,
): Bounds | null => {
  if (!shape.text || !shape.fontSize || shape.points.length === 0) return null;
  const textX = shape.points[0].x;
  const textY = shape.points[0].y;
  const weight =
    shape.fontWeight ||
    (shape.fontSize >= 36
      ? "800"
      : shape.fontSize >= 26
        ? "700"
        : shape.fontSize >= 20
          ? "600"
          : "400");
  const style = shape.fontStyle || "normal";
  const baseSize = shape.fontSize;
  let effectiveSize = baseSize;
  if (weight === "800") effectiveSize = Math.max(baseSize, 36);
  else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
  else if (weight === "600" && baseSize >= 20) {
    effectiveSize = Math.max(baseSize, 20);
  }

  const lines = shape.text.split("\n");
  const lineHeight = effectiveSize * 1.2;
  let textWidth = Math.max(1, ...lines.map((line) => line.length)) * effectiveSize * 0.62;
  const measureCtx = context?.textMeasureContext;
  if (measureCtx) {
    measureCtx.font = `${style} ${weight} ${effectiveSize}px Inter, sans-serif`;
    textWidth = Math.max(
      ...lines.map((line) => measureCtx.measureText(line || " ").width),
      1,
    );
  }
  const textHeight = Math.max(
    effectiveSize,
    effectiveSize + Math.max(0, lines.length - 1) * lineHeight,
  );

  return {
    minX: textX,
    minY: textY,
    maxX: textX + textWidth,
    maxY: textY + textHeight,
    width: textWidth,
    height: textHeight,
  };
};

