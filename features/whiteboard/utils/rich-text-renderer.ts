export interface RichTextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

import { resolveTextWeight } from "@/core/shapes/text/text-metrics";
import { FONT_FAMILY } from "@/core/text/typography";
import type { MeasureContext } from "@/core/text/measure-context";

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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeMarkdownText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*");



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

export const measureRichTextTopOffset = (
  ctx: CanvasRenderingContext2D,
  baseFontSize: number,
  baseFontWeight: string | number,
  baseFontStyle: string,
) => {
  makeFont(ctx, baseFontSize, baseFontWeight, baseFontStyle, {
    text: "Mg",
    bold: false,
    italic: false,
  });
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText("Mg");
  const fontAscent =
    metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
  const glyphAscent = metrics.actualBoundingBoxAscent ?? baseFontSize * 0.8;
  const leadingOffset = baseFontSize * 0.1;
  const metricOffset = Math.max(0, (fontAscent ?? baseFontSize * 0.8) - glyphAscent);
  return leadingOffset + metricOffset;
};

const isBlockElement = (tagName: string) =>
  tagName === "div" || tagName === "p" || tagName === "li";

const isBoldElement = (element: HTMLElement) => {
  const tag = element.tagName.toLowerCase();
  const fontWeight = element.style.fontWeight.trim().toLowerCase();
  return (
    tag === "b" ||
    tag === "strong" ||
    fontWeight === "bold" ||
    Number.parseInt(fontWeight, 10) >= 600
  );
};

const isItalicElement = (element: HTMLElement) => {
  const tag = element.tagName.toLowerCase();
  return tag === "i" || tag === "em" || element.style.fontStyle === "italic";
};

const mergeAdjacentSpans = (spans: RichTextSpan[]) => {
  const merged: RichTextSpan[] = [];
  for (const span of spans) {
    if (span.text.length === 0) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.bold === span.bold &&
      last.italic === span.italic &&
      last.text !== "\n" &&
      span.text !== "\n"
    ) {
      last.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
};

export const normalizeRichTextInput = (input: string) => {
  if (!input) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(input)) return input;
  if (typeof document === "undefined") {
    return input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>|<\/p>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "");
  }
  return editableHtmlToMarkdown(input);
};

/**
 * Start indexes of `*` / `**` markers that never get a closing partner. AI-generated and imported
 * labels are stored unescaped, so "Rate * Limit" must stay literal instead of turning the rest of
 * the label italic and dropping the asterisk. `***` is left to the normal toggle.
 */
const findUnmatchedMarkers = (input: string) => {
  const singles: number[] = [];
  const doubles: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "\\") {
      i += 1;
    } else if (input[i] === "*") {
      if (input[i + 1] === "*" && input[i + 2] === "*") i += 2;
      else if (input[i + 1] === "*") {
        doubles.push(i);
        i += 1;
      } else singles.push(i);
    }
  }
  const unmatched = new Set<number>();
  if (singles.length % 2 === 1) unmatched.add(singles[singles.length - 1]);
  if (doubles.length % 2 === 1) unmatched.add(doubles[doubles.length - 1]);
  return unmatched;
};

export const parseMarkdownRichText = (input: string): RichTextSpan[] => {
  const normalizedInput = normalizeRichTextInput(input);
  if (!normalizedInput) return [];

  const literal = findUnmatchedMarkers(normalizedInput);
  const spans: RichTextSpan[] = [];
  let buffer = "";
  let bold = false;
  let italic = false;

  const flush = () => {
    if (!buffer) return;
    spans.push({ text: buffer, bold, italic });
    buffer = "";
  };

  for (let index = 0; index < normalizedInput.length; index += 1) {
    const char = normalizedInput[index];
    if (char === "\\" && index + 1 < normalizedInput.length) {
      buffer += normalizedInput[index + 1];
      index += 1;
      continue;
    }

    if (char === "\n") {
      flush();
      spans.push({ text: "\n", bold: false, italic: false });
      continue;
    }

    if (char === "*" && literal.has(index)) {
      // A marker with no partner is just an asterisk (e.g. "5 * 3").
      buffer += char;
      if (normalizedInput[index + 1] === "*") {
        buffer += "*";
        index += 1;
      }
      continue;
    }

    if (
      char === "*" &&
      normalizedInput[index + 1] === "*" &&
      normalizedInput[index + 2] === "*"
    ) {
      flush();
      bold = !bold;
      italic = !italic;
      index += 2;
      continue;
    }

    if (char === "*" && normalizedInput[index + 1] === "*") {
      flush();
      bold = !bold;
      index += 1;
      continue;
    }

    if (char === "*") {
      flush();
      italic = !italic;
      continue;
    }

    buffer += char;
  }

  flush();
  return mergeAdjacentSpans(spans);
};

export const markdownToEditableHtml = (input: string) => {
  const spans = parseMarkdownRichText(input);
  if (typeof document === "undefined") {
    return spans
      .map((span) => {
        if (span.text === "\n") return "<br/>";
        const content = escapeHtml(span.text);
        const bold = span.bold ? "<strong>" : "";
        const italic = span.italic ? "<em>" : "";
        const closeItalic = span.italic ? "</em>" : "";
        const closeBold = span.bold ? "</strong>" : "";
        return `${bold}${italic}${content}${closeItalic}${closeBold}`;
      })
      .join("");
  }

  let html = "";
  for (const span of spans) {
    if (span.text === "\n") {
      html += "<br/>";
      continue;
    }
    const content = escapeHtml(span.text);
    const boldOpen = span.bold ? "<strong>" : "";
    const italicOpen = span.italic ? "<em>" : "";
    const italicClose = span.italic ? "</em>" : "";
    const boldClose = span.bold ? "</strong>" : "";
    html += `${boldOpen}${italicOpen}${content}${italicClose}${boldClose}`;
  }
  return html;
};

const serializeEditableNode = (
  node: Node,
  inheritedBold: boolean,
  inheritedItalic: boolean,
): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (tag === "br") {
    return "\n";
  }

  const nextBold = inheritedBold || isBoldElement(element);
  const nextItalic = inheritedItalic || isItalicElement(element);
  const openMarkers =
    nextBold === inheritedBold && nextItalic === inheritedItalic
      ? ""
      : `${nextBold && !inheritedBold ? "**" : ""}${nextItalic && !inheritedItalic ? "*" : ""}`;
  const closeMarkers =
    nextBold === inheritedBold && nextItalic === inheritedItalic
      ? ""
      : `${nextItalic && !inheritedItalic ? "*" : ""}${nextBold && !inheritedBold ? "**" : ""}`;

  let content = "";
  for (const child of Array.from(element.childNodes)) {
    content += serializeEditableNode(child, nextBold, nextItalic);
  }

  const wrappedContent = `${openMarkers}${content.replace(/\n+$/u, "")}${closeMarkers}`;

  return isBlockElement(tag) && wrappedContent.length > 0
    ? `${wrappedContent}\n`
    : wrappedContent;
};

export const editableHtmlToMarkdown = (input: string | HTMLElement) => {
  if (typeof document === "undefined") {
    return typeof input === "string"
      ? input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
      : "";
  }

  const root =
    typeof input === "string"
      ? // DOMParser documents are inert: a detached div's innerHTML would still fire <img onerror>.
        new DOMParser().parseFromString(input, "text/html").body
      : input;

  const markdown = Array.from(root.childNodes)
    .map((child) => serializeEditableNode(child, false, false))
    .join("")
    .replace(/\n+$/u, "");

  return markdown;
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
