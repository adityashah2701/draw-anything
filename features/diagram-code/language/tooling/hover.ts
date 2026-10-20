import { getIcon, resolveIconId } from "@/core/icons/registry";
import { normalizeColor } from "@/core/color/named-colors";
import { normalizeSemanticKind } from "@/features/ai/schemas";
import type { PropEntry, Statement } from "../ast";
import type { CompiledCode } from "../compile";
import type { Diagnostic } from "../diagnostics";
import { membersOf } from "../ir";
import type { Span } from "../source";
import { BLOCK_KEYWORDS, CONNECTORS, SHAPES, propertyDoc, resolveShape, type ElementKind } from "../vocab";

export interface Hover {
  /** The text the hover is about. */
  span: Span;
  title: string;
  /** Short lines of explanation. */
  lines: string[];
  /** Diagnostics whose range covers the offset, so a squiggle and its explanation appear together. */
  diagnostics: Diagnostic[];
}

const inside = (span: Span, offset: number) => offset >= span.start && offset <= span.end;

interface EntryAt {
  entry: PropEntry;
  element: ElementKind;
}

const entryAt = (statements: readonly Statement[], offset: number): EntryAt | null => {
  for (const statement of statements) {
    if (!inside(statement.span, offset)) continue;
    const lists: Array<{ entries: PropEntry[]; element: ElementKind }> = [];
    if (statement.kind === "declare") for (const ref of statement.refs) lists.push({ entries: ref.props?.entries ?? [], element: "node" });
    if (statement.kind === "connect") {
      for (const side of statement.endpoints) for (const ref of side) lists.push({ entries: ref.props?.entries ?? [], element: "node" });
      lists.push({ entries: statement.props?.entries ?? [], element: "edge" });
    }
    if (statement.kind === "open") lists.push({ entries: statement.ref.props?.entries ?? [], element: statement.block });
    for (const list of lists) {
      const entry = list.entries.find((e) => inside(e.span, offset));
      if (entry) return { entry, element: list.element };
    }
  }
  return null;
};

const describeValue = (entry: PropEntry, element: ElementKind): string[] | null => {
  const doc = propertyDoc(entry.key, element);
  const value = entry.value;
  if (!doc || value === "") return null;
  if (doc.value === "kind") {
    const kind = normalizeSemanticKind(value);
    return kind === "generic" && value.trim().toLowerCase() !== "generic" ? null : [`Kind \`${kind}\`${resolveIconId(kind) ? `, drawn with the ${getIcon(kind).title ?? kind} icon` : ""}.`];
  }
  if (doc.value === "icon") {
    const id = resolveIconId(value);
    if (!id) return null;
    const icon = getIcon(id);
    return [`Icon \`${id}\`${icon.title && icon.title !== id ? ` (${icon.title})` : ""}, category ${icon.category}.${id !== value.trim().toLowerCase() ? ` "${value}" is an alias.` : ""}`];
  }
  if (doc.value === "shape") {
    const shape = resolveShape(value);
    return shape ? [SHAPES.find((s) => s.name === shape)!.summary] : null;
  }
  if (doc.value === "color") {
    const hex = normalizeColor(value);
    return hex ? [`Colour ${hex}.`] : null;
  }
  return null;
};

/** Documentation for whatever is under `offset`: properties and their values, nodes, connectors, keywords. */
export const hoverAt = (compiled: CompiledCode, offset: number): Hover | null => {
  const diagnostics = compiled.diagnostics.filter((d) => inside(d.span, offset) && (d.span.end > d.span.start || d.span.start === offset));
  const token = compiled.tokens.find((t) => offset >= t.span.start && offset <= t.span.end && t.span.end > t.span.start);
  const base = (span: Span, title: string, lines: string[]): Hover => ({ span, title, lines, diagnostics });

  const hit = entryAt(compiled.document.statements, offset);
  if (hit) {
    const { entry, element } = hit;
    const doc = propertyDoc(entry.key, element);
    if (doc && inside(entry.keySpan, offset)) {
      return base(entry.keySpan, doc.key, [doc.summary, `Example: \`${doc.example}\``]);
    }
    if (doc && inside(entry.valueSpan, offset)) {
      const described = describeValue(entry, element);
      if (described) return base(entry.valueSpan, `${doc.key}: ${entry.value}`, described);
    }
  }

  const reference = compiled.references.find((r) => inside(r.span, offset));
  if (reference) {
    const { ir } = compiled;
    if (reference.kind === "node") {
      const node = ir.nodes.find((n) => n.id === reference.id)!;
      const degree = ir.edges.filter((e) => e.from === node.id || e.to === node.id).length;
      const parent = node.parent && [...ir.groups, ...ir.frames].find((c) => c.id === node.parent!.id);
      const lines = [
        `${node.kind ? `Kind ${node.kind}. ` : ""}${degree} connection${degree === 1 ? "" : "s"}.`,
        ...(parent ? [`Inside ${node.parent!.type} "${"title" in parent ? parent.title : parent.label}".`] : []),
        ...(node.label !== node.name ? [`Shown as "${node.label}".`] : []),
      ];
      return base(reference.span, node.name, lines);
    }
    if (reference.kind === "group") {
      const group = ir.groups.find((g) => g.id === reference.id)!;
      const count = membersOf(ir, { type: "group", id: group.id }).length;
      return base(reference.span, group.label, [`Group of ${count} node${count === 1 ? "" : "s"}.`]);
    }
    const frame = ir.frames.find((f) => f.id === reference.id)!;
    const count = membersOf(ir, { type: "frame", id: frame.id }).length;
    return base(reference.span, frame.title, [`Frame holding ${count} node${count === 1 ? "" : "s"}.`]);
  }

  if (token?.kind === "connector") {
    const symbol = compiled.document.source.slice(token.span.start, token.span.end);
    const doc = CONNECTORS.find((c) => c.symbol === symbol);
    if (doc) return base(token.span, symbol, [doc.summary]);
  }
  if (token?.kind === "keyword") {
    const word = compiled.document.source.slice(token.span.start, token.span.end);
    const block = BLOCK_KEYWORDS.find((b) => b.keyword === word);
    if (block) return base(token.span, word, [block.summary]);
    const header: Record<string, string> = {
      title: "The diagram's title. Header lines come first in the file.",
      type: "The kind of diagram (architecture, flowchart, mind-map, ...). Picks layout defaults.",
      direction: "down or right. Accepted, but layout does not use it yet.",
    };
    if (header[word.toLowerCase()]) return base(token.span, word, [header[word.toLowerCase()]]);
  }
  if (diagnostics.length > 0) return base(diagnostics[0].span, diagnostics[0].severity === "error" ? "Error" : "Warning", []);
  return null;
};
