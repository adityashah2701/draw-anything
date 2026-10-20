import { COLOR_NAMES } from "@/core/color/named-colors";
import { writeName } from "../../serialize";
import {
  BLOCK_KEYWORDS,
  CONNECTORS,
  DIAGRAM_TYPES,
  HEADER_KEYS,
  KINDS,
  PROPERTIES,
  SIDES,
  propertyDoc,
  shapeNames,
  type ElementKind,
} from "../vocab";

export type CompletionKind = "keyword" | "node" | "property" | "value" | "connector" | "icon" | "kind" | "snippet";

export interface CompletionItem {
  label: string;
  /** Text that replaces the word being typed. */
  insert: string;
  kind: CompletionKind;
  detail?: string;
}

export interface CompletionResult {
  /** The range the chosen item replaces. */
  from: number;
  to: number;
  items: CompletionItem[];
  /**
   * True inside a property list or header, where Enter should take the first suggestion. At the start of
   * a statement a suggestion only wins once the person moves into the list, so Enter after a new name
   * still ends the line.
   */
  eager: boolean;
}

export interface CompletionContext {
  /** Names of nodes declared anywhere in the document. */
  nodeNames: readonly string[];
  /** Icon ids and aliases the editor knows. */
  iconIds: readonly string[];
  /** True while the cursor is still in the header block (nothing but title/type/direction above it). */
  inHeader: boolean;
}

const MAX_ITEMS = 40;
const WORD = /[A-Za-z0-9_-]/;

interface LineState {
  /** Offset of the `[` the cursor is inside, or -1. */
  bracket: number;
  inQuote: boolean;
  inComment: boolean;
  /** A connector precedes the cursor (outside brackets). */
  afterConnector: boolean;
  /** A `:` label separator precedes the cursor, after a connector. */
  afterLabelColon: boolean;
  /** Start of the current item: after the last connector, comma or line start (outside brackets). */
  itemStart: number;
}

/** Scan a line's text up to the cursor, tracking just enough structure to know what may be typed next. */
const scan = (line: string): LineState => {
  const state: LineState = { bracket: -1, inQuote: false, inComment: false, afterConnector: false, afterLabelColon: false, itemStart: 0 };
  if (line.trimStart().startsWith("#")) return { ...state, inComment: true };
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (state.inQuote) {
      if (ch === "\\") i += 1;
      else if (ch === '"') state.inQuote = false;
      continue;
    }
    if (ch === '"') {
      state.inQuote = true;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/" && (i === 0 || /\s/.test(line[i - 1]))) return { ...state, inComment: true };
    if (state.bracket !== -1) {
      if (ch === "]") state.bracket = -1;
      continue;
    }
    if (ch === "[") {
      state.bracket = i;
      continue;
    }
    if (state.afterLabelColon) continue;
    if (ch === ":" && state.afterConnector) {
      state.afterLabelColon = true;
      continue;
    }
    if (ch === ",") {
      state.itemStart = i + 1;
      continue;
    }
    if (ch === "<" || ch === "-" || ch === ">") {
      const found = CONNECTORS.map((c) => c.symbol)
        .sort((a, b) => b.length - a.length)
        .find((c) => line.startsWith(c, i));
      const before = i === 0 || /\s/.test(line[i - 1]);
      const after = found ? i + found.length >= line.length || /\s/.test(line[i + found.length]) : false;
      if (found && before && after) {
        state.afterConnector = true;
        state.itemStart = i + found.length;
        i += found.length - 1;
      }
    }
  }
  return state;
};

const rank = (query: string, label: string): number => {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (q === "") return 1;
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  const word = l.split(/[\s-]+/).some((w) => w.startsWith(q));
  if (word) return 2;
  return l.includes(q) ? 3 : -1;
};

const filter = (items: CompletionItem[], query: string): CompletionItem[] =>
  items
    .map((item, index) => ({ item, index, score: rank(query, item.label) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, MAX_ITEMS)
    .map((entry) => entry.item);

const valueItems = (type: string, iconIds: readonly string[]): CompletionItem[] => {
  switch (type) {
    case "kind":
      return KINDS.map((k) => ({ label: k, insert: k, kind: "kind" as const }));
    case "icon":
      return iconIds.map((id) => ({ label: id, insert: id, kind: "icon" as const }));
    case "shape":
      return shapeNames().map((s) => ({ label: s, insert: s, kind: "value" as const }));
    case "color":
      return COLOR_NAMES.map((c) => ({ label: c, insert: c, kind: "value" as const }));
    case "boolean":
      return ["true", "false"].map((b) => ({ label: b, insert: b, kind: "value" as const }));
    case "side":
      return SIDES.map((s) => ({ label: s, insert: s, kind: "value" as const }));
    default:
      return [];
  }
};

/** True while nothing but header lines (title, type, direction) lies above the cursor's line. */
export const inHeaderAt = (compiled: { document: { statements: ReadonlyArray<{ kind: string; span: { start: number } }> }; }, source: string, offset: number): boolean => {
  const lineStart = source.lastIndexOf("\n", Math.min(offset, source.length) - 1) + 1;
  return !compiled.document.statements.some((s) => s.kind !== "directive" && s.span.start < lineStart);
};

/**
 * What can be typed at `offset`. Reads only the text of the current line up to the cursor, so it
 * works on code that does not parse (which is most of the time while typing). Returns null when
 * nothing should be offered (inside a string, a comment or a connection label).
 */
export const completeAt = (source: string, offset: number, context: CompletionContext): CompletionResult | null => {
  const at = Math.min(Math.max(offset, 0), source.length);
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  let lineEnd = source.indexOf("\n", at);
  if (lineEnd === -1) lineEnd = source.length;
  const prefix = source.slice(lineStart, at);
  const whole = source.slice(lineStart, lineEnd);
  const state = scan(prefix);
  if (state.inQuote || state.inComment) return null;

  const wordEnd = (() => {
    let end = at;
    while (end < lineEnd && WORD.test(source[end])) end += 1;
    return end;
  })();
  const result = (from: number, items: CompletionItem[], query: string, eager = false): CompletionResult | null => {
    const shown = filter(items, query);
    return shown.length > 0 ? { from, to: wordEnd, items: shown, eager } : null;
  };

  // Inside [ ... ]: a property name, or the value of one.
  if (state.bracket !== -1) {
    const inner = prefix.slice(state.bracket + 1);
    const entryStart = (() => {
      let quote = false;
      let last = -1;
      for (let i = 0; i < inner.length; i += 1) {
        if (inner[i] === '"') quote = !quote;
        else if (!quote && inner[i] === ",") last = i;
      }
      return last + 1;
    })();
    const entry = inner.slice(entryStart);
    const base = lineStart + state.bracket + 1 + entryStart;
    const lead = entry.length - entry.trimStart().length;
    const colon = entry.indexOf(":");
    // A block's keyword says what it is before its `{` has been typed; a bare `Name [..] {` is a group.
    const element: ElementKind = state.afterLabelColon
      ? "edge"
      : /^\s*frame\s/.test(whole)
        ? "frame"
        : /^\s*group\s/.test(whole) || /\{\s*$/.test(whole.trimEnd())
          ? "group"
          : "node";

    if (colon === -1) {
      const word = entry.trimStart();
      const used = new Set(inner.split(",").map((piece) => piece.split(":")[0].trim().toLowerCase()).filter(Boolean));
      const items: CompletionItem[] = PROPERTIES.filter((p) => p.appliesTo.includes(element))
        .filter((p) => !used.has(p.key) || word.toLowerCase() === p.key)
        .map((p) => ({ label: p.key, insert: `${p.key}: `, kind: "property" as const, detail: p.summary }));
      return result(base + lead, items, word, true);
    }
    const key = entry.slice(0, colon).trim().toLowerCase();
    const doc = propertyDoc(key, element);
    if (!doc) return null;
    const valuePart = entry.slice(colon + 1);
    const word = valuePart.trimStart();
    if (word.startsWith('"')) return null;
    const items = valueItems(doc.value, context.iconIds).map((item) => ({ ...item, detail: item.detail ?? doc.summary }));
    return result(base + colon + 1 + (valuePart.length - word.length), items, word, true);
  }

  if (state.afterLabelColon) return null;

  // Header lines: `type <diagram type>`, `direction <down|right>`.
  const header = /^\s*(type|direction)\s+(\S*)$/i.exec(prefix);
  if (context.inHeader && header) {
    const values = header[1].toLowerCase() === "type" ? DIAGRAM_TYPES : ["down", "right"];
    return result(at - header[2].length, values.map((v) => ({ label: v, insert: v, kind: "value" as const })), header[2], true);
  }

  const item = prefix.slice(state.itemStart);
  const word = item.trimStart();
  const wordStart = at - word.length;

  // Right after a name and a space: the rest of a longer name, else connectors or a property list.
  if (word !== "" && /\s$/.test(word) && !state.afterConnector && state.itemStart === 0) {
    const longer = [...new Set(context.nodeNames)].filter((name) => name.toLowerCase().startsWith(word.toLowerCase()) && name.length > word.length);
    if (longer.length > 0) return result(wordStart, longer.map((name) => ({ label: name, insert: writeName(name), kind: "node" as const, detail: "node" })), word);
    const items: CompletionItem[] = [
      ...CONNECTORS.map((c) => ({ label: c.symbol, insert: `${c.symbol} `, kind: "connector" as const, detail: c.summary })),
      { label: "[", insert: "[", kind: "snippet" as const, detail: "Properties: kind, icon, color, ..." },
    ];
    return { from: at, to: at, items, eager: false };
  }

  const names: CompletionItem[] = [...new Set(context.nodeNames)].map((name) => ({ label: name, insert: writeName(name), kind: "node" as const, detail: "node" }));
  // Only the start of a line can begin a block or a header directive.
  const atLineStart = state.itemStart === 0 && !state.afterConnector && prefix.trim() === word.trim() && !/[\s]/.test(word.trim());
  const starters: CompletionItem[] = atLineStart
    ? [
        ...BLOCK_KEYWORDS.map((b) => ({ label: b.keyword, insert: `${b.keyword} `, kind: "keyword" as const, detail: b.summary })),
        ...(context.inHeader ? HEADER_KEYS.map((k) => ({ label: k, insert: `${k} `, kind: "keyword" as const, detail: "header" })) : []),
      ]
    : [];
  if (word.includes(" ")) return result(wordStart, names, word);
  // Keywords only on a prefix: "A" must not offer "frame" just because it contains an a.
  const typed = word.toLowerCase();
  return result(wordStart, [...starters.filter((s) => s.label.startsWith(typed)), ...names], word);
};
