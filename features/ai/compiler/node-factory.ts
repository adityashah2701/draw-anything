import { categoryTint, iconForNode } from "@/core/icons/registry";
import { sizeDiamondNode, sizeIconNode, sizeOutlineNode, sizePillNode, sizeSemanticNode, type NodeSize } from "@/core/text/node-size";
import { isOutlineVariantId, outlineForParams } from "@/core/shapes/outline/variants";
import { entityTableSize } from "@/core/shapes/entity-table/layout";
import { HEAD_HEIGHT as LIFELINE_HEAD_HEIGHT, headWidth } from "@/core/shapes/lifeline/definition";
import { parseRows } from "@/core/shapes/entity-table/rows";
import { classifierSize } from "@/core/shapes/uml-classifier/layout";
import { mindmapSize } from "@/core/shapes/mindmap-node/definition";
import { BRANCH_COLORS } from "@/core/mindmap/tree-api";
import { tint } from "@/core/color/named-colors";
import { codeDirectionOf } from "@/features/ai/layout/direction";
import type {
  AIDiagramDocumentV1,
  AIDiagramNode,
} from "@/features/ai/types";
import type {
  Bounds,
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";

export interface PositionedNode {
  node: AIDiagramNode;
  element: DrawingElement;
  bounds: Bounds;
  depth: number;
}

export const KIND_COLORS: Record<string, { fill: string; stroke: string }> = {
  service: { fill: "#dbeafe", stroke: "#1e3a8a" },
  api: { fill: "#e0f2fe", stroke: "#075985" },
  gateway: { fill: "#ede9fe", stroke: "#5b21b6" },
  authentication: { fill: "#fce7f3", stroke: "#9d174d" },
  database: { fill: "#fef3c7", stroke: "#92400e" },
  cache: { fill: "#dcfce7", stroke: "#166534" },
  queue: { fill: "#ccfbf1", stroke: "#0f766e" },
  "message-broker": { fill: "#ccfbf1", stroke: "#0f766e" },
  "event-bus": { fill: "#ccfbf1", stroke: "#0f766e" },
  storage: { fill: "#ffedd5", stroke: "#9a3412" },
  dns: { fill: "#f0f9ff", stroke: "#0369a1" },
  firewall: { fill: "#fee2e2", stroke: "#991b1b" },
  waf: { fill: "#ffe4e6", stroke: "#be123c" },
  "load-balancer": { fill: "#ede9fe", stroke: "#5b21b6" },
  kubernetes: { fill: "#dbeafe", stroke: "#1d4ed8" },
  pod: { fill: "#e0f2fe", stroke: "#0369a1" },
  cluster: { fill: "#dbeafe", stroke: "#1e40af" },
  container: { fill: "#ecfeff", stroke: "#0e7490" },
  worker: { fill: "#fef9c3", stroke: "#854d0e" },
  "service-mesh": { fill: "#e0e7ff", stroke: "#3730a3" },
  deployment: { fill: "#dcfce7", stroke: "#166534" },
  namespace: { fill: "#f1f5f9", stroke: "#475569" },
  region: { fill: "#eff6ff", stroke: "#1d4ed8" },
  "availability-zone": { fill: "#eef2ff", stroke: "#4338ca" },
  user: { fill: "#f5f3ff", stroke: "#6d28d9" },
  browser: { fill: "#f5f3ff", stroke: "#6d28d9" },
  mobile: { fill: "#f5f3ff", stroke: "#6d28d9" },
  start: { fill: "#dcfce7", stroke: "#15803d" },
  end: { fill: "#fee2e2", stroke: "#b91c1c" },
  decision: { fill: "#ffe4e6", stroke: "#be123c" },
  workflow: { fill: "#e0f2fe", stroke: "#075985" },
  parallel: { fill: "#ede9fe", stroke: "#5b21b6" },
  retry: { fill: "#fef9c3", stroke: "#854d0e" },
  loop: { fill: "#fef9c3", stroke: "#854d0e" },
  agent: { fill: "#e0e7ff", stroke: "#3730a3" },
  tool: { fill: "#e2e8f0", stroke: "#334155" },
  memory: { fill: "#fef9c3", stroke: "#854d0e" },
  "vector-store": { fill: "#fef3c7", stroke: "#92400e" },
  "ai-model": { fill: "#e0e7ff", stroke: "#3730a3" },
  dashboard: { fill: "#ecfccb", stroke: "#3f6212" },
  alerting: { fill: "#fee2e2", stroke: "#b91c1c" },
  config: { fill: "#f8fafc", stroke: "#334155" },
  cicd: { fill: "#e0f2fe", stroke: "#075985" },
  external: { fill: "#f1f5f9", stroke: "#334155" },
};

/** The colours a node of this kind gets when its code names no `color:` (so a reader can tell the two apart). */
export const kindColors = (kind: string | undefined) => (kind ? KIND_COLORS[kind] : undefined);

export const NODE_FONT_SIZE = 17;
export const NODE_FONT_WEIGHT = "600";
export const BASE_NODE_HEIGHT = 78;
/** Normal widest node, and the widest one allowed when a single word needs more room. */
export const NODE_MAX_WIDTH = 280;
export const NODE_WIDEST_WIDTH = 520;
export const ICON_NODE_FONT_SIZE = 14;
export const LIFELINE_SLOT_WIDTH = 150;
/** Vertical room each message gets on a lifeline; the body grows with the number of messages. */
export const MESSAGE_STEP = 56;
export const DECISION_NODE_HEIGHT = 92;
export const PILL_NODE_HEIGHT = 64;

/**
 * Decisions are real diamonds and start/end are pills, both with no icon tile; the rest are semantic
 * nodes. An explicit `shape:` wins over what the kind implies.
 */
export const shapeOf = (node: AIDiagramNode): "diamond" | "pill" | "icon" | (string & {}) | undefined => {
  // `shape: icon` draws just the glyph, so it needs one: a named icon, or a kind that has its own.
  if (node.shape === "icon") return node.icon || node.kind !== "generic" ? "icon" : undefined;
  const shape = node.shape ?? (node.kind === "decision" ? "diamond" : node.kind === "start" || node.kind === "end" ? "pill" : undefined);
  const stackedOutline = node.stack && shape !== undefined && shape !== "rectangle";
  return node.border || node.marker || stackedOutline ? (outlineForParams(shape) ?? shape) : shape;
};

/** Structured shapes (entity table, classifier, topic, lifeline) are sized by their own layout modules, from their content. */
export const STRUCTURED_TYPES: Record<string, DrawingElement["type"]> = { entity: "entity-table", class: "uml-classifier", topic: "mindmap-node", lifeline: "lifeline" };

export const splitMembers = (text: string | undefined) => (text ? text.split(";").map((s) => s.trim()).filter(Boolean) : []);

export const structuredSize = (node: AIDiagramNode, shape: string | undefined): NodeSize | null => {
  const data = node.data ?? {};
  if (shape === "entity") return { ...entityTableSize({ name: node.label, kind: data.variant as never, rows: parseRows(data.rows) }), fits: true } as NodeSize;
  if (shape === "class") return { ...classifierSize({ name: node.label, kind: data.variant as never, stereotype: data.stereotype, attributes: splitMembers(data.attributes), operations: splitMembers(data.operations) }), fits: true } as NodeSize;
  if (shape === "topic") return { ...mindmapSize({ role: (data.mindRole as "central" | "main" | "sub" | "leaf" | undefined) ?? "sub", label: node.label }), fits: true } as NodeSize;
  // The slot is as wide as the head plus room for the messages' labels; the drawn body is narrow and centred in it.
  if (shape === "lifeline") return { width: Math.max(LIFELINE_SLOT_WIDTH, headWidth({ name: node.label }) + 10), height: 120, fits: true } as NodeSize;
  return null;
};

/** Topics' roles and branch colours from the diagram's edges: the topic nothing points to is the centre, its children are main branches (each its own colour), everything below inherits. */
export const mindmapRoles = (document: AIDiagramDocumentV1) => {
  const topics = new Set(document.nodes.filter((n) => n.shape === "topic").map((n) => n.id));
  const parent = new Map<string, string>();
  for (const e of document.edges) if (topics.has(e.from) && topics.has(e.to) && !parent.has(e.to) && e.from !== e.to) parent.set(e.to, e.from);
  const depth = (id: string, seen = new Set<string>()): number => (parent.has(id) && !seen.has(id) ? 1 + depth(parent.get(id)!, seen.add(id)) : 0);
  const mainIndex = new Map<string, number>();
  document.nodes.filter((n) => topics.has(n.id) && depth(n.id) === 1).forEach((n, i) => mainIndex.set(n.id, i));
  const colorOf = (id: string): string | undefined => {
    let at = id;
    for (let g = 0; g < 50 && parent.has(at) && depth(at) > 1; g += 1) at = parent.get(at)!;
    const i = mainIndex.get(at);
    return i === undefined ? undefined : BRANCH_COLORS[i % BRANCH_COLORS.length];
  };
  return { parent, role: (id: string): "central" | "main" | "sub" | "leaf" => (depth(id) === 0 ? "central" : depth(id) === 1 ? "main" : depth(id) === 2 ? "sub" : "leaf"), colorOf };
};

/**
 * Width and height of a node from its label (core/text/node-size.ts): the fewest lines that fit,
 * the narrowest box for them, and a height that holds them.
 */
export const sizeDiagramNode = (node: AIDiagramNode, density: string): NodeSize => {
  const shape = shapeOf(node);
  const structured = structuredSize(node, shape);
  if (structured) return structured;
  if (shape === "icon") return sizeIconNode({ label: node.label, fontSize: ICON_NODE_FONT_SIZE, fontWeight: NODE_FONT_WEIGHT });
  if (shape && isOutlineVariantId(shape)) return sizeOutlineNode(shape, { label: node.label, fontSize: NODE_FONT_SIZE, fontWeight: NODE_FONT_WEIGHT, maxWidth: NODE_MAX_WIDTH });
  const sizeWith = (maxWidth: number) => {
    const input = {
      label: node.label,
      fontSize: NODE_FONT_SIZE,
      fontWeight: NODE_FONT_WEIGHT,
      minWidth: density === "compact" ? 150 : density === "spacious" ? 190 : 168,
      maxWidth,
      minHeight: shape === "diamond" ? DECISION_NODE_HEIGHT : shape === "pill" ? PILL_NODE_HEIGHT : BASE_NODE_HEIGHT,
    };
    return shape === "diamond" ? sizeDiamondNode(input) : shape === "pill" ? sizePillNode(input) : sizeSemanticNode(input);
  };
  let size = sizeWith(NODE_MAX_WIDTH);
  for (let width = NODE_MAX_WIDTH + 80; !size.fits && width <= NODE_WIDEST_WIDTH; width += 80) size = sizeWith(width);
  return size;
};

/** A node's element, turned into its structured form: the content comes from the node's data, the look (colours, points) stays what was computed. */
export const structuredElement = (
  element: DrawingElement,
  node: AIDiagramNode,
  type: DrawingElement["type"],
  mind: ReturnType<typeof mindmapRoles>,
  document: AIDiagramDocumentV1,
): DrawingElement => {
  const { label, nodeStyle, ...rest } = element as DrawingElement & { nodeStyle?: unknown };
  void nodeStyle;
  const data = node.data ?? {};
  if (type === "entity-table") return { ...rest, type, name: node.label, ...(data.variant ? { kind: data.variant } : {}), rows: parseRows(data.rows) } as unknown as DrawingElement;
  if (type === "uml-classifier") {
    const attrs = splitMembers(data.attributes), ops = splitMembers(data.operations);
    return { ...rest, type, name: node.label, ...(data.variant ? { kind: data.variant } : {}), ...(data.stereotype ? { stereotype: data.stereotype } : {}), ...(data.template ? { template: data.template } : {}), ...(attrs.length ? { attributes: attrs } : {}), ...(ops.length ? { operations: ops } : {}) } as unknown as DrawingElement;
  }
  if (type === "mindmap-node") {
    const color = mind.colorOf(node.id);
    const parentId = mind.parent.get(node.id);
    return { ...rest, label, type, role: mind.role(node.id), ...(parentId ? { parentId: `${document.metadata.generationId}-${parentId}` } : {}), ...(color ? { branchColor: color } : {}) } as unknown as DrawingElement;
  }
  return { ...rest, type, name: node.label } as unknown as DrawingElement;
};

export const createPositionedNode = (
  node: AIDiagramNode,
  size: { width: number; height: number },
  at: { x: number; y: number },
  depth: number,
  document: AIDiagramDocumentV1,
  frameId: string,
  messageCount: number,
  mind: ReturnType<typeof mindmapRoles>,
): PositionedNode => {
  const shape = shapeOf(node);
  const neutral = !!shape && shape in STRUCTURED_TYPES;
  const style = node.color
    ? { fill: tint(node.color, 0.88), stroke: node.color }
    : ((neutral ? undefined : KIND_COLORS[node.kind]) ?? {
        fill: depth % 2 === 0 ? "#f8fafc" : "#eef2ff",
        stroke: "#1f2937",
      });
  const importance =
    document.visualImportance.find((entry) => entry.nodeId === node.id)?.score ?? 5;
  const isLifeline = shape === "lifeline";
  const bodyW = 16;
  const bodyH = Math.max(140, MESSAGE_STEP * (messageCount + 1));
  const bounds: Bounds = isLifeline
    ? { minX: at.x + (size.width - bodyW) / 2, minY: at.y + LIFELINE_HEAD_HEIGHT, maxX: at.x + (size.width + bodyW) / 2, maxY: at.y + LIFELINE_HEAD_HEIGHT + bodyH, width: bodyW, height: bodyH }
    : { minX: at.x, minY: at.y, maxX: at.x + size.width, maxY: at.y + size.height, width: size.width, height: size.height };
  const structuredType = shape ? STRUCTURED_TYPES[shape] : undefined;
  const isIcon = shape === "icon";
  const glyph = isIcon && !node.color && !KIND_COLORS[node.kind] ? iconForNode({ icon: node.icon, semanticKind: node.kind }) : null;
  const element = {
    id: `${document.metadata.generationId}-${node.id}`,
    type: shape && isOutlineVariantId(shape) ? "outline" : ((structuredType ? "semantic-node" : (shape ?? "semantic-node")) as "diamond" | "pill" | "icon" | "semantic-node"),
    ...(shape && isOutlineVariantId(shape)
      ? { variant: shape, ...(node.border ? { border: node.border } : {}), ...(node.marker ? { marker: node.marker } : {}), ...(node.stack ? { stack: true } : {}) }
      : {}),
    points: [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ],
    color: glyph ? (glyph.color ?? categoryTint(glyph.category)) : style.stroke,
    strokeWidth: importance >= 8 ? 3 : 2,
    ...(isIcon ? {} : { fill: style.fill }),
    ...(!shape && (node.stack || (!node.icon && node.kind === "generic"))
      ? { nodeStyle: { ...(!node.icon && node.kind === "generic" ? { iconHidden: true } : {}), ...(node.stack ? { stack: true } : {}) } }
      : {}),
    label: node.label,
    fontSize: isIcon ? ICON_NODE_FONT_SIZE : NODE_FONT_SIZE,
    fontWeight: NODE_FONT_WEIGHT,
    ai: {
      frameId,
      generationId: document.metadata.generationId,
      semanticId: node.id,
      semanticKind: node.kind,
      ...(node.icon ? { icon: node.icon } : {}),
      diagramType: document.diagramType,
      ...(codeDirectionOf(document.layoutHints.direction) ? { diagramDirection: codeDirectionOf(document.layoutHints.direction)! } : {}),
      role: "node",
    },
  } as DrawingElement;
  const placed = structuredType ? structuredElement(element, node, structuredType, mind, document) : element;
  return { node, element: placed, bounds, depth };
};

