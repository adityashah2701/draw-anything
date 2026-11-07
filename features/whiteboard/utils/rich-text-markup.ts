import {
  escapeHtml,
  escapeMarkdownText,
  escapeNonEditorAngles,
  looksLikeEditorHtml,
  parseMarkdownRichText,
  registerRichTextNormalizer,
  stripEditorHtml,
  type RichTextSpan,
} from "@/core/text/rich-text-markup";

export type { RichTextSpan };
export { looksLikeEditorHtml, escapeNonEditorAngles, parseMarkdownRichText, stripEditorHtml };

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

export const normalizeRichTextInput = (input: string) => {
  if (!input) return "";
  if (!looksLikeEditorHtml(input)) return input;
  if (typeof document === "undefined") {
    return stripEditorHtml(input);
  }
  return editableHtmlToMarkdown(escapeNonEditorAngles(input));
};

// Register with core for runtime HTML normalizations
registerRichTextNormalizer(normalizeRichTextInput);

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
