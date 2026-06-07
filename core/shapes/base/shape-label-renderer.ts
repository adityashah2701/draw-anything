import { getAdaptiveColor } from "@/features/whiteboard/utils/canvas-render-utils";
import {
  layoutRichTextLines,
  measureRichTextLineWidth,
  RichTextSpan,
} from "@/features/whiteboard/utils/rich-text-renderer";
export interface ShapeLabelRenderOptions {
  ctx: CanvasRenderingContext2D;
  label: string;
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxHeight: number;
  zoom: number;
  clipPath: (ctx: CanvasRenderingContext2D) => void;
  preferredColor?: string;
  fillColor?: string;
  preferredFontSize?: number;
  preferredFontWeight?: string | number;
  preferredFontStyle?: string;
  maxLines?: number;
}

const FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 72;
const LINE_HEIGHT_MULTIPLIER = 1.2;
const MIN_PADDING = 8;
const MAX_LINE_COUNT = 4;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeHex = (value: string) => {
  const hex = value.replace("#", "").trim();
  if (hex.length === 3) {
    return hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (hex.length === 6) {
    return hex;
  }
  return null;
};

const parseColorToRgb = (color?: string): Rgb | null => {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith("#")) {
    const normalized = normalizeHex(trimmed);
    if (!normalized) return null;
    const parsed = Number.parseInt(normalized, 16);
    if (Number.isNaN(parsed)) return null;
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255,
    };
  }
  const rgbMatch = trimmed.match(
    /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\)$/,
  );
  if (!rgbMatch) return null;
  return {
    r: clamp(Number.parseInt(rgbMatch[1], 10), 0, 255),
    g: clamp(Number.parseInt(rgbMatch[2], 10), 0, 255),
    b: clamp(Number.parseInt(rgbMatch[3], 10), 0, 255),
  };
};

const relativeLuminance = (rgb: Rgb) => {
  const normalize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * normalize(rgb.r) +
    0.7152 * normalize(rgb.g) +
    0.0722 * normalize(rgb.b)
  );
};

const contrastRatio = (a: Rgb, b: Rgb) => {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
};

const resolveTextColor = (preferredColor?: string, fillColor?: string) => {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const adaptivePreferred = getAdaptiveColor(preferredColor, isDark);
  const fallbackColor = isDark ? "#f8fafc" : "#1f2937";
  const fillRgb = parseColorToRgb(fillColor);
  if (!fillRgb) {
    return adaptivePreferred || fallbackColor;
  }

  const preferredRgb = parseColorToRgb(adaptivePreferred);
  if (preferredRgb && contrastRatio(preferredRgb, fillRgb) >= 3) {
    return adaptivePreferred || fallbackColor;
  }

  const light = { r: 248, g: 250, b: 252 };
  const dark = { r: 15, g: 23, b: 42 };
  return contrastRatio(light, fillRgb) >= contrastRatio(dark, fillRgb)
    ? "#f8fafc"
    : "#0f172a";
};

const makeFont = (
  fontSize: number,
  fontWeight?: string | number,
  fontStyle?: string,
) => {
  const resolvedWeight =
    fontWeight?.toString() || (fontSize >= 18 ? "600" : "500");
  const resolvedStyle = fontStyle === "italic" ? "italic" : "normal";
  return `${resolvedStyle} ${resolvedWeight} ${fontSize}px ${FONT_FAMILY}`;
};

export const renderShapeLabel = ({
  ctx,
  label,
  centerX,
  centerY,
  maxWidth,
  maxHeight,
  zoom,
  clipPath,
  preferredColor,
  fillColor,
  preferredFontSize,
  preferredFontWeight,
  preferredFontStyle,
  maxLines,
}: ShapeLabelRenderOptions) => {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return;

  const padding = clamp(12 * zoom, MIN_PADDING, 24);
  const availableWidth = maxWidth - padding * 2;
  const availableHeight = maxHeight - padding * 2;

  if (availableWidth <= 8 || availableHeight <= 8) return;

  const targetFontSize = clamp(
    (preferredFontSize ?? 16) * zoom,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );
  const maxAllowedLines = clamp(maxLines ?? MAX_LINE_COUNT, 1, MAX_LINE_COUNT);

  let finalFontSize = MIN_FONT_SIZE;
  let finalLines: RichTextSpan[][] = [];
  let finalLineHeight = MIN_FONT_SIZE * LINE_HEIGHT_MULTIPLIER;
  let fitted = false;

  for (let fontSize = Math.floor(targetFontSize); fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    ctx.font = makeFont(fontSize, preferredFontWeight, preferredFontStyle);
    const layout = layoutRichTextLines(ctx, normalizedLabel, {
      baseFontSize: fontSize,
      baseFontWeight: preferredFontWeight || (fontSize >= 18 ? "600" : "500"),
      baseFontStyle: preferredFontStyle || "normal",
      maxWidth: availableWidth,
      maxLines: maxAllowedLines,
    });
    if (layout.lines.length === 0 || layout.truncated) {
      continue;
    }
    const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
    if (layout.lines.length * lineHeight > availableHeight) {
      continue;
    }
    finalFontSize = fontSize;
    finalLines = layout.lines;
    finalLineHeight = lineHeight;
    fitted = true;
    break;
  }

  if (!fitted) {
    finalFontSize = MIN_FONT_SIZE;
    ctx.font = makeFont(finalFontSize, preferredFontWeight, preferredFontStyle);
    finalLineHeight = finalFontSize * LINE_HEIGHT_MULTIPLIER;
    const fallbackLayout = layoutRichTextLines(ctx, normalizedLabel, {
      baseFontSize: finalFontSize,
      baseFontWeight: preferredFontWeight || (finalFontSize >= 18 ? "600" : "500"),
      baseFontStyle: preferredFontStyle || "normal",
      maxWidth: availableWidth,
      maxLines: clamp(
        Math.floor(availableHeight / finalLineHeight),
        1,
        maxAllowedLines,
      ),
    });
    if (fallbackLayout.lines.length === 0) return;
    finalLines = fallbackLayout.lines;
  }

  if (finalLines.length === 0) return;

  const textColor = resolveTextColor(preferredColor, fillColor);
  const baseWeight = preferredFontWeight?.toString() || (finalFontSize >= 18 ? "600" : "500");
  const baseStyle = preferredFontStyle || "normal";
  const blockHeight = finalLines.length * finalLineHeight;
  let drawY = centerY - blockHeight / 2;

  ctx.save();
  clipPath(ctx);
  ctx.clip();
  ctx.font = makeFont(finalFontSize, preferredFontWeight, preferredFontStyle);
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (const line of finalLines) {
    const lineWidth = measureRichTextLineWidth(
      ctx,
      line,
      finalFontSize,
      baseWeight,
      baseStyle,
    );
    let drawX = centerX - lineWidth / 2;
    for (const span of line) {
      const weight = span.bold
        ? String(Math.max(Number.parseInt(baseWeight, 10) || 400, 700))
        : baseWeight;
      const style = span.italic ? "italic" : baseStyle;
      ctx.font = `${style} ${weight} ${finalFontSize}px ${FONT_FAMILY}`;
      ctx.fillText(span.text, drawX, drawY);
      drawX += ctx.measureText(span.text).width;
    }
    drawY += finalLineHeight;
  }

  ctx.restore();
};
