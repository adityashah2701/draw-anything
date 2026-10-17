import { isDarkRender } from "@/core/theme/render-theme";
import { getAdaptiveColor } from "@/core/color/adaptive-color";
import {
  measureRichTextLineWidth,
  RichTextSpan,
} from "@/features/whiteboard/utils/rich-text-renderer";
import { layoutShapeLabel } from "@/core/text/label-layout";
import { FONT_FAMILY, makeFontString } from "@/core/text/typography";

export { FONT_FAMILY };
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

/** WCAG AA for body text: a label colour that fails this on its fill is replaced by near-black or near-white. */
const MIN_TEXT_CONTRAST = 4.5;

export const resolveTextColor = (preferredColor?: string, fillColor?: string) => {
  const isDark = isDarkRender();
  const adaptivePreferred = getAdaptiveColor(preferredColor, isDark);
  const fallbackColor = isDark ? "#f8fafc" : "#1f2937";
  const fillRgb = parseColorToRgb(fillColor);
  if (!fillRgb) {
    return adaptivePreferred || fallbackColor;
  }

  const preferredRgb = parseColorToRgb(adaptivePreferred);
  if (preferredRgb && contrastRatio(preferredRgb, fillRgb) >= MIN_TEXT_CONTRAST) {
    return adaptivePreferred || fallbackColor;
  }

  const light = { r: 248, g: 250, b: 252 };
  const dark = { r: 15, g: 23, b: 42 };
  return contrastRatio(light, fillRgb) >= contrastRatio(dark, fillRgb)
    ? "#f8fafc"
    : "#0f172a";
};

export interface ShapeLabelMetrics {
  finalFontSize: number;
  finalLineHeight: number;
  fontWeight: string;
  lines: RichTextSpan[][];
  /** Width the text wraps to; an editor placed over the label should use this. */
  wrapWidth: number;
  width: number;
  height: number;
}

/**
 * Screen-space view of the world-unit layout: wrapping and font fit are decided at
 * zoom 1, so a label looks the same at every zoom and only its scale changes.
 */
export const measureShapeLabel = ({
  ctx,
  label,
  maxWidth,
  maxHeight,
  zoom,
  preferredFontSize,
  preferredFontWeight,
  preferredFontStyle,
  maxLines,
}: Omit<ShapeLabelRenderOptions, "centerX" | "centerY" | "clipPath" | "preferredColor" | "fillColor">): ShapeLabelMetrics | null => {
  const layout = layoutShapeLabel(ctx, {
    label,
    boxWidth: maxWidth / zoom,
    boxHeight: maxHeight / zoom,
    fontSize: preferredFontSize,
    fontWeight: preferredFontWeight,
    fontStyle: preferredFontStyle,
    maxLines,
  });
  if (!layout) return null;
  return {
    finalFontSize: layout.fontSize * zoom,
    finalLineHeight: layout.lineHeight * zoom,
    fontWeight: layout.fontWeight,
    lines: layout.lines,
    wrapWidth: layout.wrapWidth * zoom,
    width: layout.width * zoom,
    height: layout.height * zoom,
  };
};

export const renderShapeLabel = (options: ShapeLabelRenderOptions) => {
  const metrics = measureShapeLabel(options);
  if (!metrics) return;

  const { finalFontSize, finalLineHeight, fontWeight, lines, height: blockHeight } = metrics;
  const { ctx, centerX, centerY, clipPath, preferredColor, fillColor, preferredFontStyle } = options;

  const textColor = resolveTextColor(preferredColor, fillColor);
  const baseStyle = preferredFontStyle || "normal";

  let drawY = centerY - blockHeight / 2 + (finalLineHeight - finalFontSize) / 2;

  ctx.save();
  clipPath(ctx);
  ctx.clip();
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (const line of lines) {
    const lineWidth = measureRichTextLineWidth(ctx, line, finalFontSize, fontWeight, baseStyle);
    let drawX = centerX - lineWidth / 2;
    for (const span of line) {
      const weight = span.bold
        ? String(Math.max(Number.parseInt(fontWeight, 10) || 400, 700))
        : fontWeight;
      ctx.font = makeFontString(finalFontSize, weight, span.italic ? "italic" : baseStyle);
      ctx.fillText(span.text, drawX, drawY);
      drawX += ctx.measureText(span.text).width;
    }
    drawY += finalLineHeight;
  }

  ctx.restore();
};
