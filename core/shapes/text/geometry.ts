import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeGeometryContext } from "@/core/shapes/base/base-shape-definition";
import { TextShape } from "@/core/shapes/text/types";
import {
  measureRichTextLineWidth,
  parseMarkdownRichText,
  RichTextSpan,
} from "@/features/whiteboard/utils/rich-text-renderer";
import { resolveTextStyle, computeTextBlockHeight } from "./text-metrics";

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
  const { fontSize: finalFontSize, fontWeight: finalFontWeight, fontStyle: finalFontStyle, lineHeight } = resolveTextStyle(fontSize, fontWeight, fontStyle);
  const estimateSpanWidth = (span: RichTextSpan) => {
    const baseFactor = span.bold ? 0.68 : 0.62;
    const italicFactor = span.italic ? 1.03 : 1;
    return span.text.length * finalFontSize * baseFactor * italicFactor;
  };

  const widths = lines.map((line) => {
    if (measureCtx) {
      return measureRichTextLineWidth(
        measureCtx,
        line,
        finalFontSize,
        finalFontWeight,
        finalFontStyle,
      );
    }
    return line.reduce((sum, span) => sum + estimateSpanWidth(span), 0);
  });

  return {
    lines,
    width: Math.max(1, ...widths, 1),
    height: computeTextBlockHeight(lines.length, lineHeight),
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
  const { fontSize: finalFontSize, fontWeight: finalFontWeight, fontStyle: finalFontStyle, fontString } = resolveTextStyle(shape.fontSize, shape.fontWeight, shape.fontStyle);

  const measureCtx = context?.textMeasureContext ?? null;
  if (measureCtx) {
    measureCtx.font = fontString;
  }
  const measured = measureTextShapeBlock(
    shape.text,
    finalFontSize,
    finalFontWeight,
    finalFontStyle,
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
