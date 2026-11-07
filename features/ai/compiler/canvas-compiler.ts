import { estimateTextWidth } from "@/core/text/estimate";
import { placeEdgeLabels, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT } from "@/features/ai/layout/edge-labels";
import {
  FRAME_NEST_STEP,
  FRAME_TITLE_HEIGHT,
} from "@/features/ai/layout/frame-constants";
import { placeGrid } from "@/features/ai/layout/grid-placement";
import { placeLayered } from "@/features/ai/layout/layered-placement";
import { measureLayout } from "@/features/ai/layout/metrics";
import { type ConnectorStyle } from "@/features/ai/diagram-agent/profiles";
import { withDirection } from "@/features/ai/layout/direction";
import { verticalGapsByDepth } from "@/features/ai/layout/channels";
import { withOffsets, withPins, type NodeOffset, type NodePin } from "@/features/ai/layout/pins";
import type {
  Placement,
  PlacementEngine,
  PlacementInput,
} from "@/features/ai/layout/types";
import type {
  AIDiagramDocumentV1,
} from "@/features/ai/types";
import type {
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";

import {
  BASE_NODE_HEIGHT,
  createPositionedNode,
  kindColors,
  mindmapRoles,
  shapeOf,
  sizeDiagramNode,
  type PositionedNode,
} from "./node-factory";
import {
  buildGroupFrames,
  nestingDepths,
  usableGroups,
} from "./frame-builder";
import {
  buildEdgeElements,
  foreignKeyParent,
  type EdgeSides,
} from "./edge-builder";

// Re-export symbols for backward compatibility
export { kindColors, sizeDiagramNode };
export type { EdgeSides };

const LAYER_ORDER = ["external", "edge", "application", "data", "observability"];

/**
 * How nodes are put in rows. `layers`: an architecture's own tiers (edge, application, data...), which
 * is right when they are meaningful. `flow`: the longest path through the connections, as for every
 * other diagram type. A diagram written as code names no tiers, so nearly everything falls in
 * "application": one wide row of connected nodes with long, tangled connectors. Which of the two is
 * better is measured, not guessed (see `compileAIDiagramDetailed`).
 */
export type DepthMode = "layers" | "flow" | "stacked";

/**
 * Two groups that share a row get frames that partly overlap, and the compiler then drops one. So
 * when connections run from group A to group B (more than the other way) and B starts on a row A
 * still uses, B and everything below it move down past A. Moving a node down never breaks the
 * downward direction of its connections; nested and unrelated groups are left alone.
 */
const separateGroupRows = (
  document: AIDiagramDocumentV1,
  edges: Array<{ from: string; to: string }>,
  depth: Map<string, number>,
) => {
  const groups = document.groups.map((g) => ({ ids: new Set(g.nodeIds.filter((id) => depth.has(id))) })).filter((g) => g.ids.size >= 2);
  const nested = (a: Set<string>, b: Set<string>) => [...a].every((id) => b.has(id)) || [...b].every((id) => a.has(id));
  const rows = (g: Set<string>) => [...g].map((id) => depth.get(id)!);
  const between = (a: Set<string>, b: Set<string>) => edges.filter((e) => a.has(e.from) && b.has(e.to)).length;

  for (let round = 0; round < 12; round += 1) {
    let moved = false;
    for (const a of groups) {
      for (const b of groups) {
        if (a === b || [...a.ids].some((id) => b.ids.has(id)) || nested(a.ids, b.ids)) continue;
        if (between(a.ids, b.ids) <= between(b.ids, a.ids) || between(a.ids, b.ids) === 0) continue;
        const shift = Math.max(...rows(a.ids)) + 1 - Math.min(...rows(b.ids));
        if (shift <= 0) continue;
        // B, plus whatever hangs below it through downward connections (never A itself).
        const move = new Set(b.ids);
        for (let grew = true; grew; ) {
          grew = false;
          for (const e of edges) {
            if (move.has(e.from) && !move.has(e.to) && !a.ids.has(e.to) && depth.get(e.to)! > depth.get(e.from)!) {
              move.add(e.to);
              grew = true;
            }
          }
        }
        move.forEach((id) => depth.set(id, depth.get(id)! + shift));
        moved = true;
      }
    }
    if (!moved) break;
  }
};

const getDepths = (document: AIDiagramDocumentV1, mode: DepthMode = "layers") => {
  if (document.diagramType === "architecture" && mode === "layers") {
    return new Map(
      document.nodes.map((node) => [
        node.id,
        Math.max(0, LAYER_ORDER.indexOf(node.layer ?? "application")),
      ]),
    );
  }

  // Layers by longest path from the sources, after breaking cycles. A loop-back edge (a retry, a
  // feedback arrow) must not stop the nodes behind it from getting a layer, so depth-first search
  // finds the edges that point back up the current path and layering ignores them. For an acyclic
  // graph there are no such edges and this is the plain longest-path layering.
  const knownIds = new Set(document.nodes.map((node) => node.id));
  const edges = document.edges.filter((e) => knownIds.has(e.from) && knownIds.has(e.to) && e.from !== e.to);
  const out = new Map<string, Array<{ to: string; index: number }>>(document.nodes.map((n) => [n.id, []]));
  const indegree = new Map(document.nodes.map((n) => [n.id, 0]));
  edges.forEach((e, index) => {
    out.get(e.from)!.push({ to: e.to, index });
    indegree.set(e.to, indegree.get(e.to)! + 1);
  });

  const state = new Map<string, 0 | 1 | 2>(document.nodes.map((n) => [n.id, 0]));
  const backEdges = new Set<number>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const { to, index } of out.get(id)!) {
      if (state.get(to) === 1) backEdges.add(index);
      else if (state.get(to) === 0) visit(to);
    }
    state.set(id, 2);
  };
  // Sources first (in node order), then whatever is left (nodes only reachable through a cycle).
  // Starting from people/clients instead puts User at the top but, measured on a request/response
  // flow, makes connectors 41% longer and triples crossings, so it was tried and dropped.
  document.nodes.filter((n) => indegree.get(n.id) === 0).forEach((n) => state.get(n.id) === 0 && visit(n.id));
  document.nodes.forEach((n) => state.get(n.id) === 0 && visit(n.id));

  const remaining = new Map(document.nodes.map((n) => [n.id, 0]));
  edges.forEach((e, index) => {
    if (!backEdges.has(index)) remaining.set(e.to, remaining.get(e.to)! + 1);
  });
  const depth = new Map(document.nodes.map((node) => [node.id, 0]));
  const queue = document.nodes.filter((n) => remaining.get(n.id) === 0).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const { to, index } of out.get(id)!) {
      if (backEdges.has(index)) continue;
      depth.set(to, Math.max(depth.get(to)!, depth.get(id)! + 1));
      remaining.set(to, remaining.get(to)! - 1);
      if (remaining.get(to) === 0) queue.push(to);
    }
  }
  // A member with no connection (yet) would sit on the top row and stretch its group's frame over
  // every row in between: put it level with the group's first connected member instead.
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  document.groups.forEach((group) => {
    const mates = group.nodeIds.filter((id) => connected.has(id) && depth.has(id));
    if (mates.length === 0) return;
    const row = Math.min(...mates.map((id) => depth.get(id)!));
    group.nodeIds.forEach((id) => depth.has(id) && !connected.has(id) && depth.set(id, row));
  });
  if (mode === "stacked") separateGroupRows(document, edges, depth);
  return depth;
};

export interface CompileDiagnostics {
  /** Edge labels that could not be placed clear of nodes, other labels and each other. */
  collidingLabels: string[];
  /** Groups declared with a label and two or more members that were not drawn as a frame. */
  droppedGroups: string[];
  /** Nodes whose label needs more lines than a node may show; the renderer shrinks their text. */
  unfittedNodes: string[];
  /** Set when the layout engine threw and the plain grid was used instead; holds the error message. */
  layoutFallback?: string;
}

export interface CompileResult {
  elements: DrawingElement[];
  diagnostics: CompileDiagnostics;
}

/** Sizes, graph and gaps for a layout engine; everything an engine may use, nothing it must not. */
export const prepareDiagram = (
  document: AIDiagramDocumentV1,
  mode: DepthMode = "layers",
  /** Widen the rows that many connectors cross. Opt-in: a drawing being edited must not stretch when a connection is added. */
  channelGaps = false,
) => {
  const depthByNodeId = getDepths(document, mode);
  const density = document.styleHints.density;
  const groups = usableGroups(
    document,
    // sizes are not known yet; membership alone decides whether groups exist
    new Map(document.nodes.map((node) => [node.id, { node } as PositionedNode])),
  );
  const maxNesting = Math.max(0, ...nestingDepths(groups).map((g) => g.depth));
  const frameRoom = groups.length > 0 ? 40 + maxNesting * (FRAME_NEST_STEP + FRAME_TITLE_HEIGHT) : 0;
  const horizontalGap =
    (density === "compact" ? 52 : density === "spacious" ? 112 : 78) + frameRoom / 2;
  // Row pitch was 138 for 78px nodes: the gap between rows, not the pitch, is what stays constant.
  const verticalGap =
    (density === "compact" ? 112 : density === "spacious" ? 168 : 138) - BASE_NODE_HEIGHT + frameRoom;

  // Nodes ordered as before (column hint, then label) as the starting point.
  const ordered = [...document.nodes].sort((a, b) => {
    const ac = a.column ?? Number.MAX_SAFE_INTEGER;
    const bc = b.column ?? Number.MAX_SAFE_INTEGER;
    return ac - bc || a.label.localeCompare(b.label);
  });

  // The outermost group a node belongs to keeps its members side by side.
  const clusterOf = new Map<string, string>();
  groups.forEach(({ group, members }) =>
    members.forEach((m) => {
      if (!clusterOf.has(m.node.id)) clusterOf.set(m.node.id, group.id);
    }),
  );

  // Nested chain of groups per node, outermost first; a group that only partly overlaps the chain
  // (neither inside nor around it) cannot be nested and is not part of the path.
  const memberSets = groups.map(({ group, members }) => ({ id: group.id, ids: new Set(members.map((m) => m.node.id)) }));
  const pathOf = new Map<string, string[]>();
  document.nodes.forEach((node) => {
    const chain = memberSets.filter((g) => g.ids.has(node.id)); // already outermost (largest) first
    const path: Array<(typeof memberSets)[number]> = [];
    chain.forEach((g) => {
      const last = path[path.length - 1];
      if (!last || (g.ids.size < last.ids.size && [...g.ids].every((id) => last.ids.has(id)))) path.push(g);
    });
    if (path.length > 0) pathOf.set(node.id, path.map((g) => g.id));
  });

  // A size given in the code wins over the one worked out from the label.
  const sizes = new Map(
    document.nodes.map((node) => {
      const computed = sizeDiagramNode(node, density);
      return [node.id, node.width !== undefined || node.height !== undefined ? { ...computed, width: node.width ?? computed.width, height: node.height ?? computed.height } : computed];
    }),
  );
  const knownIds = new Set(document.nodes.map((n) => n.id));
  const input: PlacementInput = {
    nodes: ordered.map((node) => ({
      id: node.id,
      depth: depthByNodeId.get(node.id) ?? 0,
      width: sizes.get(node.id)!.width,
      height: sizes.get(node.id)!.height,
      cluster: clusterOf.get(node.id),
      clusterPath: pathOf.get(node.id),
    })),
    edges: document.edges
      .filter((edge) => knownIds.has(edge.from) && knownIds.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        ...(edge.relation ? { relation: edge.relation } : {}),
        ...((parent) => (parent ? { parent } : {}))(foreignKeyParent(document.nodes.find((n) => n.id === edge.from), document.nodes.find((n) => n.id === edge.to))),
        labelWidth: edge.label?.trim()
          ? Math.ceil(estimateTextWidth(edge.label.trim(), EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT))
          : undefined,
      })),
    groups: groups.map(({ group, members }) => ({ id: group.id, nodeIds: members.map((m) => m.node.id) })),
    gaps: { horizontal: horizontalGap, vertical: verticalGap, groupRoom: frameRoom },
  };
  // Rows that many (or labelled) connectors cross get a wider gap; the rest keep the plain one.
  if (channelGaps) input.gaps.verticalByDepth = verticalGapsByDepth(input.edges, depthByNodeId, verticalGap);
  return { input, sizes };
};

/** Everything after node placement: elements, group frames, routed connectors, edge labels. */
export const buildCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  prepared: ReturnType<typeof prepareDiagram>,
  placement: Placement,
  edgeSides?: EdgeSides,
  spread = true,
  connector?: ConnectorStyle,
): CompileResult => {
  const { input, sizes } = prepared;
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const depthById = new Map(input.nodes.map((n) => [n.id, n.depth]));
  const positionedByNodeId = new Map<string, PositionedNode>();
  const nodeElements: DrawingElement[] = [];
  const mind = mindmapRoles(document);

  // Reading order (top to bottom, left to right) keeps element order stable and readable.
  const order = [...placement.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  const lifelineIds = new Set(document.nodes.filter((n) => shapeOf(n) === "lifeline").map((n) => n.id));
  const messageCount = document.edges.filter((e) => lifelineIds.has(e.from) && lifelineIds.has(e.to) && e.from !== e.to).length;
  order.forEach(([id, at]) => {
    const node = nodeById.get(id);
    const size = sizes.get(id);
    if (!node || !size) return;
    const depth = depthById.get(id) ?? 0;
    const positioned = createPositionedNode(
      node,
      size,
      at,
      depth,
      document,
      frameId,
      messageCount,
      mind,
    );
    nodeElements.push(positioned.element);
    positionedByNodeId.set(node.id, positioned);
  });

  const frames = buildGroupFrames(document, positionedByNodeId, frameId);
  const edges = buildEdgeElements({
    document,
    positionedByNodeId,
    frameId,
    edgeSides,
    spread,
    connector,
    frames,
  });

  return {
    elements: [...frames.elements, ...nodeElements, ...edges.edgeElements, ...edges.labelElements],
    diagnostics: {
      collidingLabels: edges.collidingLabels,
      droppedGroups: frames.dropped,
      unfittedNodes: [...sizes.entries()].filter(([, size]) => !size.fits).map(([id]) => id),
    },
  };
};

export interface CompileOptions {
  engine?: PlacementEngine;
  /** Nodes (by diagram node id) moved relative to their automatic place; they keep that offset as the diagram grows. */
  offsets?: Map<string, NodeOffset>;
  /** Connections whose sides were chosen explicitly instead of by the compiler. */
  edgeSides?: EdgeSides;
  /** Nodes (by diagram node id) that must keep their centre; everything else is laid out around them. */
  pins?: Map<string, NodePin>;
  /** False draws every connector on the middle of its side (the compiler otherwise also tries separate points and keeps the better drawing). */
  spreadPorts?: boolean;
  /** Give rows that many (or labelled) connectors cross a wider gap. For drawings generated from scratch; editing an existing one leaves its spacing alone. */
  channelGaps?: boolean;
  /** How connectors are drawn; the caller's choice beats the diagram profile's. */
  connectors?: ConnectorStyle;
  /** Force one way of putting nodes in rows instead of trying the candidates and keeping the best (an engine algorithm names one). */
  depthMode?: DepthMode;
}

const compileWith = (
  document: AIDiagramDocumentV1,
  frameId: string,
  mode: DepthMode,
  { engine = placeLayered, pins, offsets, edgeSides, spreadPorts: spread, channelGaps, connectors }: CompileOptions,
): CompileResult => {
  const prepared = prepareDiagram(document, mode, channelGaps === true);
  const directed = withDirection(engine, document.layoutHints.direction);
  const offsetEngine = offsets && offsets.size > 0 ? withOffsets(directed, offsets) : directed;
  // Nodes whose code gives x and y sit exactly there (x, y is the top-left corner); the rest are laid out around them.
  const fixed = new Map(pins ?? []);
  for (const node of document.nodes) {
    const size = prepared.sizes.get(node.id);
    if (node.x !== undefined && node.y !== undefined && size) fixed.set(node.id, { x: node.x + size.width / 2, y: node.y + size.height / 2 });
  }
  const place = fixed.size > 0 ? withPins(offsetEngine, fixed) : offsetEngine;
  let placement: Placement;
  let layoutFallback: string | undefined;
  try {
    placement = place(prepared.input);
  } catch (error) {
    // A layout bug must cost the diagram its tidiness, not the whole generation.
    layoutFallback = error instanceof Error ? error.message : String(error);
    placement = placeGrid(prepared.input);
  }
  const result = buildCanvas(document, frameId, prepared, placement, edgeSides, spread !== false, connectors);
  return layoutFallback ? { ...result, diagnostics: { ...result.diagnostics, layoutFallback } } : result;
};

/**
 * Lower is better, compared in this order: what is plainly broken (overlapping nodes, a group frame that
 * is wrong, a label on top of something, a connector through a node), then shared lines, crossings and
 * connector length.
 */
const layoutCost = (result: CompileResult, document: AIDiagramDocumentV1): [number, number] => {
  const m = measureLayout(result.elements, document.groups);
  const broken = m.nodeOverlaps + m.groupViolations + m.groupsDropped + m.labelsColliding + m.edgeThroughNodes;
  return [broken, m.edgeOverlaps * 20_000 + m.edgeCrossings * 2_000 + m.totalEdgeLength];
};

const cheaper = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

export const compileAIDiagramDetailed = (
  document: AIDiagramDocumentV1,
  frameId: string,
  options: CompileOptions = {},
): CompileResult => {
  // An architecture can also be laid out by its flow, and a diagram with several groups with each group
  // on its own rows ("stacked"); keep whichever the measurements prefer. Ties keep the earlier one.
  const modes: DepthMode[] = options.depthMode ? [options.depthMode] : ["layers"];
  if (!options.depthMode && document.diagramType === "architecture" && document.nodes.length >= 2) modes.push("flow");
  if (!options.depthMode && document.groups.length >= 2) modes.push("stacked");
  // Connectors that share a side are given separate points (`spreadPorts`); where that makes the drawing
  // worse by the same measure, the middle-of-side drawing is kept instead.
  // Topics are sized by their place in the tree (the centre is larger), which only the whole diagram knows.
  if (document.nodes.some((n) => n.shape === "topic")) {
    const mind = mindmapRoles(document);
    document = { ...document, nodes: document.nodes.map((n) => (n.shape === "topic" ? { ...n, data: { ...n.data, mindRole: mind.role(n.id) } } : n)) };
  }
  const compileMode = (mode: DepthMode): CompileResult => {
    const spread = compileWith(document, frameId, mode, options);
    if (options.spreadPorts === false || document.edges.length < 2) return spread;
    const plain = compileWith(document, frameId, mode, { ...options, spreadPorts: false });
    return cheaper(layoutCost(plain, document), layoutCost(spread, document)) ? plain : spread;
  };
  let best = compileMode(modes[0]);
  if (modes.length === 1) return best;
  let bestCost = layoutCost(best, document);
  for (const mode of modes.slice(1)) {
    const candidate = compileMode(mode);
    const cost = layoutCost(candidate, document);
    // Stacked rows are a repair for what is broken (a dropped frame); on soft measures alone they are not preferred.
    const better = mode === "stacked" ? cost[0] < bestCost[0] : cheaper(cost, bestCost);
    if (better) [best, bestCost] = [candidate, cost];
  }
  return best;
};

export const compileAIDiagramToCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  options: CompileOptions = {},
): DrawingElement[] => compileAIDiagramDetailed(document, frameId, options).elements;
