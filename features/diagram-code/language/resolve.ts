import { listIcons } from "@/core/icons/registry";
import { normalizeColor } from "@/core/color/named-colors";
import { normalizeSemanticKind, parseDiagramType } from "@/features/ai/schemas";
import { slugId } from "@/features/ai/server/validation";
import type { ConnectStatement, DocumentNode, PropEntry, PropList, Ref } from "./ast";
import { DiagnosticSink, type Diagnostic } from "./diagnostics";
import { emptyIR, type ContainerRef, type DiagramIR, type EdgeSide, type IREdge, type IRFrame, type IRGroup, type IRNode, type SymbolReference } from "./ir";
import { LineIndex, type Span } from "./source";
import { closest } from "./suggest";
import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_ALIAS_NAMES,
  KINDS,
  KIND_ALIAS_NAMES,
  NUMBER_LIMITS,
  SIDES,
  UNSUPPORTED_PROPERTIES,
  UNSUPPORTED_SHAPES,
  iconCandidates,
  iconStatus,
  kindStatus,
  propertyDoc,
  propertyNames,
  resolveDirection,
  resolveShape,
  shapeNames,
  type ElementKind,
} from "./vocab";

export interface ResolveResult {
  ir: DiagramIR;
  /** Semantic diagnostics only; combine with the document's syntax diagnostics. */
  diagnostics: Diagnostic[];
  references: SymbolReference[];
}

interface Props {
  kind?: string;
  icon?: string;
  label?: string;
  dashed?: boolean;
  shape?: "diamond" | "pill" | "icon";
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  from?: EdgeSide;
  to?: EdgeSide;
}

const NUMBER_FIELD: Record<string, "x" | "y" | "width" | "height" | "padding"> = {
  x: "x",
  y: "y",
  w: "width",
  h: "height",
  padding: "padding",
};

const round1 = (n: number) => Math.round(n * 10) / 10;

interface OpenContainer {
  type: "group" | "frame";
  id: string;
  label: string;
  span: Span;
}

export const resolveDocument = (doc: DocumentNode): ResolveResult => {
  const ir = emptyIR();
  const references: SymbolReference[] = [];
  const sink = new DiagnosticSink(new LineIndex(doc.source));
  if (doc.refused) return { ir, diagnostics: [], references };

  const nodeByName = new Map<string, IRNode>();
  const containerOf = new Map<string, OpenContainer | undefined>(); // node id -> container it was created in
  const usedNodeIds = new Set<string>();
  const usedContainerIds = new Set<string>();
  const usedEdgeIds = new Set<string>();
  const stack: OpenContainer[] = [];

  const uniqueId = (base: string, used: Set<string>) => {
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  const readProps = (list: PropList | undefined, element: ElementKind): Props => {
    const props: Props = {};
    if (!list) return props;
    const seen = new Set<string>();
    for (const entry of list.entries) applyEntry(entry, element, props, seen);
    return props;
  };

  const applyEntry = (entry: PropEntry, element: ElementKind, props: Props, seen: Set<string>) => {
    const { key } = entry;
    if (!entry.hasColon) {
      sink.warn("property/missing-value", entry.span, `Property "${entry.keyText}" needs a value (key: value).`);
      return;
    }
    if (UNSUPPORTED_PROPERTIES.has(key)) {
      sink.warn("property/unsupported", entry.keySpan, `"${key}" is not supported yet and was ignored.`);
      return;
    }
    const doc = propertyDoc(key, element);
    if (!doc) {
      const elsewhere = (["node", "group", "frame", "edge"] as const).find((other) => propertyDoc(key, other));
      if (elsewhere) {
        sink.warn("property/not-for-element", entry.keySpan, `"${key}" does not apply to ${element === "edge" ? "a connection" : `a ${element}`}; it was ignored.`);
      } else {
        const near = closest(key, propertyNames(element));
        sink.warn("property/unknown", entry.keySpan, `Unknown property "${key}" was ignored.${near ? ` Did you mean "${near}"?` : ""}`, near);
      }
      return;
    }
    if (seen.has(doc.key)) sink.warn("property/duplicate", entry.keySpan, `"${doc.key}" is set more than once here; the last value wins.`);
    seen.add(doc.key);
    const value = entry.value;

    switch (doc.value) {
      case "shape": {
        const shape = resolveShape(value);
        if (shape === undefined) {
          const hint = UNSUPPORTED_SHAPES[value.trim().toLowerCase()];
          const near = hint ? undefined : closest(value, shapeNames());
          sink.warn(
            "shape/unsupported",
            entry.valueSpan,
            `Shape "${value}" is not supported yet; only diamond, pill (also oval, ellipse), icon (needs an icon: id) and rectangle are. It was ignored.${hint ? ` ${hint}` : near ? ` Did you mean "${near}"?` : ""}`,
            near,
          );
        } else if (shape !== "rectangle") props.shape = shape;
        return;
      }
      case "color": {
        const color = normalizeColor(value);
        if (color) props.color = color;
        else sink.warn("property/invalid-value", entry.valueSpan, `Color "${value}" was not recognised (use a name such as blue, or "#rrggbb"); it was ignored.`);
        return;
      }
      case "number": {
        const field = NUMBER_FIELD[doc.key];
        const number = Number(value);
        const size = field === "width" || field === "height";
        const [low, high] = size ? [NUMBER_LIMITS.minSize, NUMBER_LIMITS.maxSize] : field === "padding" ? [0, NUMBER_LIMITS.maxPadding] : [-NUMBER_LIMITS.coordinate, NUMBER_LIMITS.coordinate];
        if (!Number.isFinite(number) || value.trim() === "") {
          sink.warn("property/invalid-value", entry.valueSpan, `"${key}" needs a number (e.g. ${key}: 120); it was ignored.`);
        } else if (number < low || number > high) {
          sink.warn("property/out-of-range", entry.valueSpan, `"${key}: ${value}" is out of range (${low} to ${high}); it was ignored.`);
        } else {
          props[field] = round1(number);
        }
        return;
      }
      case "boolean": {
        const v = value.trim().toLowerCase();
        if (v === "true" || v === "false") props.dashed = v === "true";
        else sink.warn("property/invalid-value", entry.valueSpan, `"${key}" needs true or false; it was ignored.`, "true");
        return;
      }
      case "side": {
        const side = value.trim().toLowerCase();
        if (!(SIDES as readonly string[]).includes(side)) {
          sink.warn("property/invalid-value", entry.valueSpan, `"${key}: ${value}" is not a side (use top, right, bottom or left); it was ignored.`, closest(side, SIDES));
        } else if (doc.key === "from") props.from = side as EdgeSide;
        else props.to = side as EdgeSide;
        return;
      }
      case "kind": {
        props.kind = value;
        if (kindStatus(value) === "unknown") {
          const near = closest(value, [...KINDS, ...KIND_ALIAS_NAMES]);
          sink.warn("reference/unknown-kind", entry.valueSpan, `Unknown kind "${value}"; the node is drawn as a generic one.${near ? ` Did you mean "${near}"?` : ""}`, near);
        }
        return;
      }
      case "icon": {
        props.icon = value;
        if (iconStatus(value) === "unknown") {
          const near = closest(value, iconCandidates(listIcons().map((icon) => icon.id)));
          sink.warn("reference/unknown-icon", entry.valueSpan, `Unknown icon "${value}"; the kind's icon is used instead.${near ? ` Did you mean "${near}"?` : ""}`, near);
        }
        return;
      }
      default:
        props.label = value;
    }
  };

  const applyNodeProps = (node: IRNode, props: Props) => {
    if (props.kind !== undefined) node.kind = props.kind;
    if (props.icon !== undefined) node.icon = props.icon;
    if (props.label !== undefined) node.label = props.label;
    if (props.dashed !== undefined) node.dashed = props.dashed;
    if (props.shape !== undefined) node.shape = props.shape;
    if (props.color !== undefined) node.color = props.color;
    for (const field of ["x", "y", "width", "height"] as const) if (props[field] !== undefined) node[field] = props[field];
  };

  const currentRef = (): ContainerRef | undefined => {
    const top = stack[stack.length - 1];
    return top && { type: top.type, id: top.id };
  };

  /** Find or create a node; a new node joins the innermost open container. */
  const resolveNode = (ref: Ref, explicit: boolean): IRNode => {
    const props = readProps(ref.props, "node");
    let node = nodeByName.get(ref.name.text);
    if (node) {
      references.push({ kind: "node", id: node.id, span: ref.name.span, definition: false });
      if (explicit) {
        sink.warn("node/redeclared", ref.name.span, `"${ref.name.text}" was already declared; the properties were merged.`);
        const current = stack[stack.length - 1];
        const original = containerOf.get(node.id);
        if (current && original && current.id !== original.id) {
          sink.warn("node/other-parent", ref.name.span, `"${ref.name.text}" already belongs to "${original.label}"; it was not moved.`);
        }
      }
    } else {
      node = {
        id: uniqueId(slugId(ref.name.text, "node"), usedNodeIds),
        name: ref.name.text,
        label: ref.name.text,
        parent: currentRef(),
        span: ref.name.span,
      };
      ir.nodes.push(node);
      nodeByName.set(ref.name.text, node);
      containerOf.set(node.id, stack[stack.length - 1]);
      references.push({ kind: "node", id: node.id, span: ref.name.span, definition: true });
    }
    applyNodeProps(node, props);
    return node;
  };

  const resolveEdge = (statement: ConnectStatement) => {
    const resolved = statement.endpoints.map((side) => side.map((ref) => resolveNode(ref, false)));
    let color: string | undefined;
    let fromSide: EdgeSide | undefined;
    let toSide: EdgeSide | undefined;
    if (statement.props) {
      const props = readProps(statement.props, "edge");
      color = props.color;
      fromSide = props.from;
      toSide = props.to;
    }
    const label = statement.label?.text || undefined;
    statement.connectors.forEach((connector, i) => {
      for (const left of resolved[i]) {
        for (const right of resolved[i + 1]) {
          const reversed = connector.symbol === "<";
          const [from, to] = reversed ? [right, left] : [left, right];
          if (from.id === to.id) {
            sink.warn("edge/self-loop", connector.span, `"${from.name}" cannot connect to itself; the connection was ignored.`);
            continue;
          }
          const edge: IREdge = {
            id: uniqueId(`${from.id}-to-${to.id}`, usedEdgeIds),
            from: from.id,
            to: to.id,
            label,
            bidirectional: connector.symbol === "<>" || connector.symbol === "<-->" ? true : undefined,
            dashed: connector.symbol === "-->" || connector.symbol === "<-->" || connector.symbol === "--" ? true : undefined,
            plain: connector.symbol === "-" || connector.symbol === "--" ? true : undefined,
            color,
            // A reversed connector (`<`) swaps the ends, so the sides swap with them.
            fromSide: reversed ? toSide : fromSide,
            toSide: reversed ? fromSide : toSide,
            line: statement.line,
            span: statement.span,
          };
          ir.edges.push(edge);
        }
      }
    });
  };

  for (const statement of doc.statements) {
    switch (statement.kind) {
      case "directive": {
        if (statement.key === "title") ir.title = statement.value;
        else if (statement.key === "type") {
          const type = parseDiagramType(statement.value);
          if (type) ir.diagramType = type;
          else {
            const near = closest(statement.value, [...DIAGRAM_TYPES, ...DIAGRAM_TYPE_ALIAS_NAMES]);
            sink.warn("header/unknown-type", statement.valueSpan, `Unknown diagram type "${statement.value}" was ignored.${near ? ` Did you mean "${near}"?` : ""}`, near);
          }
        } else {
          const direction = resolveDirection(statement.value);
          if (direction) ir.direction = direction;
          else sink.warn("header/unknown-direction", statement.valueSpan, `Unknown direction "${statement.value}" was ignored.`, closest(statement.value, ["down", "right"]));
        }
        break;
      }
      case "declare":
        for (const ref of statement.refs) resolveNode(ref, nodeByName.has(ref.name.text));
        break;
      case "connect":
        resolveEdge(statement);
        break;
      case "open": {
        const element: ElementKind = statement.block;
        const props = readProps(statement.ref.props, element);
        const name = statement.ref.name.text;
        const inGroup = [...stack].reverse().find((open) => open.type === "group");
        if (statement.block === "frame" && inGroup) {
          sink.error("nesting/frame-in-group", statement.keyword ?? statement.ref.span, `A frame cannot be inside the group "${inGroup.label}"; put the group inside the frame instead.`);
        }
        const id = uniqueId(slugId(name, statement.block), usedContainerIds);
        const label = props.label ?? name;
        // A frame's parent is the nearest frame; a group may sit in either.
        const parent = statement.block === "frame" ? [...stack].reverse().find((open) => open.type === "frame") : stack[stack.length - 1];
        const parentRef = parent && { type: parent.type, id: parent.id };
        if (statement.block === "group") {
          const group: IRGroup = { id, name, label, parent: parentRef, span: statement.ref.name.span };
          ir.groups.push(group);
        } else {
          const frame: IRFrame = {
            id,
            name,
            title: label,
            parent: parentRef,
            x: props.x,
            y: props.y,
            width: props.width,
            height: props.height,
            padding: props.padding,
            color: props.color,
            span: statement.ref.name.span,
          };
          ir.frames.push(frame);
        }
        references.push({ kind: statement.block, id, span: statement.ref.name.span, definition: true });
        stack.push({ type: statement.block, id, label, span: statement.ref.name.span });
        break;
      }
      case "close":
        if (stack.length === 0) sink.error("syntax/unmatched-close", statement.span, "Unmatched } (no group or frame is open).");
        else stack.pop();
        break;
    }
  }

  for (const open of stack) {
    sink.error("syntax/unclosed-block", open.span, `The ${open.type} "${open.label}" is never closed (missing }).`);
  }

  for (const node of ir.nodes) {
    if (node.shape === "icon" && !node.icon && (node.kind === undefined || normalizeSemanticKind(node.kind) === "generic")) {
      sink.warn("shape/needs-icon", node.span, `"${node.name}" is drawn as a bare icon but has no icon or kind; add icon: or kind:.`);
    }
  }

  return { ir, diagnostics: sink.items, references };
};
