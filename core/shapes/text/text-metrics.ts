export const LINE_HEIGHT_RATIO = 1.0;
export const FONT_FAMILY = "Inter, sans-serif";

export interface ResolvedTextStyle {
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  lineHeight: number;
  fontString: string;
}

/**
 * Resolves the final font-weight string based on the given stored weight and whether it's a bold span.
 * Standardizes bold weight to "700" to match browser default for <b>/<strong>.
 */
export function resolveTextWeight(
  storedWeight: string | number | undefined,
  isBoldSpan: boolean = false,
): string {
  let normalized = storedWeight?.toString().trim() || "400";
  if (normalized === "bold") normalized = "700";
  if (normalized === "normal") normalized = "400";
  
  if (!isBoldSpan) return normalized;
  
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isNaN(numeric)) {
    return normalized === "400" ? "700" : normalized;
  }
  return String(Math.max(numeric, 700));
}

/**
 * Resolves the full text style from stored properties.
 * Provides a single source of truth for font formatting.
 */
export function resolveTextStyle(
  fontSize: number,
  fontWeight?: string | number,
  fontStyle?: string,
): ResolvedTextStyle {
  const resolvedWeight = resolveTextWeight(fontWeight);
  const resolvedStyle = fontStyle === "italic" ? "italic" : "normal";
  const resolvedSize = Math.max(9, fontSize);
  const lineHeight = resolvedSize * LINE_HEIGHT_RATIO;
  const fontString = `${resolvedStyle} ${resolvedWeight} ${resolvedSize}px ${FONT_FAMILY}`;

  return {
    fontSize: resolvedSize,
    fontWeight: resolvedWeight,
    fontStyle: resolvedStyle,
    lineHeight,
    fontString,
  };
}

/**
 * Computes exact block height for a given number of lines.
 * Uses a single unified formula to eliminate selection box padding issues.
 */
export function computeTextBlockHeight(
  lineCount: number,
  lineHeight: number,
): number {
  return Math.max(0, lineCount) * lineHeight;
}
