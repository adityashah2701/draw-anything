import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const SYSTEM_PROMPT = `
You are an expert system architect.
Generate ONLY a logical graph as valid JSON:
{
  "nodes": [...],
  "edges": [...]
}

Rules:
- No markdown.
- No explanations.
- Unique node ids.
- Labels must be concise (1-4 words).
- Node type must be either "rectangle" or "circle".
- Use "circle" for database/start/end only.
- Do not emit any visual coordinates.

Node format:
{
  "id": "string",
  "label": "string",
  "type": "rectangle" | "circle"
}

Edge format:
{
  "from": "node_id",
  "to": "node_id"
}
`;

interface NodeJson {
  id: string;
  type?: "rectangle" | "circle";
  label: string;
  layer?: number;
  column?: number;
}

interface EdgeJson {
  from: string;
  to: string;
}

interface DiagramJson {
  nodes: NodeJson[];
  edges: EdgeJson[];
}

type ShapeType = "rectangle" | "circle";
type Handle = "top" | "right" | "bottom" | "left";

type CanvasElement = {
  id: string;
  type: "rectangle" | "circle" | "arrow";
  label?: string;
  points: { x: number; y: number }[];
  fill?: string;
  color: string;
  strokeWidth: number;
  startConnection?: { elementId: string; handle: string };
  endConnection?: { elementId: string; handle: string };
};

interface LogicalNode {
  id: string;
  label: string;
  shape: ShapeType;
}

interface LogicalGraph {
  nodes: LogicalNode[];
  edges: EdgeJson[];
}

interface LayoutConfig {
  canvasPaddingX: number;
  canvasPaddingY: number;
  minSiblingGap: number;
  componentGap: number;
  layerGap: number;
  rectangleWidth: number;
  rectangleHeight: number;
  circleDiameter: number;
}

interface LayoutNode {
  id: string;
  label: string;
  shape: ShapeType;
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  children: string[];
  parentId: string | null;
}

function generateShortId(index: number): string {
  return `ai_${Date.now()}_${index}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toShapeType(node: NodeJson): ShapeType {
  if (node.type === "circle") return "circle";

  const label = node.label.toLowerCase();
  const shouldCircle =
    label.includes("db") ||
    label.includes("database") ||
    label.includes("start") ||
    label.includes("end");

  return shouldCircle ? "circle" : "rectangle";
}

function sanitizeGraph(raw: DiagramJson): LogicalGraph {
  const nodesById = new Map<string, LogicalNode>();

  for (const node of raw.nodes) {
    if (!node || typeof node.id !== "string" || typeof node.label !== "string") {
      continue;
    }

    const id = node.id.trim();
    const label = node.label.trim();

    if (!id || !label || nodesById.has(id)) {
      continue;
    }

    nodesById.set(id, {
      id,
      label: label.slice(0, 42),
      shape: toShapeType(node),
    });
  }

  const uniqueEdgeKeys = new Set<string>();
  const edges: EdgeJson[] = [];

  for (const edge of raw.edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      continue;
    }

    const from = edge.from.trim();
    const to = edge.to.trim();

    if (!from || !to || from === to) {
      continue;
    }

    if (!nodesById.has(from) || !nodesById.has(to)) {
      continue;
    }

    const key = `${from}->${to}`;
    if (uniqueEdgeKeys.has(key)) {
      continue;
    }

    uniqueEdgeKeys.add(key);
    edges.push({ from, to });
  }

  return {
    nodes: Array.from(nodesById.values()),
    edges,
  };
}

function buildAdjacency(graph: LogicalGraph) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of graph.edges) {
    incoming.get(edge.to)!.push(edge.from);
    outgoing.get(edge.from)!.push(edge.to);
  }

  return { incoming, outgoing };
}

function computeNodeDepths(graph: LogicalGraph): Map<string, number> {
  const { incoming, outgoing } = buildAdjacency(graph);
  const indegree = new Map<string, number>();

  for (const node of graph.nodes) {
    indegree.set(node.id, incoming.get(node.id)!.length);
  }

  const queue: string[] = graph.nodes
    .filter((n) => indegree.get(n.id) === 0)
    .map((n) => n.id);

  const depth = new Map<string, number>();
  for (const node of graph.nodes) depth.set(node.id, 0);

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);

    for (const child of outgoing.get(current) ?? []) {
      const nextDepth = (depth.get(current) ?? 0) + 1;
      if (nextDepth > (depth.get(child) ?? 0)) {
        depth.set(child, nextDepth);
      }

      indegree.set(child, (indegree.get(child) ?? 1) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
      }
    }
  }

  // Handle cycles/disconnected components by doing shortest-path BFS from a chosen local root.
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;

    depth.set(node.id, 0);
    const localQueue = [node.id];
    const seenLocal = new Set<string>([node.id]);

    while (localQueue.length > 0) {
      const current = localQueue.shift()!;
      visited.add(current);

      for (const child of outgoing.get(current) ?? []) {
        if (!seenLocal.has(child)) {
          seenLocal.add(child);
          const candidateDepth = (depth.get(current) ?? 0) + 1;
          if (candidateDepth > (depth.get(child) ?? 0)) {
            depth.set(child, candidateDepth);
          }
          localQueue.push(child);
        }
      }
    }
  }

  return depth;
}

function pickPrimaryParents(
  graph: LogicalGraph,
  depth: Map<string, number>,
): Map<string, string | null> {
  const { incoming } = buildAdjacency(graph);
  const parentOf = new Map<string, string | null>();

  for (const node of graph.nodes) {
    const parents = incoming.get(node.id) ?? [];

    if (parents.length === 0) {
      parentOf.set(node.id, null);
      continue;
    }

    // Prefer the deepest parent still above the node layer.
    const nodeDepth = depth.get(node.id) ?? 0;

    const ranked = [...parents].sort((a, b) => {
      const da = depth.get(a) ?? 0;
      const db = depth.get(b) ?? 0;

      const aValid = da < nodeDepth ? 1 : 0;
      const bValid = db < nodeDepth ? 1 : 0;
      if (aValid !== bValid) return bValid - aValid;

      if (da !== db) return db - da;
      return a.localeCompare(b);
    });

    parentOf.set(node.id, ranked[0] ?? null);
  }

  return parentOf;
}

function createLayoutConfig(graph: LogicalGraph, maxDepth: number): LayoutConfig {
  const nodeCount = graph.nodes.length;
  const depthSpan = Math.max(1, maxDepth + 1);

  return {
    canvasPaddingX: 120,
    canvasPaddingY: 90,
    minSiblingGap: clamp(130 - nodeCount * 1.4, 56, 120),
    componentGap: clamp(320 - nodeCount * 1.1, 180, 300),
    layerGap: clamp(230 - depthSpan * 8, 130, 220),
    rectangleWidth: clamp(190 + Math.floor(nodeCount / 16) * 8, 190, 240),
    rectangleHeight: 72,
    circleDiameter: 84,
  };
}

function createInitialLayoutNodes(
  graph: LogicalGraph,
  depth: Map<string, number>,
  parentOf: Map<string, string | null>,
  config: LayoutConfig,
): Map<string, LayoutNode> {
  const layoutNodes = new Map<string, LayoutNode>();

  const estimateCircleDiameter = (label: string): number => {
    const words = label.trim().split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((max, w) => Math.max(max, w.length), 0);
    const totalChars = label.replace(/\s+/g, "").length;

    // Grow circles for longer labels while keeping an upper bound for layout stability.
    const byLongestWord = config.circleDiameter + Math.max(0, longestWord - 6) * 7;
    const byTotalChars = config.circleDiameter + Math.max(0, totalChars - 10) * 3;
    return clamp(Math.max(byLongestWord, byTotalChars), config.circleDiameter, 156);
  };

  for (const node of graph.nodes) {
    const width =
      node.shape === "circle"
        ? estimateCircleDiameter(node.label)
        : config.rectangleWidth;
    const height =
      node.shape === "circle" ? width : config.rectangleHeight;

    layoutNodes.set(node.id, {
      id: node.id,
      label: node.label,
      shape: node.shape,
      width,
      height,
      depth: depth.get(node.id) ?? 0,
      x: 0,
      y: 0,
      children: [],
      parentId: parentOf.get(node.id) ?? null,
    });
  }

  for (const node of layoutNodes.values()) {
    if (node.parentId && layoutNodes.has(node.parentId)) {
      layoutNodes.get(node.parentId)!.children.push(node.id);
    }
  }

  // Stable ordering keeps sibling groups predictable.
  for (const node of layoutNodes.values()) {
    node.children.sort((a, b) => {
      const na = layoutNodes.get(a)!;
      const nb = layoutNodes.get(b)!;

      if (na.depth !== nb.depth) return na.depth - nb.depth;
      return na.label.localeCompare(nb.label);
    });
  }

  return layoutNodes;
}

function placeForest(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
): { minDepth: number; maxDepth: number } {
  const roots = Array.from(layoutNodes.values())
    .filter((n) => !n.parentId || !layoutNodes.has(n.parentId))
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.label.localeCompare(b.label);
    });

  const subtreeWidthMemo = new Map<string, number>();

  const computeSubtreeWidth = (nodeId: string): number => {
    if (subtreeWidthMemo.has(nodeId)) return subtreeWidthMemo.get(nodeId)!;

    const node = layoutNodes.get(nodeId)!;

    if (node.children.length === 0) {
      subtreeWidthMemo.set(nodeId, node.width);
      return node.width;
    }

    let childrenWidth = 0;

    node.children.forEach((childId, index) => {
      childrenWidth += computeSubtreeWidth(childId);
      if (index < node.children.length - 1) {
        childrenWidth += config.minSiblingGap;
      }
    });

    const width = Math.max(node.width, childrenWidth);
    subtreeWidthMemo.set(nodeId, width);
    return width;
  };

  const placeNode = (nodeId: string, left: number): number => {
    const node = layoutNodes.get(nodeId)!;
    const subtreeWidth = computeSubtreeWidth(nodeId);

    if (node.children.length === 0) {
      node.x = left + subtreeWidth / 2;
      return left + subtreeWidth;
    }

    let cursor = left + (subtreeWidth - node.children.reduce((sum, childId) => sum + computeSubtreeWidth(childId), 0) - config.minSiblingGap * (node.children.length - 1)) / 2;

    for (let i = 0; i < node.children.length; i += 1) {
      const childId = node.children[i];
      const childWidth = computeSubtreeWidth(childId);
      placeNode(childId, cursor);
      cursor += childWidth;
      if (i < node.children.length - 1) {
        cursor += config.minSiblingGap;
      }
    }

    const firstChild = layoutNodes.get(node.children[0])!;
    const lastChild = layoutNodes.get(node.children[node.children.length - 1])!;
    node.x = (firstChild.x + lastChild.x) / 2;

    return left + subtreeWidth;
  };

  let leftCursor = 0;

  for (const root of roots) {
    const rootWidth = computeSubtreeWidth(root.id);
    placeNode(root.id, leftCursor);
    leftCursor += rootWidth + config.componentGap;
  }

  // Resolve per-layer overlaps while preserving relative order.
  const byDepth = new Map<number, LayoutNode[]>();
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;

  for (const node of layoutNodes.values()) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth)!.push(node);
    minDepth = Math.min(minDepth, node.depth);
    maxDepth = Math.max(maxDepth, node.depth);
  }

  for (const nodes of byDepth.values()) {
    nodes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i += 1) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const minX = prev.x + prev.width / 2 + config.minSiblingGap + curr.width / 2;
      if (curr.x < minX) {
        curr.x = minX;
      }
    }
  }

  // Re-center parents over children after collision push.
  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => b - a);
  for (const depth of sortedDepths) {
    const nodes = byDepth.get(depth) ?? [];

    for (const node of nodes) {
      if (node.children.length === 0) continue;

      const children = node.children
        .map((id) => layoutNodes.get(id))
        .filter(Boolean) as LayoutNode[];

      if (children.length === 0) continue;

      const targetX = (children[0].x + children[children.length - 1].x) / 2;
      node.x = targetX;
    }
  }

  return { minDepth, maxDepth };
}

function assignY(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
  minDepth: number,
  maxDepth: number,
) {
  const maxHeightByDepth = new Map<number, number>();

  for (let d = minDepth; d <= maxDepth; d += 1) {
    maxHeightByDepth.set(d, 0);
  }

  for (const node of layoutNodes.values()) {
    const current = maxHeightByDepth.get(node.depth) ?? 0;
    maxHeightByDepth.set(node.depth, Math.max(current, node.height));
  }

  const topByDepth = new Map<number, number>();
  let cursorY = config.canvasPaddingY;

  for (let d = minDepth; d <= maxDepth; d += 1) {
    topByDepth.set(d, cursorY);
    cursorY += (maxHeightByDepth.get(d) ?? 0) + config.layerGap;
  }

  for (const node of layoutNodes.values()) {
    const layerTop = topByDepth.get(node.depth) ?? config.canvasPaddingY;
    const layerHeight = maxHeightByDepth.get(node.depth) ?? node.height;
    node.y = layerTop + (layerHeight - node.height) / 2;
  }
}

function normalizeLayout(layoutNodes: Map<string, LayoutNode>, config: LayoutConfig) {
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;

  for (const node of layoutNodes.values()) {
    minLeft = Math.min(minLeft, node.x - node.width / 2);
    minTop = Math.min(minTop, node.y);
  }

  const shiftX = config.canvasPaddingX - minLeft;
  const shiftY = config.canvasPaddingY - minTop;

  for (const node of layoutNodes.values()) {
    node.x += shiftX;
    node.y += shiftY;
  }
}

function chooseHandles(source: LayoutNode, target: LayoutNode): { from: Handle; to: Handle } {
  if (source.depth < target.depth) return { from: "bottom", to: "top" };
  if (source.depth > target.depth) return { from: "top", to: "bottom" };
  if (source.x <= target.x) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
}

function getHandlePoint(node: LayoutNode, handle: Handle): { x: number; y: number } {
  const left = node.x - node.width / 2;
  const right = node.x + node.width / 2;
  const top = node.y;
  const bottom = node.y + node.height;

  switch (handle) {
    case "top":
      return { x: node.x, y: top };
    case "bottom":
      return { x: node.x, y: bottom };
    case "left":
      return { x: left, y: top + node.height / 2 };
    case "right":
      return { x: right, y: top + node.height / 2 };
  }
}

function compressOrthogonalPoints(
  points: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  const deduped: { x: number; y: number }[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.x !== point.x || prev.y !== point.y) {
      deduped.push(point);
    }
  }

  if (deduped.length <= 2) return deduped;

  const compacted = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = compacted[compacted.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];

    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) {
      compacted.push(b);
    }
  }
  compacted.push(deduped[deduped.length - 1]);

  return compacted;
}

function routeEdgePoints(
  source: LayoutNode,
  target: LayoutNode,
  fromHandle: Handle,
  toHandle: Handle,
  laneOffset: number,
): { x: number; y: number }[] {
  const start = getHandlePoint(source, fromHandle);
  const end = getHandlePoint(target, toHandle);

  if (fromHandle === "bottom" && toHandle === "top") {
    const laneY = Math.round((start.y + end.y) / 2 + laneOffset);
    return compressOrthogonalPoints([
      start,
      { x: start.x, y: laneY },
      { x: end.x, y: laneY },
      end,
    ]);
  }

  if (fromHandle === "top" && toHandle === "bottom") {
    const laneY = Math.round((start.y + end.y) / 2 - laneOffset);
    return compressOrthogonalPoints([
      start,
      { x: start.x, y: laneY },
      { x: end.x, y: laneY },
      end,
    ]);
  }

  if ((fromHandle === "right" && toHandle === "left") || (fromHandle === "left" && toHandle === "right")) {
    const laneX = Math.round((start.x + end.x) / 2 + laneOffset);
    return compressOrthogonalPoints([
      start,
      { x: laneX, y: start.y },
      { x: laneX, y: end.y },
      end,
    ]);
  }

  // Fallback route for unusual port combinations.
  return compressOrthogonalPoints([
    start,
    { x: start.x, y: end.y },
    end,
  ]);
}

function mapNodeToElement(node: LayoutNode, index: number): CanvasElement {
  const id = generateShortId(index);

  if (node.shape === "circle") {
    const radius = node.width / 2;
    const centerX = node.x;
    const centerY = node.y + node.height / 2;

    return {
      id,
      type: "circle",
      label: node.label,
      points: [
        { x: centerX, y: centerY },
        { x: centerX + radius, y: centerY },
      ],
      fill: "#fef3c7",
      color: "#1e293b",
      strokeWidth: 2,
    };
  }

  return {
    id,
    type: "rectangle",
    label: node.label,
    points: [
      { x: node.x - node.width / 2, y: node.y },
      { x: node.x + node.width / 2, y: node.y + node.height },
    ],
    fill: "#dbeafe",
    color: "#1e293b",
    strokeWidth: 2,
  };
}

function buildElements(graph: LogicalGraph): CanvasElement[] {
  if (graph.nodes.length === 0) return [];

  const depth = computeNodeDepths(graph);
  const maxDepth = Math.max(...Array.from(depth.values()));
  const parentOf = pickPrimaryParents(graph, depth);
  const config = createLayoutConfig(graph, maxDepth);

  const layoutNodes = createInitialLayoutNodes(graph, depth, parentOf, config);
  const { minDepth, maxDepth: layoutMaxDepth } = placeForest(layoutNodes, config);

  assignY(layoutNodes, config, minDepth, layoutMaxDepth);
  normalizeLayout(layoutNodes, config);

  const elements: CanvasElement[] = [];
  const nodeCanvasByLogicalId = new Map<string, CanvasElement>();

  let index = 0;
  for (const node of graph.nodes) {
    const layoutNode = layoutNodes.get(node.id)!;
    const element = mapNodeToElement(layoutNode, index++);
    elements.push(element);
    nodeCanvasByLogicalId.set(node.id, element);
  }

  const edgeFanout = new Map<string, number>();

  for (const edge of graph.edges) {
    const sourceLayout = layoutNodes.get(edge.from);
    const targetLayout = layoutNodes.get(edge.to);
    const sourceElement = nodeCanvasByLogicalId.get(edge.from);
    const targetElement = nodeCanvasByLogicalId.get(edge.to);

    if (!sourceLayout || !targetLayout || !sourceElement || !targetElement) {
      continue;
    }

    const handles = chooseHandles(sourceLayout, targetLayout);
    // Small lane offset prevents perfect overlap for parallel edges.
    const fanKey = `${edge.from}:${handles.from}`;
    const fanIndex = edgeFanout.get(fanKey) ?? 0;
    edgeFanout.set(fanKey, fanIndex + 1);

    const laneOffset = fanIndex * 12;
    const points = routeEdgePoints(
      sourceLayout,
      targetLayout,
      handles.from,
      handles.to,
      laneOffset,
    );

    elements.push({
      id: generateShortId(index++),
      type: "arrow",
      points,
      color: "#64748b",
      strokeWidth: 2,
      startConnection: {
        elementId: sourceElement.id,
        handle: handles.from,
      },
      endConnection: {
        elementId: targetElement.id,
        handle: handles.to,
      },
    });
  }

  return elements;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate a logical architecture graph for: ${prompt}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("Invalid JSON from AI");
    }

    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as DiagramJson;

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error("Invalid nodes/edges format");
    }

    const logicalGraph = sanitizeGraph(parsed);
    const elements = buildElements(logicalGraph);

    return NextResponse.json({ elements });
  } catch (error) {
    console.error("generate-diagram error:", error);
    return NextResponse.json(
      { error: "Failed to generate diagram." },
      { status: 500 },
    );
  }
}
