export interface RichTextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const escapeMarkdownText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*");

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

/** Pure string regex fallback when no DOM environment is present. */
export const stripEditorHtml = (input: string) => {
  if (!input || !looksLikeEditorHtml(input)) return input;
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>|<\/p>|<\/li>/gi, "\n")
    .replace(new RegExp(`</?(?:${EDITOR_TAGS})(?:[\\s/][^>]*)?>`, "gi"), "");
};

type HtmlToMarkdownNormalizer = (input: string) => string;
let registeredNormalizer: HtmlToMarkdownNormalizer | null = null;

/**
 * Register an optional DOM-aware normalizer (e.g. from browser whiteboard feature)
 * without coupling core to DOM APIs.
 */
export const registerRichTextNormalizer = (normalizer: HtmlToMarkdownNormalizer | null) => {
  registeredNormalizer = normalizer;
};

export const normalizeRichTextInput = (input: string): string => {
  if (!input) return "";
  if (!looksLikeEditorHtml(input)) return input;
  if (registeredNormalizer) {
    return registeredNormalizer(input);
  }
  return stripEditorHtml(input);
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

