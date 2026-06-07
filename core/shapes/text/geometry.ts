import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeGeometryContext } from "@/core/shapes/base/base-shape-definition";
import { TextShape } from "@/core/shapes/text/types";
import {
  measureRichTextLineWidth,
  parseMarkdownRichText,
  RichTextSpan,
} from "@/features/whiteboard/utils/rich-text-renderer";

const splitMarkdownLines = (text: string) => {
  const spans = parseMarkdownRichText(text);
  const lines: RichTextSpan[][] = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) {
        lines.push([]);
      }
      const part = parts[index];
      if (part.length > 0) {
        lines[lines.length - 1].push({ ...span, text: part });
      }
    }
  }
  return lines;
};

export const measureTextShapeBlock = (
  text: string,
  fontSize: number,
  fontWeight: string | number,
  fontStyle: string,
  measureCtx?: CanvasRenderingContext2D | null,
) => {
  const lines = splitMarkdownLines(text);
  const lineHeight = fontSize * 1.2;
  const estimateSpanWidth = (span: RichTextSpan) => {
    const baseFactor = span.bold ? 0.68 : 0.62;
    const italicFactor = span.italic ? 1.03 : 1;
    return span.text.length * fontSize * baseFactor * italicFactor;
  };

  const widths = lines.map((line) => {
    if (measureCtx) {
      return measureRichTextLineWidth(
        measureCtx,
        line,
        fontSize,
        fontWeight,
        fontStyle,
      );
    }
    return line.reduce((sum, span) => sum + estimateSpanWidth(span), 0);
  });

  return {
    lines,
    width: Math.max(1, ...widths, 1),
    height: Math.max(fontSize, fontSize + Math.max(0, lines.length - 1) * lineHeight),
    lineHeight,
  };
};

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

  const measureCtx = context?.textMeasureContext ?? null;
  if (measureCtx) {
    measureCtx.font = `${style} ${weight} ${effectiveSize}px Inter, sans-serif`;
  }
  const measured = measureTextShapeBlock(
    shape.text,
    effectiveSize,
    weight,
    style,
    measureCtx,
  );

  return {
    minX: textX,
    minY: textY,
    maxX: textX + measured.width,
    maxY: textY + measured.height,
    width: measured.width,
    height: measured.height,
  };
};
