import { resolveTextWeight } from "@/core/shapes/text/text-metrics";
import { FONT_FAMILY } from "@/core/text/typography";
import type { MeasureContext } from "@/core/text/measure-context";
import { parseMarkdownRichText, type RichTextSpan } from "./rich-text-markup";

export interface RichTextLayoutOptions {
  baseFontSize: number;
  baseFontWeight: string | number;
  baseFontStyle: string;
  maxWidth?: number;
  maxLines?: number;
}

export interface RichTextLayout {
  lines: RichTextSpan[][];
  truncated: boolean;
}

const resolveSpanStyle = (baseStyle: string | undefined, italic: boolean) => {
  const normalized = baseStyle?.trim() || "normal";
  if (italic) return "italic";
  return normalized === "italic" ? "italic" : "normal";
};

const makeFont = (
  ctx: MeasureContext,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
  span: RichTextSpan,
) => {
  const weight = resolveTextWeight(baseFontWeight, span.bold);
  const style = resolveSpanStyle(baseFontStyle, span.italic);
  ctx.font = `${style} ${weight} ${baseFontSize}px ${FONT_FAMILY}`;
};

const splitParagraphs = (spans: RichTextSpan[]) => {
  const paragraphs: RichTextSpan[][] = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) {
        paragraphs.push([]);
      }
      const text = parts[index];
      if (text.length > 0) {
        paragraphs[paragraphs.length - 1].push({ ...span, text });
      }
    }
  }
  return paragraphs;
};

const tokenizeParagraph = (paragraph: RichTextSpan[]) => {
  const tokens: RichTextSpan[] = [];
  for (const span of paragraph) {
    const segments = span.text.match(/\s+|\S+/g) ?? [span.text];
    for (const segment of segments) {
      if (segment.length === 0) continue;
      tokens.push({ ...span, text: segment });
    }
  }
  return tokens;
};

export const measureRichTextLineWidth = (
  ctx: MeasureContext,
  line: RichTextSpan[],
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  let width = 0;
  for (const span of line) {
    makeFont(ctx, baseFontSize, baseFontWeight, baseFontStyle, span);
    width += ctx.measureText(span.text).width;
  }
  return width;
};

const splitLongToken = (
  ctx: MeasureContext,
  token: RichTextSpan,
  maxWidth: number,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  makeFont(ctx, baseFontSize, baseFontWeight, baseFontStyle, token);
  if (ctx.measureText(token.text).width <= maxWidth) {
    return [token];
  }

  const chunks: RichTextSpan[] = [];
  let current = "";
  for (const char of token.text) {
    const candidate = `${current}${char}`;
    makeFont(ctx, baseFontSize, baseFontWeight, baseFontStyle, token);
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push({ ...token, text: current });
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push({ ...token, text: current });
  }
  return chunks;
};

const wrapParagraph = (
  ctx: MeasureContext,
  paragraph: RichTextSpan[],
  maxWidth: number,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  const tokens = tokenizeParagraph(paragraph);
  if (tokens.length === 0) {
    return [[]];
  }

  const lines: RichTextSpan[][] = [];
  let currentLine: RichTextSpan[] = [];

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
  };

  const placeToken = (token: RichTextSpan) => {
    const isWhitespace = /^\s+$/u.test(token.text);

    if (isWhitespace) {
      if (currentLine.length === 0) return;
      const candidate = [...currentLine, token];
      const candidateWidth = measureRichTextLineWidth(
        ctx,
        candidate,
        baseFontSize,
        baseFontWeight,
        baseFontStyle,
      );
      if (candidateWidth <= maxWidth) {
        currentLine = candidate;
      } else {
        pushLine();
      }
      return;
    }

    const candidate = [...currentLine, token];
    const candidateWidth = measureRichTextLineWidth(
      ctx,
      candidate,
      baseFontSize,
      baseFontWeight,
      baseFontStyle,
    );
    if (candidateWidth <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine.length > 0) {
      pushLine();
    }

    const singleWidth = measureRichTextLineWidth(
      ctx,
      [token],
      baseFontSize,
      baseFontWeight,
      baseFontStyle,
    );
    if (singleWidth <= maxWidth) {
      currentLine = [token];
      return;
    }

    const chunks = splitLongToken(
      ctx,
      token,
      maxWidth,
      baseFontSize,
      baseFontWeight,
      baseFontStyle,
    );
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      currentLine = [chunk];
      if (index < chunks.length - 1) {
        pushLine();
      }
    }
  };

  for (const token of tokens) {
    placeToken(token);
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [[]];
};

const ellipsizeRichTextLine = (
  ctx: MeasureContext,
  line: RichTextSpan[],
  maxWidth: number,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  const ellipsis: RichTextSpan = {
    text: "…",
    bold: false,
    italic: false,
  };

  const trimmed = line.map((span) => ({ ...span }));
  if (
    measureRichTextLineWidth(
      ctx,
      [...trimmed, ellipsis],
      baseFontSize,
      baseFontWeight,
      baseFontStyle,
    ) <= maxWidth
  ) {
    return [...trimmed, ellipsis];
  }

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (last.text.length <= 1) {
      trimmed.pop();
    } else {
      last.text = last.text.slice(0, -1);
    }

    if (
      measureRichTextLineWidth(
        ctx,
        [...trimmed, ellipsis],
        baseFontSize,
        baseFontWeight,
        baseFontStyle,
      ) <= maxWidth
    ) {
      return [...trimmed, ellipsis];
    }
  }

  return measureRichTextLineWidth(
    ctx,
    [ellipsis],
    baseFontSize,
    baseFontWeight,
    baseFontStyle,
  ) <= maxWidth
    ? [ellipsis]
    : [];
};

/** Width of the widest unbreakable word in `text` (formatting respected), at the given font. */
export const longestWordWidth = (
  ctx: MeasureContext,
  text: string,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  let widest = 0;
  for (const span of parseMarkdownRichText(text)) {
    for (const word of span.text.split(/\s+/u)) {
      if (!word) continue;
      widest = Math.max(
        widest,
        measureRichTextLineWidth(ctx, [{ ...span, text: word }], baseFontSize, baseFontWeight, baseFontStyle),
      );
    }
  }
  return widest;
};

export const layoutRichTextLines = (
  ctx: MeasureContext,
  text: string,
  options: RichTextLayoutOptions,
): RichTextLayout => {
  const spans = parseMarkdownRichText(text);
  const paragraphs = splitParagraphs(spans);

  const lines: RichTextSpan[][] = [];
  const maxWidth = options.maxWidth;

  for (const paragraph of paragraphs) {
    if (!maxWidth) {
      lines.push(paragraph);
      continue;
    }

    const wrapped = wrapParagraph(
      ctx,
      paragraph,
      maxWidth,
      options.baseFontSize,
      options.baseFontWeight,
      options.baseFontStyle,
    );
    lines.push(...wrapped);
  }

  let truncated = false;
  if (options.maxLines && lines.length > options.maxLines) {
    truncated = true;
    const visible = lines.slice(0, options.maxLines);
    const lastIndex = visible.length - 1;
    if (lastIndex >= 0 && maxWidth) {
      visible[lastIndex] = ellipsizeRichTextLine(
        ctx,
        visible[lastIndex],
        maxWidth,
        options.baseFontSize,
        options.baseFontWeight,
        options.baseFontStyle,
      );
    }
    return { lines: visible, truncated };
  }

  return { lines, truncated };
};

export const renderRichTextLines = (
  ctx: CanvasRenderingContext2D,
  markdownOrText: string,
  startX: number,
  startY: number,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
  lineHeight: number,
  color: string,
  textAlign: "left" | "center" | "right",
  maxWidth?: number,
) => {
  const { lines } = layoutRichTextLines(ctx, markdownOrText, {
    baseFontSize,
    baseFontWeight,
    baseFontStyle,
    maxWidth,
  });

  let currentY = startY;
  for (const line of lines) {
    const lineWidth = measureRichTextLineWidth(
      ctx,
      line,
      baseFontSize,
      baseFontWeight,
      baseFontStyle,
    );

    let currentX = startX;
    if (textAlign === "center") {
      currentX = startX - lineWidth / 2;
    } else if (textAlign === "right") {
      currentX = startX - lineWidth;
    }

    for (const span of line) {
      makeFont(ctx, baseFontSize, baseFontWeight, baseFontStyle, span);
      ctx.fillStyle = color;
      ctx.fillText(span.text, currentX, currentY);
      currentX += ctx.measureText(span.text).width;
    }

    currentY += lineHeight;
  }
};
