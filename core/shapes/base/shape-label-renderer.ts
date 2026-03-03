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
  const fallbackColor = "#1f2937";
  const fillRgb = parseColorToRgb(fillColor);
  if (!fillRgb) {
    return preferredColor || fallbackColor;
  }

  const preferredRgb = parseColorToRgb(preferredColor);
  if (preferredRgb && contrastRatio(preferredRgb, fillRgb) >= 3) {
    return preferredColor || fallbackColor;
  }

  const light = { r: 248, g: 250, b: 252 };
  const dark = { r: 15, g: 23, b: 42 };
  return contrastRatio(light, fillRgb) >= contrastRatio(dark, fillRgb)
    ? "#f8fafc"
    : "#0f172a";
};

const splitLongToken = (
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
) => {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const chunks: string[] = [];
  let current = "";
  for (const char of token) {
    const candidate = `${current}${char}`;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
};

const buildWrappedLines = (
  ctx: CanvasRenderingContext2D,
  label: string,
  maxWidth: number,
) => {
  const lines: string[] = [];
  const paragraphs = label
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return lines;
  }

  for (const paragraph of paragraphs) {
    const tokens = paragraph
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((token) => splitLongToken(ctx, token, maxWidth));

    if (tokens.length === 0) {
      continue;
    }

    let currentLine = tokens[0];
    for (let index = 1; index < tokens.length; index += 1) {
      const next = `${currentLine} ${tokens[index]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        currentLine = next;
      } else {
        lines.push(currentLine);
        currentLine = tokens[index];
      }
    }
    lines.push(currentLine);
  }

  return lines;
};

const ellipsizeLine = (
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
) => {
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) {
    return "";
  }
  if (ctx.measureText(line).width <= maxWidth) {
    return line;
  }
  let shortened = line;
  while (shortened.length > 0) {
    const candidate = `${shortened}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
    shortened = shortened.slice(0, -1);
  }
  return ellipsis;
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
  let finalLines: string[] = [];
  let finalLineHeight = MIN_FONT_SIZE * LINE_HEIGHT_MULTIPLIER;
  let fitted = false;

  for (let fontSize = Math.floor(targetFontSize); fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    ctx.font = makeFont(fontSize, preferredFontWeight, preferredFontStyle);
    const lines = buildWrappedLines(ctx, normalizedLabel, availableWidth);
    if (lines.length === 0 || lines.length > maxAllowedLines) {
      continue;
    }
    const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
    if (lines.length * lineHeight > availableHeight) {
      continue;
    }
    finalFontSize = fontSize;
    finalLines = lines;
    finalLineHeight = lineHeight;
    fitted = true;
    break;
  }

  if (!fitted) {
    finalFontSize = MIN_FONT_SIZE;
    ctx.font = makeFont(finalFontSize, preferredFontWeight, preferredFontStyle);
    finalLineHeight = finalFontSize * LINE_HEIGHT_MULTIPLIER;
    const fallbackLines = buildWrappedLines(ctx, normalizedLabel, availableWidth);
    if (fallbackLines.length === 0) return;

    const maxVisibleLines = clamp(
      Math.floor(availableHeight / finalLineHeight),
      1,
      maxAllowedLines,
    );
    finalLines = fallbackLines.slice(0, maxVisibleLines);
    const lastIndex = finalLines.length - 1;
    const truncated = fallbackLines.length > maxVisibleLines;
    if (truncated && lastIndex >= 0) {
      finalLines[lastIndex] = ellipsizeLine(
        ctx,
        finalLines[lastIndex],
        availableWidth,
      );
    }
  }

  if (finalLines.length === 0) return;

  const textColor = resolveTextColor(preferredColor, fillColor);
  const blockHeight = finalLines.length * finalLineHeight;
  let drawY = centerY - blockHeight / 2;

  ctx.save();
  clipPath(ctx);
  ctx.clip();
  ctx.font = makeFont(finalFontSize, preferredFontWeight, preferredFontStyle);
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const line of finalLines) {
    ctx.fillText(line, centerX, drawY);
    drawY += finalLineHeight;
  }

  ctx.restore();
};
