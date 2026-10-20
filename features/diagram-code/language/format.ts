import type { DocumentNode, PropEntry, PropList, Ref, Statement } from "./ast";
import type { Diagnostic } from "./diagnostics";
import { compileDiagramCode } from "./compile";
import { irFingerprint } from "./ir";
import { LineIndex, textOf } from "./source";
import { PROPERTIES } from "./vocab";

export interface FormatResult {
  /** The formatted text; the input unchanged when formatting was refused. */
  text: string;
  changed: boolean;
  /** Set when the code has errors: formatting would have to guess, so nothing is touched. */
  refused?: { reason: string; diagnostics: Diagnostic[] };
}

const INDENT = "  ";

/** Canonical property order: identity first, then look, then geometry, then label, then connection sides. */
const ORDER = ["kind", "icon", "shape", "color", "dashed", "x", "y", "w", "h", "padding", "label", "from", "to"];

const rank = (key: string): number => {
  const canonical = PROPERTIES.find((p) => p.key === key || p.aliases?.includes(key))?.key;
  const at = canonical === undefined ? -1 : ORDER.indexOf(canonical);
  return at === -1 ? ORDER.length : at;
};

/**
 * Deterministic layout of a document that parses without errors: two-space indentation, one space
 * around connectors and after commas, properties in canonical order (unknown ones last, in the order
 * written), a single blank line wherever one or more were written, comments kept where they were.
 * Names, labels and property values are copied exactly as written, so the meaning cannot change.
 */
export const formatDocument = (doc: DocumentNode): string => {
  const { source } = doc;
  const text = (span: { start: number; end: number }) => textOf(source, span);

  const entryText = (entry: PropEntry): string => {
    if (!entry.hasColon) return text(entry.span);
    const value = text(entry.valueSpan);
    // Known keys are case-insensitive; write them in their canonical lower case, keep unknown ones as written.
    const known = PROPERTIES.some((p) => p.key === entry.key || p.aliases?.includes(entry.key));
    const key = known ? entry.key : entry.keyText;
    return value === "" ? `${key}:` : `${key}: ${value}`;
  };

  const propsText = (list: PropList | undefined): string => {
    if (!list || list.entries.length === 0) return "";
    const ordered = list.entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => rank(a.entry.key) - rank(b.entry.key) || a.index - b.index)
      .map(({ entry }) => entryText(entry));
    return ` [${ordered.join(", ")}]`;
  };

  const refText = (ref: Ref): string => `${text(ref.name.span)}${propsText(ref.props)}`;

  const statementText = (statement: Statement): string => {
    switch (statement.kind) {
      case "directive":
        return `${statement.key} ${text(statement.valueSpan)}`;
      case "declare":
        return statement.refs.map(refText).join(", ");
      case "connect": {
        let line = "";
        statement.endpoints.forEach((side, i) => {
          line += side.map(refText).join(", ");
          if (i < statement.connectors.length) line += ` ${statement.connectors[i].symbol} `;
        });
        const label = statement.label ? text(statement.label.span) : "";
        const props = propsText(statement.props).trim();
        if (label !== "" || props !== "") line += `: ${[label, props].filter((part) => part !== "").join(" ")}`;
        return line;
      }
      case "open":
        return `${statement.keyword ? `${text(statement.keyword)} ` : ""}${refText(statement.ref)} {`;
      case "close":
        return "}";
    }
  };

  const index = new LineIndex(source);
  const byLine = new Map<number, Statement[]>();
  for (const statement of doc.statements) byLine.set(statement.line, [...(byLine.get(statement.line) ?? []), statement]);
  const standalone = new Map(doc.comments.filter((c) => c.standalone).map((c) => [c.line, text(c.span)]));

  const out: string[] = [];
  let depth = 0;
  let blank = false;
  const emit = (line: string) => {
    if (blank && out.length > 0) out.push("");
    blank = false;
    out.push(line);
  };

  for (let line = 1; line <= index.lineCount; line += 1) {
    const statements = byLine.get(line);
    if (statements) {
      for (const statement of statements) {
        if (statement.kind === "close") depth = Math.max(0, depth - 1);
        const comment = statement.comment ? ` ${text(statement.comment)}` : "";
        emit(`${INDENT.repeat(depth)}${statementText(statement)}${comment}`);
        if (statement.kind === "open") depth += 1;
      }
    } else if (standalone.has(line)) {
      emit(`${INDENT.repeat(depth)}${standalone.get(line)}`);
    } else if (text({ start: index.lineStart(line), end: line < index.lineCount ? index.lineStart(line + 1) : source.length }).trim() === "") {
      blank = true;
    }
  }
  return out.length > 0 ? `${out.join("\n")}\n` : "";
};

/** Format source text. Code with errors is returned untouched, with the reasons. */
export const formatDiagramCode = (source: string): FormatResult => {
  const compiled = compileDiagramCode(source);
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) return { text: source, changed: false, refused: { reason: "The code has errors; fix them before formatting.", diagnostics: errors } };
  const text = formatDocument(compiled.document);
  // Formatting only moves whitespace, but a name that looks like a connector can change meaning when
  // spacing changes (`A ,> B`); prove the result reads the same, and keep the original if it does not.
  if (irFingerprint(compileDiagramCode(text).ir) !== irFingerprint(compiled.ir)) {
    return { text: source, changed: false, refused: { reason: "Formatting would change what the code means (a name looks like a connector); quote it first.", diagnostics: [] } };
  }
  return { text, changed: text !== source };
};
