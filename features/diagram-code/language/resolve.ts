import { listIcons } from "@/core/icons/registry";
import {
  CARDINALITIES,
  NOTATIONS,
  RELATION_KINDS,
  normalizeRelation,
  parseEndValue,
  parseNotation,
  parseRelationKind,
  relationProblem,
  reverseRelation,
} from "@/core/shapes/arrow/relations";
import { MARKER_IDS, isMarkerId } from "@/core/shapes/outline/markers";
import { expandStructured } from "./structured";
import { BPMN_GATEWAYS, BPMN_POSITIONS, BPMN_TASKS, BPMN_TRIGGERS, expandBpmn } from "./bpmn";
import type { ConnectorEnd, ConnectorRelation, RelationKind, RelationNotation } from "@/features/whiteboard/types/whiteboard.types";
import { normalizeColor } from "@/core/color/named-colors";
import { normalizeSemanticKind, parseDiagramType } from "@/features/ai/schemas";
import { slugId } from "@/features/ai/compiler/validation";
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
  EDGE_ONLY_KEYS,
  parametricShape,
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
  stack?: boolean;
  border?: "double" | "thick";
  marker?: string;
  relation?: RelationKind;
  notation?: RelationNotation;
  /** What `from:` / `to:` (or `from-end:` / `to-end:`) say about an end when the value is not a side. */
  fromEnd?: ConnectorEnd;
  toEnd?: ConnectorEnd;
  fromRole?: string;
  toRole?: string;
  data?: Record<string, string>;
  position?: string;
  trigger?: string;
  gatewayType?: string;
  taskType?: string;
  throwing?: boolean;
  /** What a parametric shape name (`shape: timer-event`) stands for; explicit properties win over it. */
  entry?: { border?: "double" | "thick"; marker?: string; stack?: boolean };
  shape?: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  from?: EdgeSide;
  to?: EdgeSide;
}

/** A status is a colour with a meaning; it is stored as that colour, so it needs no field of its own. */
const STATUS_COLORS: Record<string, string> = { error: "#dc2626", warning: "#ea580c", success: "#16a34a", info: "#2563eb" };

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
            `Shape "${value}" is not a known shape; the shapes are ${shapeNames().join(", ")} (icon needs an icon: id). It was ignored and the node is drawn as a rectangle.${hint ? ` ${hint}` : near ? ` Did you mean "${near}"?` : ""}`,
            near,
          );
        } else if (shape !== "rectangle") {
          const parametric = parametricShape(shape);
          props.shape = parametric ? parametric.base : shape;
          if (parametric) props.entry = { border: parametric.border, marker: parametric.marker, stack: parametric.stack };
        }
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
      case "border": {
        const v = value.trim().toLowerCase();
        if (v === "double" || v === "thick") props.border = v;
        else if (v !== "single" && v !== "none") sink.warn("property/invalid-value", entry.valueSpan, `"border: ${value}" is not a border (use double or thick); it was ignored.`, closest(v, ["double", "thick"]));
        return;
      }
      case "status": {
        const color = STATUS_COLORS[value.trim().toLowerCase()];
        if (color) props.color = color;
        else sink.warn("property/invalid-value", entry.valueSpan, `"status: ${value}" is not a status (use ${Object.keys(STATUS_COLORS).join(", ")}); it was ignored.`, closest(value.trim().toLowerCase(), Object.keys(STATUS_COLORS)));
        return;
      }
      case "marker": {
        const v = value.trim().toLowerCase();
        if (isMarkerId(v)) props.marker = v;
        else if (v !== "none") sink.warn("property/invalid-value", entry.valueSpan, `"marker: ${value}" is not a marker (use ${MARKER_IDS.join(", ")}); it was ignored.`, closest(v, MARKER_IDS));
        return;
      }
      case "data": {
        props.data = { ...props.data, [doc.key]: value.trim() };
        return;
      }
      case "bpmn": {
        const v = value.trim().toLowerCase();
        const allowed: Record<string, readonly string[]> = { position: BPMN_POSITIONS, trigger: Object.keys(BPMN_TRIGGERS), gateway: Object.keys(BPMN_GATEWAYS), task: Object.keys(BPMN_TASKS) };
        if (!allowed[doc.key].includes(v)) sink.warn("property/invalid-value", entry.valueSpan, `"${doc.key}: ${value}" is not one of ${allowed[doc.key].join(", ")}; it was ignored.`, closest(v, allowed[doc.key]));
        else if (doc.key === "position") props.position = v;
        else if (doc.key === "trigger") props.trigger = v;
        else if (doc.key === "gateway") props.gatewayType = v;
        else props.taskType = v;
        return;
      }
      case "boolean": {
        const v = value.trim().toLowerCase();
        if (v === "true" || v === "false") {
          if (doc.key === "throwing") props.throwing = v === "true";
          else props[doc.key === "stack" ? "stack" : "dashed"] = v === "true";
        }
        else sink.warn("property/invalid-value", entry.valueSpan, `"${key}" needs true or false; it was ignored.`, "true");
        return;
      }
      case "end": {
        const word = value.trim().toLowerCase();
        const fromEnd = doc.key === "from" || doc.key === "from-end";
        // `from:` and `to:` take a side or what the end says; the explicit `-end` forms never mean a side.
        if (!doc.key.endsWith("-end") && (SIDES as readonly string[]).includes(word)) {
          if (fromEnd) props.from = word as EdgeSide;
          else props.to = word as EdgeSide;
          return;
        }
        const data = parseEndValue(value);
        if (!data) {
          sink.warn(
            "property/invalid-value",
            entry.valueSpan,
            `"${key}: ${value}" is neither a side (top, right, bottom, left) nor a multiplicity (1, 0..1, 0..*, 2..5) or cardinality (${CARDINALITIES.join(", ")}); it was ignored.`,
            closest(word, [...SIDES, ...CARDINALITIES]),
          );
          return;
        }
        if (fromEnd) props.fromEnd = { ...props.fromEnd, ...data };
        else props.toEnd = { ...props.toEnd, ...data };
        return;
      }
      case "relation": {
        const kind = parseRelationKind(value);
        if (kind) props.relation = kind;
        else sink.warn("property/invalid-value", entry.valueSpan, `"${value}" is not a relation (use ${RELATION_KINDS.join(", ")}); it was ignored.`, closest(value.trim().toLowerCase(), RELATION_KINDS));
        return;
      }
      case "notation": {
        const notation = parseNotation(value);
        if (notation) props.notation = notation;
        else sink.warn("property/invalid-value", entry.valueSpan, `"${value}" is not a notation (use ${NOTATIONS.join(", ")}); it was ignored.`, closest(value.trim().toLowerCase(), NOTATIONS));
        return;
      }
      case "role": {
        const role = value.trim();
        if (doc.key === "from-role") props.fromRole = role;
        else props.toRole = role;
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
    const structured = expandStructured(props.shape, props.data);
    if (structured) {
      node.shape = structured.shape;
      node.data = structured.data;
    }
    // `shape: event|gateway|task|subprocess` and their choices expand into what the canvas draws; explicit properties still win.
    const bpmn = expandBpmn(props.shape, { position: props.position, trigger: props.trigger, gatewayType: props.gatewayType, taskType: props.taskType, throwing: props.throwing });
    if (bpmn) {
      if (bpmn.shape) node.shape = bpmn.shape;
      else delete node.shape;
      if (bpmn.icon && props.icon === undefined) node.icon = bpmn.icon;
      if (bpmn.border && props.border === undefined) node.border = bpmn.border;
      if (bpmn.marker && props.marker === undefined) node.marker = bpmn.marker;
    }
    const border = props.border ?? props.entry?.border;
    const marker = props.marker ?? props.entry?.marker;
    const stack = props.stack ?? props.entry?.stack;
    if (border !== undefined) node.border = border;
    if (marker !== undefined) node.marker = marker;
    if (stack !== undefined) node.stack = stack;
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
        } else if (current && !original) {
          node.parent = currentRef();
          containerOf.set(node.id, current);
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

  /** The relation the properties of one connection describe; end data alone means an association. Fields the kind cannot take are reported. */
  const buildRelation = (props: Props, span: Span): ConnectorRelation | undefined => {
    const start: ConnectorEnd | undefined = props.fromEnd || props.fromRole ? { ...props.fromEnd, ...(props.fromRole ? { role: props.fromRole } : {}) } : undefined;
    const end: ConnectorEnd | undefined = props.toEnd || props.toRole ? { ...props.toEnd, ...(props.toRole ? { role: props.toRole } : {}) } : undefined;
    if (!props.relation && !props.notation && !start && !end) return undefined;
    const raw: ConnectorRelation = { kind: props.relation ?? "association", ...(props.notation ? { notation: props.notation } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}) };
    const kept = normalizeRelation(raw)!;
    if (JSON.stringify(kept) !== JSON.stringify(raw)) {
      sink.warn("relation/ends-ignored", span, `A ${raw.kind} does not take every end value given here (cardinality, multiplicity and role depend on the relation); the ones it cannot show were ignored.`);
    }
    if (props.notation && raw.kind !== "er-relationship") sink.warn("relation/notation-ignored", span, `notation applies to an er-relationship; a ${raw.kind} has one drawing.`);
    return kept;
  };

  const resolveEdge = (statement: ConnectStatement) => {
    // `A > B [relation: composition]`: a bracket on the last name that holds only connection properties belongs to the connection.
    const last = statement.endpoints.length - 1;
    const moved: PropEntry[] = [];
    const endpoints = statement.endpoints.map((side, i) =>
      i !== last
        ? side
        : side.map((ref) => {
            if (!ref.props || ref.props.entries.length === 0 || !ref.props.entries.every((entry) => EDGE_ONLY_KEYS.has(entry.key))) return ref;
            moved.push(...ref.props.entries);
            return { ...ref, props: undefined };
          }),
    );
    const edgeProps: PropList | undefined = moved.length > 0 ? { entries: [...(statement.props?.entries ?? []), ...moved], span: statement.props?.span ?? moved[0].span, closed: true } : statement.props;
    const resolved = endpoints.map((side) => side.map((ref) => resolveNode(ref, false)));
    let color: string | undefined;
    let fromSide: EdgeSide | undefined;
    let toSide: EdgeSide | undefined;
    let relation: ConnectorRelation | undefined;
    if (edgeProps) {
      const props = readProps(edgeProps, "edge");
      color = props.color;
      fromSide = props.from;
      toSide = props.to;
      relation = buildRelation(props, edgeProps.span);
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
            ...(relation ? { relation: reversed ? reverseRelation(relation) : relation } : {}),
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
          else sink.warn("header/unknown-direction", statement.valueSpan, `Unknown direction "${statement.value}" was ignored.`, closest(statement.value, ["down", "right", "up", "left"]));
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

  const nodeById = new Map(ir.nodes.map((node) => [node.id, node]));
  for (const edge of ir.edges) {
    if (!edge.relation) continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const problem = from && to ? relationProblem(edge.relation.kind, from, to) : null;
    if (problem) sink.warn("relation/incompatible", edge.span, problem);
  }

  for (const node of ir.nodes) {
    if (node.shape === "icon" && !node.icon && (node.kind === undefined || normalizeSemanticKind(node.kind) === "generic")) {
      sink.warn("shape/needs-icon", node.span, `"${node.name}" is drawn as a bare icon but has no icon or kind; add icon: or kind:.`);
    }
  }

  return { ir, diagnostics: sink.items, references };
};
