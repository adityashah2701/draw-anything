export interface RichTextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
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

// The only tags the label editor's contentEditable produces. Any other "<...>" in a label is text the
// user typed (`List<String>`, `<Component />`) and must be kept, not mistaken for markup and dropped.
const EDITOR_TAGS = "br|div|p|span|strong|b|em|i|u|li|ul|ol";
const EDITOR_TAG = new RegExp(`</?(?:${EDITOR_TAGS})(?:[\\s/][^>]*)?>`, "i");
const OTHER_ANGLE = new RegExp(`<(?!/?(?:${EDITOR_TAGS})[\\s/>])`, "gi");

/** True when the text contains markup the editor wrote (so it needs converting back to markdown). */
export const looksLikeEditorHtml = (input: string) => EDITOR_TAG.test(input);

/** Turn every "<" that does not start an editor tag into "&lt;" so an HTML parser keeps it as text. */
export const escapeNonEditorAngles = (input: string) => input.replace(OTHER_ANGLE, "&lt;");

export const normalizeRichTextInput = (input: string) => {
  if (!input) return "";
  if (!looksLikeEditorHtml(input)) return input;
  if (typeof document === "undefined") {
    return input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>|<\/p>|<\/li>/gi, "\n")
      .replace(new RegExp(`</?(?:${EDITOR_TAGS})(?:[\\s/][^>]*)?>`, "gi"), "");
  }
  return editableHtmlToMarkdown(escapeNonEditorAngles(input));
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

