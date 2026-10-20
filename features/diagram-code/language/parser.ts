import type { DiagnosticCode } from "./diagnostics";
import { DiagnosticSink } from "./diagnostics";
import type {
  CloseStatement,
  CommentNode,
  ConnectorSymbol,
  ConnectorToken,
  DocumentNode,
  NameNode,
  PropEntry,
  PropList,
  Ref,
  Statement,
  Token,
  TokenKind,
} from "./ast";
import { LineIndex, spanOf, textOf, trimSpan, type Span } from "./source";
import { EDGE_PROPERTY_KEYS } from "./vocab";

export const MAX_SOURCE_CHARS = 100_000;
export const MAX_SOURCE_LINES = 2_000;

// Longest first so "<-->" is not read as "<" followed by "-->", and "-->" not as "--".
const CONNECTORS: ConnectorSymbol[] = ["<-->", "-->", "<>", "--", ">", "<", "-"];
const DIRECTIVE = /^(title|type|direction)\s+(.+)$/i;
const BLOCK_KEYWORD = /^(frame|group)\s+(?=\S)/;
/** A trailing `[color: x, from: right]` on a connection, after its optional label. */
const EDGE_PROPS_TAIL = /\s*\[([^\]]*)\]\s*$/;

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

const unquote = (text: string): { value: string; quoted: boolean } => {
  const t = text.trim();
  const quoted = t.length >= 2 && t.startsWith('"') && t.endsWith('"');
  return { value: quoted ? t.slice(1, -1).replace(/\\"/g, '"') : t, quoted };
};

/**
 * Where a `//` comment starts on a line, or -1. It must be outside quotes and at the line start or
 * after whitespace, so a URL in a label ("A > B: https://api") is not mistaken for one.
 */
const commentStart = (source: string, from: number, to: number): number => {
  let quote = false;
  for (let i = from; i < to; i += 1) {
    const ch = source[i];
    if (quote && ch === "\\") i += 1;
    else if (ch === '"') quote = !quote;
    else if (!quote && ch === "/" && source[i + 1] === "/" && (i === from || isSpace(source[i - 1]))) return i;
  }
  return -1;
};

/** Split a span on `separator` outside quotes and brackets. Pieces are untrimmed. */
const splitTop = (source: string, span: Span, separator: string): Span[] => {
  const parts: Span[] = [];
  let begin = span.start;
  let quote = false;
  let depth = 0;
  for (let i = span.start; i < span.end; i += 1) {
    const ch = source[i];
    if (quote && ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === "[" || ch === "(") depth += 1;
      else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === separator && depth === 0) {
        parts.push(spanOf(begin, i));
        begin = i + 1;
      }
    }
  }
  parts.push(spanOf(begin, span.end));
  return parts;
};

interface EdgeTokens {
  parts: Span[];
  connectors: ConnectorToken[];
  label?: Span;
  /** Offset of the `:` that starts the label. */
  colon?: number;
}

/**
 * Break a line into endpoints, the connectors between them and an optional trailing `: label`. A
 * connector must stand alone (whitespace or line edge on both sides) so `x>y` stays a name; quoted
 * text and `[...]` are never split.
 */
const tokenizeEdge = (source: string, span: Span): EdgeTokens | null => {
  const parts: Span[] = [];
  const connectors: ConnectorToken[] = [];
  let begin = span.start;
  let quote = false;
  let depth = 0;
  let label: Span | undefined;
  let colon: number | undefined;

  for (let i = span.start; i < span.end; i += 1) {
    const ch = source[i];
    if (quote && ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (ch === ":" && connectors.length > 0) {
        label = trimSpan(source, spanOf(i + 1, span.end));
        colon = i;
        parts.push(trimSpan(source, spanOf(begin, i)));
        begin = span.end;
        break;
      }
      if (ch === "<" || ch === "-" || ch === ">") {
        const found = CONNECTORS.find((c) => source.startsWith(c, i) && i + c.length <= span.end);
        const before = i === span.start || isSpace(source[i - 1]);
        const after = found ? i + found.length >= span.end || isSpace(source[i + found.length]) : false;
        if (found && before && after) {
          parts.push(trimSpan(source, spanOf(begin, i)));
          connectors.push({ symbol: found, span: spanOf(i, i + found.length) });
          i += found.length - 1;
          begin = i + 1;
        }
      }
    }
  }
  if (connectors.length === 0) return null;
  if (label === undefined) parts.push(trimSpan(source, spanOf(begin, span.end)));
  return { parts, connectors, label, colon };
};

export const parseDocument = (source: string): DocumentNode => {
  const index = new LineIndex(source);
  const sink = new DiagnosticSink(index);
  const statements: Statement[] = [];
  const comments: CommentNode[] = [];
  const tokens: Token[] = [];
  const doc: DocumentNode = { source, statements, comments, tokens, diagnostics: sink.items, refused: false };

  const token = (kind: TokenKind, span: Span) => {
    if (span.end > span.start) tokens.push({ kind, span });
  };
  const fail = (code: DiagnosticCode, span: Span, message: string, suggestion?: string) => sink.error(code, span, message, suggestion);
  const warn = (code: DiagnosticCode, span: Span, message: string, suggestion?: string) => sink.warn(code, span, message, suggestion);

  if (source.length > MAX_SOURCE_CHARS || index.lineCount > MAX_SOURCE_LINES) {
    fail("limit/size", spanOf(0, 0), `The code is too large (limit ${MAX_SOURCE_LINES} lines / ${MAX_SOURCE_CHARS} characters).`);
    doc.refused = true;
    return doc;
  }

  const makeName = (span: Span): NameNode => {
    const { value, quoted } = unquote(textOf(source, span));
    return { text: value, quoted, span };
  };

  /** `key: value, key: value` between `from` and `to`. */
  const parseEntries = (from: number, to: number): PropEntry[] => {
    const entries: PropEntry[] = [];
    for (const piece of splitTop(source, spanOf(from, to), ",")) {
      const whole = trimSpan(source, piece);
      if (whole.end === whole.start) continue;
      const colon = (() => {
        const at = textOf(source, whole).indexOf(":");
        return at === -1 ? -1 : whole.start + at;
      })();
      if (colon === -1) {
        entries.push({ key: textOf(source, whole), keyText: textOf(source, whole), keySpan: whole, value: "", valueSpan: spanOf(whole.end, whole.end), quoted: false, hasColon: false, span: whole });
        token("property", whole);
        continue;
      }
      const keySpan = trimSpan(source, spanOf(whole.start, colon));
      const valueSpan = trimSpan(source, spanOf(colon + 1, whole.end));
      const { value, quoted } = unquote(textOf(source, valueSpan));
      const keyText = textOf(source, keySpan);
      entries.push({ key: keyText.toLowerCase(), keyText, keySpan, value, valueSpan: valueSpan.end === valueSpan.start ? spanOf(colon + 1, colon + 1) : valueSpan, quoted, hasColon: true, span: whole });
      token("property", keySpan);
      token("punctuation", spanOf(colon, colon + 1));
      token(quoted ? "string" : /^-?\d/.test(value) ? "number" : "value", valueSpan);
    }
    return entries;
  };

  /** `Name [props]`, or null (with an error) when there is no usable name. */
  const parseRef = (piece: Span): Ref | null => {
    const t = trimSpan(source, piece);
    if (t.end === t.start) {
      fail("syntax/missing-name", spanOf(piece.start, piece.start), "A node name is missing.");
      return null;
    }
    let quote = false;
    let quoteStart = -1;
    let bracket = -1;
    for (let i = t.start; i < t.end; i += 1) {
      const ch = source[i];
      if (quote && ch === "\\") i += 1;
      else if (ch === '"') {
        quote = !quote;
        if (quote) quoteStart = i;
      } else if (!quote && ch === "[") {
        bracket = i;
        break;
      }
    }
    if (quote) {
      fail("syntax/unterminated-string", spanOf(quoteStart, t.end), 'A quoted name is missing its closing ".');
      return null;
    }
    const namePart = trimSpan(source, spanOf(t.start, bracket === -1 ? t.end : bracket));
    let props: PropList | undefined;
    if (bracket !== -1) {
      const closed = source[t.end - 1] === "]" && t.end - 1 > bracket;
      if (!closed) fail("syntax/unclosed-properties", spanOf(bracket, t.end), "A property list is missing its closing ].");
      token("punctuation", spanOf(bracket, bracket + 1));
      const entries = parseEntries(bracket + 1, closed ? t.end - 1 : t.end);
      if (closed) token("punctuation", spanOf(t.end - 1, t.end));
      props = { entries, span: spanOf(bracket, t.end), closed };
    }
    const name = makeName(namePart);
    if (name.text === "") {
      fail("syntax/missing-name", spanOf(t.start, t.start), "A node name is missing.");
      return null;
    }
    // Braces mean "group" unless the name is quoted.
    if (!name.quoted && !textOf(source, namePart).startsWith('"') && /[{}]/.test(name.text)) {
      fail("syntax/invalid-name", namePart, 'A name cannot contain { or } unless it is in "quotes".', `"${name.text}"`);
      return null;
    }
    token(name.quoted ? "string" : "name", namePart);
    return { name, props, span: t };
  };

  const refsOf = (span: Span): Ref[] =>
    splitTop(source, span, ",")
      .map((piece) => parseRef(piece))
      .filter((ref): ref is Ref => ref !== null);

  let inHeader = true;
  let lineStart = 0;
  for (let line = 1; line <= index.lineCount; line += 1) {
    const next = line < index.lineCount ? index.lineStart(line + 1) : source.length + 1;
    let lineEnd = Math.min(next - 1, source.length);
    if (lineEnd > lineStart && source[lineEnd - 1] === "\r") lineEnd -= 1;
    const here = lineStart;
    lineStart = next;

    const full = trimSpan(source, spanOf(here, lineEnd));
    if (full.end === full.start) continue;

    // A whole-line `#` comment.
    if (source[full.start] === "#") {
      comments.push({ span: full, line, standalone: true });
      token("comment", full);
      continue;
    }

    const cut = commentStart(source, here, lineEnd);
    const codeEnd = cut === -1 ? lineEnd : cut;
    const text = trimSpan(source, spanOf(here, codeEnd));
    let comment: Span | undefined;
    if (cut !== -1) {
      comment = trimSpan(source, spanOf(cut, lineEnd));
      comments.push({ span: comment, line, standalone: text.end === text.start });
      token("comment", comment);
    }
    if (text.end === text.start) continue;
    const textValue = textOf(source, text);

    const push = <T extends Statement>(statement: T): T => {
      statements.push(statement);
      return statement;
    };

    // Directives are only recognised before the diagram body starts, so a node called "type checker" stays a node.
    if (inHeader) {
      const directive = DIRECTIVE.exec(textValue);
      if (directive) {
        const keySpan = spanOf(text.start, text.start + directive[1].length);
        const valueSpan = trimSpan(source, spanOf(text.end - directive[2].length, text.end));
        token("keyword", keySpan);
        token(unquote(textOf(source, valueSpan)).quoted ? "string" : "value", valueSpan);
        push({
          kind: "directive",
          key: directive[1].toLowerCase() as "title" | "type" | "direction",
          keySpan,
          value: unquote(directive[2]).value,
          valueSpan,
          line,
          span: text,
          comment,
        });
        continue;
      }
    }
    inHeader = false;

    if (textValue === "}") {
      token("punctuation", text);
      push<CloseStatement>({ kind: "close", line, span: text, comment });
      continue;
    }

    const edge = tokenizeEdge(source, text);
    if (edge) {
      const endpoints = edge.parts.map((part) => refsOf(part));
      // A missing name was already reported; the line is dropped rather than half-read.
      if (edge.parts.some((part, i) => endpoints[i].length === 0 && part.end === part.start)) continue;
      for (const connector of edge.connectors) token("connector", connector.span);
      let label: { text: string; span: Span } | undefined;
      let props: PropList | undefined;
      if (edge.label !== undefined && edge.colon !== undefined) {
        token("punctuation", spanOf(edge.colon, edge.colon + 1));
        const raw = textOf(source, edge.label);
        const tail = EDGE_PROPS_TAIL.exec(raw);
        const listStart = tail ? edge.label.start + tail.index + tail[0].indexOf("[") : -1;
        const listEnd = tail ? edge.label.start + tail.index + tail[0].lastIndexOf("]") : -1;
        const entries = tail ? splitTop(source, spanOf(listStart + 1, listEnd), ",").filter((piece) => trimSpan(source, piece).end > trimSpan(source, piece).start) : [];
        // Only a list made entirely of edge properties is one; "array[0]" in a label stays label text.
        const isEdgeProps = entries.length > 0 && entries.every((piece) => {
          const entry = textOf(source, piece);
          return entry.includes(":") && EDGE_PROPERTY_KEYS.has(entry.split(":")[0].trim().toLowerCase());
        });
        if (tail && isEdgeProps) {
          token("punctuation", spanOf(listStart, listStart + 1));
          props = { entries: parseEntries(listStart + 1, listEnd), span: spanOf(listStart, listEnd + 1), closed: true };
          token("punctuation", spanOf(listEnd, listEnd + 1));
          const text2 = raw.slice(0, tail.index).trim();
          const labelSpan = trimSpan(source, spanOf(edge.label.start, edge.label.start + tail.index));
          label = { text: text2, span: labelSpan };
          token("label", labelSpan);
        } else {
          label = { text: raw, span: edge.label };
          token("label", edge.label);
          if (/\[\s*(colou?r|from|to)\b/i.test(raw)) {
            const colorLike = /\[\s*colou?r\b/i.test(raw);
            warn(
              "syntax/edge-properties",
              edge.label,
              colorLike
                ? 'This looks like an edge color but is not "[color: name]" at the end of the connection; it was kept as label text.'
                : 'This looks like edge sides but is not "[from: side, to: side]" at the end of the connection; it was kept as label text.',
            );
          }
        }
      }
      push({ kind: "connect", endpoints, connectors: edge.connectors, label, props, line, span: text, comment });
      continue;
    }

    const maskedQuotes = textValue.replace(/"[^"]*"/g, (m) => `"${"_".repeat(Math.max(0, m.length - 2))}"`);
    const stray = /(^|\s)([-<>]{2,})(?=\s|$)/.exec(maskedQuotes);
    if (stray) {
      const at = text.start + stray.index + stray[1].length;
      const strayText = stray[2];
      warn(
        "syntax/unknown-connector",
        spanOf(at, at + strayText.length),
        `"${strayText}" is not a connector (use >, <, <>, -, -- or -->), so this line was read as a node name. Put the name in "quotes" if that is what you meant.`,
      );
      token("error", spanOf(at, at + strayText.length));
    }

    const inlineClose = /\{\s*\}$/.exec(textValue);
    if (inlineClose || textValue.endsWith("{")) {
      const headEnd = text.start + (inlineClose ? inlineClose.index : textValue.length - 1);
      const head = trimSpan(source, spanOf(text.start, headEnd));
      const keywordMatch = BLOCK_KEYWORD.exec(textOf(source, head));
      const keyword = keywordMatch ? spanOf(head.start, head.start + keywordMatch[1].length) : undefined;
      if (keyword) token("keyword", keyword);
      const ref = parseRef(spanOf(keywordMatch ? head.start + keywordMatch[0].length : head.start, head.end));
      if (!ref) continue;
      const braceAt = headEnd;
      token("punctuation", spanOf(braceAt, braceAt + 1));
      push({ kind: "open", block: keywordMatch ? (keywordMatch[1] as "frame" | "group") : "group", keyword, ref, line, span: text, comment });
      if (inlineClose) {
        token("punctuation", spanOf(text.end - 1, text.end));
        push<CloseStatement>({ kind: "close", line, span: spanOf(text.end - 1, text.end) });
      }
      continue;
    }

    const refs = refsOf(text);
    if (refs.length > 0) push({ kind: "declare", refs, line, span: text, comment });
  }

  // Tokens are recorded as each piece is understood, which is not always left to right on a connection line.
  tokens.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  // Broken lines can be read two ways at once (a stray connector inside an unclosed bracket); the first reading wins.
  let end = 0;
  doc.tokens = tokens.filter((t) => t.span.start >= end && ((end = t.span.end), true));
  return doc;
};
