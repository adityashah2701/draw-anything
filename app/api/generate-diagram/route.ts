import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/**
 * Separation of concerns:
 * AI: emits only logical graph (ids, labels, node types, edges)
 * Layout engine: computes visual positions + route handles
 * Renderer mapping: converts positioned nodes + edges into canvas elements
 */
const SYSTEM_PROMPT = `
You are an expert flowchart architect.
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
- Node type must be "rectangle", "circle", or "diamond".
- Use "diamond" ONLY for decisions/branching questions.
- Use "circle" for start/end/database-style terminals.
- Do not emit any visual coordinates.

Node format:
{
  "id": "string",
  "label": "string",
  "type": "rectangle" | "circle" | "diamond"
}

Edge format:
{
  "from": "node_id",
  "to": "node_id",
  "bidirectional"?: boolean,
  "dashed"?: boolean
}

Use "bidirectional": true when the relationship is explicitly two-way.
`;

type ShapeType = "rectangle" | "circle" | "diamond";
type Handle = "top" | "right" | "bottom" | "left";

interface NodeJson {
  id: string;
  label: string;
  type?: ShapeType;
}

interface EdgeJson {
  from: string;
  to: string;
  bidirectional?: boolean;
  dashed?: boolean;
}

interface DiagramJson {
  nodes: NodeJson[];
  edges: EdgeJson[];
}

interface LogicalNode {
  id: string;
  label: string;
  shape: ShapeType;
}

interface LogicalEdge {
  from: string;
  to: string;
  bidirectional?: boolean;
  dashed?: boolean;
}

interface LogicalGraph {
  nodes: LogicalNode[];
  edges: LogicalEdge[];
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
  diamondSize: number;
  decisionSplitGap: number;
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
  parentId: string | null;
  children: string[];
  incomingCount: number;
  outgoingCount: number;
  isDecision: boolean;
  isMerge: boolean;
}

interface NodeVisualStyle {
  fill: string;
  color: string;
}

type CanvasElement = {
  id: string;
  type:
    | "rectangle"
    | "circle"
    | "diamond"
    | "arrow"
    | "arrow-bidirectional";
  label?: string;
  points: { x: number; y: number }[];
  fill?: string;
  color: string;
  strokeWidth: number;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  routingMode?: "straight" | "orthogonal";
  routePreference?: "vh" | "hv";
  isManuallyRouted?: boolean;
  startConnection?: { elementId: string; handle: string };
  endConnection?: { elementId: string; handle: string };
};

function generateShortId(index: number) {
  return `ai_${Date.now()}_${index}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toShapeType(node: NodeJson): ShapeType {
  if (node.type === "diamond") return "diamond";
  if (node.type === "circle") return "circle";
  if (node.type === "rectangle") return "rectangle";

  const label = node.label.toLowerCase();
  if (/\?|decision|if|approved|valid|success|fail|eligible/.test(label)) {
    return "diamond";
  }
  if (
    /(db|database|start|end|terminal|cache|redis|postgres|mysql)/.test(label)
  ) {
    return "circle";
  }
  return "rectangle";
}

function sanitizeGraph(raw: DiagramJson): LogicalGraph {
  const nodesById = new Map<string, LogicalNode>();

  for (const node of raw.nodes ?? []) {
    if (
      !node ||
      typeof node.id !== "string" ||
      typeof node.label !== "string"
    ) {
      continue;
    }

    const id = node.id.trim();
    const label = node.label.trim();
    if (!id || !label || nodesById.has(id)) continue;

    nodesById.set(id, {
      id,
      label: label.slice(0, 48),
      shape: toShapeType(node),
    });
  }

  const uniqueEdges = new Set<string>();
  const edges: LogicalEdge[] = [];

  for (const edge of raw.edges ?? []) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      continue;
    }
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to || from === to) continue;
    if (!nodesById.has(from) || !nodesById.has(to)) continue;

    const key = `${from}->${to}`;
    if (uniqueEdges.has(key)) continue;
    uniqueEdges.add(key);
    edges.push({
      from,
      to,
      bidirectional: Boolean(edge.bidirectional),
      dashed: Boolean(edge.dashed),
    });
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
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  return { incoming, outgoing };
}

function computeNodeDepths(graph: LogicalGraph): Map<string, number> {
  const { incoming, outgoing } = buildAdjacency(graph);
  const indegree = new Map<string, number>();
  const depth = new Map<string, number>();

  for (const node of graph.nodes) {
    indegree.set(node.id, incoming.get(node.id)?.length ?? 0);
    depth.set(node.id, 0);
  }

  const queue = graph.nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);

    for (const child of outgoing.get(current) ?? []) {
      depth.set(
        child,
        Math.max(depth.get(child) ?? 0, (depth.get(current) ?? 0) + 1),
      );
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) === 0) queue.push(child);
    }
  }

  // Fallback for cycles/unvisited components.
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const localQueue = [node.id];
    const seen = new Set<string>([node.id]);
    depth.set(node.id, Math.max(0, depth.get(node.id) ?? 0));

    while (localQueue.length > 0) {
      const current = localQueue.shift()!;
      visited.add(current);
      for (const child of outgoing.get(current) ?? []) {
        const nextDepth = Math.max(
          depth.get(child) ?? 0,
          (depth.get(current) ?? 0) + 1,
        );
        depth.set(child, nextDepth);
        if (!seen.has(child)) {
          seen.add(child);
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
  incoming: Map<string, string[]>,
): Map<string, string | null> {
  const parentOf = new Map<string, string | null>();

  for (const node of graph.nodes) {
    const parents = incoming.get(node.id) ?? [];
    if (parents.length === 0) {
      parentOf.set(node.id, null);
      continue;
    }

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

    const bestParent = ranked[0];
    const bestParentDepth = depth.get(bestParent) ?? 0;
    if (bestParentDepth >= nodeDepth) {
      parentOf.set(node.id, null);
    } else {
      parentOf.set(node.id, bestParent);
    }
  }

  return parentOf;
}

function createLayoutConfig(
  graph: LogicalGraph,
  maxDepth: number,
): LayoutConfig {
  const nodeCount = graph.nodes.length;
  const depthSpan = Math.max(1, maxDepth + 1);

  return {
    canvasPaddingX: 130,
    canvasPaddingY: 96,
    minSiblingGap: clamp(150 - nodeCount * 1.2, 72, 132),
    componentGap: clamp(360 - nodeCount * 1.3, 220, 340),
    // Tighter vertical rhythm so AI flowchart arrows are shorter and cleaner.
    layerGap: clamp(136 - depthSpan * 3, 72, 120),
    rectangleWidth: clamp(200 + Math.floor(nodeCount / 18) * 8, 200, 252),
    rectangleHeight: 76,
    circleDiameter: 92,
    diamondSize: 128,
    decisionSplitGap: clamp(220 - nodeCount * 0.8, 140, 220),
  };
}

function estimateCircleDiameter(label: string, base: number) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((acc, w) => Math.max(acc, w.length), 0);
  const totalChars = label.replace(/\s+/g, "").length;
  const byLongest = base + Math.max(0, longestWord - 6) * 7;
  const byTotal = base + Math.max(0, totalChars - 10) * 3;
  return clamp(Math.max(byLongest, byTotal), base, 164);
}

function estimateDiamondSize(label: string, base: number) {
  const total = label.replace(/\s+/g, "").length;
  return clamp(base + Math.max(0, total - 8) * 4, 110, 172);
}

function createInitialLayoutNodes(
  graph: LogicalGraph,
  depth: Map<string, number>,
  parentOf: Map<string, string | null>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
  config: LayoutConfig,
) {
  const layoutNodes = new Map<string, LayoutNode>();

  for (const node of graph.nodes) {
    let width = config.rectangleWidth;
    let height = config.rectangleHeight;

    if (node.shape === "circle") {
      width = estimateCircleDiameter(node.label, config.circleDiameter);
      height = width;
    } else if (node.shape === "diamond") {
      width = estimateDiamondSize(node.label, config.diamondSize);
      height = width;
    }

    const incomingCount = incoming.get(node.id)?.length ?? 0;
    const outgoingCount = outgoing.get(node.id)?.length ?? 0;

    layoutNodes.set(node.id, {
      id: node.id,
      label: node.label,
      shape: node.shape,
      width,
      height,
      depth: depth.get(node.id) ?? 0,
      x: 0,
      y: 0,
      parentId: parentOf.get(node.id) ?? null,
      children: [],
      incomingCount,
      outgoingCount,
      isDecision: node.shape === "diamond",
      isMerge: incomingCount > 1,
    });
  }

  for (const node of layoutNodes.values()) {
    if (node.parentId && layoutNodes.has(node.parentId)) {
      layoutNodes.get(node.parentId)!.children.push(node.id);
    }
  }

  return layoutNodes;
}

function branchHint(label: string): -1 | 0 | 1 {
  const txt = label.toLowerCase();
  if (/\b(no|false|fail|reject|deny|invalid|error)\b/.test(txt)) return -1;
  if (/\b(yes|true|pass|approve|allow|valid|success)\b/.test(txt)) return 1;
  return 0;
}

function orderChildrenForFlow(
  parent: LayoutNode,
  childIds: string[],
  layoutNodes: Map<string, LayoutNode>,
) {
  const sorted = [...childIds].sort((a, b) => {
    const na = layoutNodes.get(a)!;
    const nb = layoutNodes.get(b)!;
    if (na.depth !== nb.depth) return na.depth - nb.depth;
    return na.label.localeCompare(nb.label);
  });

  if (parent.isDecision && sorted.length >= 2) {
    const [first, second, ...rest] = sorted;
    const hintFirst = branchHint(layoutNodes.get(first)!.label);
    const hintSecond = branchHint(layoutNodes.get(second)!.label);

    let left = first;
    let right = second;

    if (hintFirst === 1 || hintSecond === -1) {
      left = second;
      right = first;
    } else if (hintFirst === 0 && hintSecond === 0) {
      if (
        layoutNodes
          .get(first)!
          .label.localeCompare(layoutNodes.get(second)!.label) > 0
      ) {
        left = second;
        right = first;
      }
    }

    return [left, right, ...rest];
  }

  return sorted;
}

function shiftSubtree(
  layoutNodes: Map<string, LayoutNode>,
  nodeId: string,
  deltaX: number,
) {
  if (deltaX === 0) return;
  const queue = [nodeId];
  const seen = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = layoutNodes.get(currentId);
    if (!node) continue;
    node.x += deltaX;
    for (const childId of node.children) {
      if (!seen.has(childId)) {
        seen.add(childId);
        queue.push(childId);
      }
    }
  }
}

function recenterParents(layoutNodes: Map<string, LayoutNode>) {
  const depths = Array.from(
    new Set(Array.from(layoutNodes.values()).map((n) => n.depth)),
  ).sort((a, b) => b - a);

  for (const depth of depths) {
    const nodes = Array.from(layoutNodes.values()).filter(
      (n) => n.depth === depth,
    );
    for (const node of nodes) {
      if (node.children.length === 0) continue;
      const children = node.children
        .map((id) => layoutNodes.get(id))
        .filter(Boolean) as LayoutNode[];
      if (children.length === 0) continue;
      const left = children[0].x;
      const right = children[children.length - 1].x;
      node.x = (left + right) / 2;
    }
  }
}

function placeForest(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
  for (const parent of layoutNodes.values()) {
    parent.children = orderChildrenForFlow(
      parent,
      parent.children,
      layoutNodes,
    );
  }

  const subtreeWidthMemo = new Map<string, number>();

  const computeSubtreeWidth = (
    nodeId: string,
    stack = new Set<string>(),
  ): number => {
    if (subtreeWidthMemo.has(nodeId)) return subtreeWidthMemo.get(nodeId)!;
    if (stack.has(nodeId)) return layoutNodes.get(nodeId)?.width ?? 120;
    stack.add(nodeId);

    const node = layoutNodes.get(nodeId)!;
    if (node.children.length === 0) {
      subtreeWidthMemo.set(nodeId, node.width);
      stack.delete(nodeId);
      return node.width;
    }

    const childWidths = node.children.map((id) =>
      computeSubtreeWidth(id, stack),
    );
    let childrenWidth =
      childWidths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, childWidths.length - 1) * config.minSiblingGap;

    if (node.isDecision && childWidths.length >= 2) {
      childrenWidth = Math.max(
        childrenWidth,
        childWidths[0] + childWidths[1] + config.decisionSplitGap,
      );
    }

    const width = Math.max(node.width, childrenWidth);
    subtreeWidthMemo.set(nodeId, width);
    stack.delete(nodeId);
    return width;
  };

  const placeNode = (nodeId: string, left: number): number => {
    const node = layoutNodes.get(nodeId)!;
    const subtreeWidth = computeSubtreeWidth(nodeId);

    if (node.children.length === 0) {
      node.x = left + subtreeWidth / 2;
      return left + subtreeWidth;
    }

    const childWidths = node.children.map((id) => computeSubtreeWidth(id));
    const gapCount = Math.max(0, node.children.length - 1);
    const requiredWidth =
      childWidths.reduce((acc, w) => acc + w, 0) +
      gapCount * config.minSiblingGap;
    let start = left + (subtreeWidth - requiredWidth) / 2;

    for (let i = 0; i < node.children.length; i += 1) {
      const childId = node.children[i];
      placeNode(childId, start);
      start +=
        childWidths[i] +
        (i < node.children.length - 1 ? config.minSiblingGap : 0);
    }

    const first = layoutNodes.get(node.children[0])!;
    const last = layoutNodes.get(node.children[node.children.length - 1])!;
    node.x = (first.x + last.x) / 2;
    return left + subtreeWidth;
  };

  const roots = Array.from(layoutNodes.values())
    .filter((n) => !n.parentId || !layoutNodes.has(n.parentId))
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.label.localeCompare(b.label);
    });

  let cursorX = 0;
  for (const root of roots) {
    const width = computeSubtreeWidth(root.id);
    placeNode(root.id, cursorX);
    cursorX += width + config.componentGap;
  }
}

function findNearestCommonTarget(
  leftRoot: string,
  rightRoot: string,
  outgoing: Map<string, string[]>,
  depth: Map<string, number>,
) {
  const bfs = (start: string) => {
    const dist = new Map<string, number>();
    const queue = [start];
    dist.set(start, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = dist.get(current)!;
      for (const next of outgoing.get(current) ?? []) {
        if (!dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    return dist;
  };

  const leftDist = bfs(leftRoot);
  const rightDist = bfs(rightRoot);

  let best: { id: string; score: number; depth: number } | null = null;

  for (const [id, ld] of leftDist) {
    const rd = rightDist.get(id);
    if (rd === undefined) continue;
    if (id === leftRoot || id === rightRoot) continue;
    const d = depth.get(id) ?? 0;
    const score = ld + rd;
    if (!best || d < best.depth || (d === best.depth && score < best.score)) {
      best = { id, score, depth: d };
    }
  }

  return best?.id ?? null;
}

function applyDecisionAndMergeAlignment(
  layoutNodes: Map<string, LayoutNode>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  depth: Map<string, number>,
  config: LayoutConfig,
) {
  // 1) Split symmetry for decision nodes.
  for (const node of layoutNodes.values()) {
    if (!node.isDecision || node.children.length < 2) continue;
    const leftChild = layoutNodes.get(node.children[0]);
    const rightChild = layoutNodes.get(node.children[1]);
    if (!leftChild || !rightChild) continue;

    const desiredHalfSpan = Math.max(
      config.decisionSplitGap / 2,
      Math.abs(rightChild.x - leftChild.x) / 2,
    );

    const targetLeft = node.x - desiredHalfSpan;
    const targetRight = node.x + desiredHalfSpan;

    shiftSubtree(layoutNodes, leftChild.id, targetLeft - leftChild.x);
    shiftSubtree(layoutNodes, rightChild.id, targetRight - rightChild.x);
  }

  // 2) Decision-aware merge alignment: center merge nodes under split branches.
  for (const decision of layoutNodes.values()) {
    if (!decision.isDecision || decision.children.length < 2) continue;
    const [leftId, rightId] = decision.children;
    const mergeCandidateId = findNearestCommonTarget(
      leftId,
      rightId,
      outgoing,
      depth,
    );
    if (!mergeCandidateId) continue;

    const mergeNode = layoutNodes.get(mergeCandidateId);
    if (!mergeNode || !mergeNode.isMerge) continue;
    shiftSubtree(layoutNodes, mergeNode.id, decision.x - mergeNode.x);
  }

  // 3) Generic merge alignment for remaining multi-input nodes.
  for (const node of layoutNodes.values()) {
    if (!node.isMerge) continue;
    const parents = incoming.get(node.id) ?? [];
    if (parents.length < 2) continue;

    const parentXs = parents
      .map((id) => layoutNodes.get(id))
      .filter(Boolean)
      .map((p) => (p as LayoutNode).x)
      .sort((a, b) => a - b);
    if (parentXs.length < 2) continue;

    const targetX = (parentXs[0] + parentXs[parentXs.length - 1]) / 2;
    shiftSubtree(layoutNodes, node.id, targetX - node.x);
  }
}

function resolveHorizontalCollisions(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
  const byDepth = new Map<number, LayoutNode[]>();
  for (const node of layoutNodes.values()) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth)!.push(node);
  }

  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    const nodes = (byDepth.get(depth) ?? []).sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i += 1) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const minCenterDistance =
        prev.width / 2 + config.minSiblingGap + curr.width / 2;
      const requiredX = prev.x + minCenterDistance;
      if (curr.x < requiredX) {
        shiftSubtree(layoutNodes, curr.id, requiredX - curr.x);
      }
    }
  }
}

function assignY(layoutNodes: Map<string, LayoutNode>, config: LayoutConfig) {
  const depths = Array.from(
    new Set(Array.from(layoutNodes.values()).map((n) => n.depth)),
  ).sort((a, b) => a - b);

  const maxHeightByDepth = new Map<number, number>();
  for (const d of depths) maxHeightByDepth.set(d, 0);
  for (const node of layoutNodes.values()) {
    maxHeightByDepth.set(
      node.depth,
      Math.max(maxHeightByDepth.get(node.depth) ?? 0, node.height),
    );
  }

  const topByDepth = new Map<number, number>();
  let cursorY = config.canvasPaddingY;
  for (const depth of depths) {
    topByDepth.set(depth, cursorY);
    cursorY += (maxHeightByDepth.get(depth) ?? 0) + config.layerGap;
  }

  for (const node of layoutNodes.values()) {
    const layerTop = topByDepth.get(node.depth) ?? config.canvasPaddingY;
    const layerHeight = maxHeightByDepth.get(node.depth) ?? node.height;
    node.y = layerTop + (layerHeight - node.height) / 2;
  }
}

function normalizeLayout(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
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

function getHandlePoint(node: LayoutNode, handle: Handle) {
  const left = node.x - node.width / 2;
  const right = node.x + node.width / 2;
  const top = node.y;
  const bottom = node.y + node.height;

  switch (handle) {
    case "top":
      return { x: node.x, y: top };
    case "right":
      return { x: right, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x, y: bottom };
    case "left":
      return { x: left, y: node.y + node.height / 2 };
  }
}

function directionForHandle(handle: Handle) {
  switch (handle) {
    case "top":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: 1, dy: 0 };
    case "bottom":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
  }
}

function compressOrthogonalPoints(points: { x: number; y: number }[]) {
  if (points.length <= 2) return points;

  const deduped: { x: number; y: number }[] = [];
  for (const p of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) deduped.push(p);
  }

  if (deduped.length <= 2) return deduped;

  const compacted = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = compacted[compacted.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const collinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) compacted.push(b);
  }
  compacted.push(deduped[deduped.length - 1]);

  return compacted;
}

function chooseHandles(
  source: LayoutNode,
  target: LayoutNode,
): { from: Handle; to: Handle } {
  // Decision split: enforce semantic left(No) and right(Yes) branches.
  if (
    source.isDecision &&
    source.outgoingCount >= 2 &&
    target.depth > source.depth
  ) {
    if (target.x < source.x) return { from: "left", to: "top" };
    return { from: "right", to: "top" };
  }

  // Merge: prefer clean top-entry convergence to keep flowchart readable.
  if (target.isMerge && source.depth < target.depth) {
    return { from: "bottom", to: "top" };
  }

  if (source.depth < target.depth) return { from: "bottom", to: "top" };
  if (source.depth > target.depth) return { from: "top", to: "bottom" };
  if (source.x <= target.x) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
}

function routeEdgePoints(
  source: LayoutNode,
  target: LayoutNode,
  fromHandle: Handle,
  toHandle: Handle,
  laneOffset: number,
) {
  const start = getHandlePoint(source, fromHandle);
  const end = getHandlePoint(target, toHandle);

  // Shorter orthogonal stubs reduce perceived arrow length/clutter.
  const stub = 10;
  const fromDir = directionForHandle(fromHandle);
  const toDir = directionForHandle(toHandle);

  const startStub = {
    x: start.x + fromDir.dx * stub,
    y: start.y + fromDir.dy * stub,
  };
  const endStub = {
    x: end.x - toDir.dx * stub,
    y: end.y - toDir.dy * stub,
  };

  const points: { x: number; y: number }[] = [start, startStub];

  if (startStub.x === endStub.x || startStub.y === endStub.y) {
    points.push(endStub);
  } else {
    const verticalPreferred =
      fromHandle === "top" ||
      fromHandle === "bottom" ||
      toHandle === "top" ||
      toHandle === "bottom";

    if (verticalPreferred) {
      const midY = Math.round((startStub.y + endStub.y) / 2 + laneOffset);
      points.push({ x: startStub.x, y: midY });
      points.push({ x: endStub.x, y: midY });
    } else {
      const midX = Math.round((startStub.x + endStub.x) / 2 + laneOffset);
      points.push({ x: midX, y: startStub.y });
      points.push({ x: midX, y: endStub.y });
    }
  }

  points.push(endStub, end);
  return compressOrthogonalPoints(points);
}

function mapNodeToElement(node: LayoutNode, index: number): CanvasElement {
  const style = getNodeVisualStyle(node);
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
      fill: style.fill,
      color: style.color,
      strokeWidth: 2,
    };
  }

  return {
    id,
    type: node.shape === "diamond" ? "diamond" : "rectangle",
    label: node.label,
    points: [
      { x: node.x - node.width / 2, y: node.y },
      { x: node.x + node.width / 2, y: node.y + node.height },
    ],
    fill: style.fill,
    color: style.color,
    strokeWidth: 2,
  };
}

function getNodeVisualStyle(node: LayoutNode): NodeVisualStyle {
  const label = node.label.toLowerCase();
  const stroke = "#1f2937";

  const palette = {
    service: "#dbeafe",
    gateway: "#ddd6fe",
    auth: "#f5d0fe",
    compute: "#e0f2fe",
    data: "#fde68a",
    storage: "#fed7aa",
    external: "#bfdbfe",
    queue: "#bae6fd",
    monitor: "#c7d2fe",
    decision: "#fecdd3",
    defaultRectA: "#dbeafe",
    defaultRectB: "#e0e7ff",
    defaultCircle: "#fde68a",
  };

  if (node.shape === "diamond")
    return { fill: palette.decision, color: stroke };
  if (node.shape === "circle") {
    if (/(db|database|cache|redis|mongo|postgres|mysql|storage)/.test(label)) {
      return { fill: palette.data, color: stroke };
    }
    if (/(queue|broker|kafka|stream|event)/.test(label)) {
      return { fill: palette.queue, color: stroke };
    }
    return { fill: palette.defaultCircle, color: stroke };
  }

  if (/(gateway|api gateway|ingress|proxy|edge)/.test(label)) {
    return { fill: palette.gateway, color: stroke };
  }
  if (/(auth|oauth|identity|jwt|clerk)/.test(label)) {
    return { fill: palette.auth, color: stroke };
  }
  if (/(cdn|external|third party|provider|stripe|twilio|s3)/.test(label)) {
    return { fill: palette.external, color: stroke };
  }
  if (/(worker|processor|lambda|function|compute)/.test(label)) {
    return { fill: palette.compute, color: stroke };
  }
  if (/(monitor|metrics|logging|observability)/.test(label)) {
    return { fill: palette.monitor, color: stroke };
  }
  if (/(store|storage|blob)/.test(label)) {
    return { fill: palette.storage, color: stroke };
  }
  if (/(service|backend|frontend|client|server)/.test(label)) {
    return { fill: palette.service, color: stroke };
  }

  return {
    fill: node.depth % 2 === 0 ? palette.defaultRectA : palette.defaultRectB,
    color: stroke,
  };
}

function staggerLaneOffset(index: number) {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2) * 12;
  return index % 2 === 1 ? magnitude : -magnitude;
}

function buildElements(graph: LogicalGraph): CanvasElement[] {
  if (graph.nodes.length === 0) return [];

  const { incoming, outgoing } = buildAdjacency(graph);
  const depth = computeNodeDepths(graph);
  const maxDepth = Math.max(...Array.from(depth.values(), (v) => v ?? 0), 0);
  const parentOf = pickPrimaryParents(graph, depth, incoming);
  const config = createLayoutConfig(graph, maxDepth);

  const layoutNodes = createInitialLayoutNodes(
    graph,
    depth,
    parentOf,
    incoming,
    outgoing,
    config,
  );

  placeForest(layoutNodes, config);
  applyDecisionAndMergeAlignment(
    layoutNodes,
    outgoing,
    incoming,
    depth,
    config,
  );
  recenterParents(layoutNodes);
  resolveHorizontalCollisions(layoutNodes, config);
  recenterParents(layoutNodes);
  assignY(layoutNodes, config);
  normalizeLayout(layoutNodes, config);

  const elements: CanvasElement[] = [];
  const nodeElementByLogicalId = new Map<string, CanvasElement>();

  let index = 0;
  for (const node of graph.nodes) {
    const layoutNode = layoutNodes.get(node.id);
    if (!layoutNode) continue;
    const element = mapNodeToElement(layoutNode, index++);
    elements.push(element);
    nodeElementByLogicalId.set(node.id, element);
  }

  const sourceFanout = new Map<string, number>();
  const targetFanin = new Map<string, number>();
  const edgesByKey = new Map<string, LogicalEdge>();
  const consumedDirectionalEdges = new Set<string>();

  for (const edge of graph.edges) {
    edgesByKey.set(`${edge.from}->${edge.to}`, edge);
  }

  for (const edge of graph.edges) {
    const forwardKey = `${edge.from}->${edge.to}`;
    if (consumedDirectionalEdges.has(forwardKey)) continue;

    const reverseKey = `${edge.to}->${edge.from}`;
    const reverseEdge = edgesByKey.get(reverseKey);
    const isBidirectional = Boolean(
      edge.bidirectional || reverseEdge?.bidirectional || reverseEdge,
    );
    const isDashed = Boolean(edge.dashed || reverseEdge?.dashed);

    consumedDirectionalEdges.add(forwardKey);
    if (isBidirectional) {
      consumedDirectionalEdges.add(reverseKey);
    }

    let renderFrom = edge.from;
    let renderTo = edge.to;

    const fromDepth = depth.get(renderFrom) ?? 0;
    const toDepth = depth.get(renderTo) ?? 0;
    const fromLayoutForDirection = layoutNodes.get(renderFrom);
    const toLayoutForDirection = layoutNodes.get(renderTo);
    if (
      isBidirectional &&
      fromLayoutForDirection &&
      toLayoutForDirection &&
      (fromDepth > toDepth ||
        (fromDepth === toDepth &&
          fromLayoutForDirection.x > toLayoutForDirection.x))
    ) {
      renderFrom = edge.to;
      renderTo = edge.from;
    }

    const sourceLayout = layoutNodes.get(renderFrom);
    const targetLayout = layoutNodes.get(renderTo);
    const sourceElement = nodeElementByLogicalId.get(renderFrom);
    const targetElement = nodeElementByLogicalId.get(renderTo);
    if (!sourceLayout || !targetLayout || !sourceElement || !targetElement)
      continue;

    const handles = chooseHandles(sourceLayout, targetLayout);
    const outKey = `${renderFrom}:${handles.from}`;
    const inKey = `${renderTo}:${handles.to}`;

    const outIndex = sourceFanout.get(outKey) ?? 0;
    const inIndex = targetFanin.get(inKey) ?? 0;
    sourceFanout.set(outKey, outIndex + 1);
    targetFanin.set(inKey, inIndex + 1);

    const laneOffset =
      staggerLaneOffset(outIndex) + Math.trunc(staggerLaneOffset(inIndex) / 2);
    const points = routeEdgePoints(
      sourceLayout,
      targetLayout,
      handles.from,
      handles.to,
      laneOffset,
    );

    elements.push({
      id: generateShortId(index++),
      type: isBidirectional ? "arrow-bidirectional" : "arrow",
      points,
      color: "#64748b",
      strokeWidth: 2,
      dashed: isDashed,
      arrowHeadStart: isBidirectional,
      arrowHeadEnd: true,
      routingMode: "orthogonal",
      routePreference:
        handles.from === "left" || handles.from === "right" ? "hv" : "vh",
      isManuallyRouted: false,
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
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Generate a logical architecture graph for: ${prompt}`,
        },
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

    const parsed = JSON.parse(
      cleaned.slice(jsonStart, jsonEnd + 1),
    ) as DiagramJson;
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
