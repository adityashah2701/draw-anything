import {
  ARCHITECTURE_LAYER_ORDER,
  assignArchitectureLayerConstraints,
  layerNameFromIndex,
  validateArchitectureLayerHierarchy,
} from "@/core/layout/layer-constraint";
import { distributeLayerGrid } from "@/core/layout/grid-distributor";

export interface LayeredLayoutNodeInput {
  id: string;
  label: string;
  shape: "rectangle" | "circle" | "diamond";
  width: number;
  height: number;
  layerHint?: string | null;
  columnHint?: number | null;
}

export interface LayeredLayoutEdgeInput {
  from: string;
  to: string;
}

export interface LayeredLayoutOptions {
  centerX?: number;
  topY?: number;
  layerGap?: number;
  rowPadding?: number;
  maxDiagramWidth?: number;
  minHorizontalGap?: number;
  maxHorizontalGap?: number;
  orderingPasses?: number;
}

export interface LayerBand {
  index: number;
  name: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
}

export interface PositionedLayerNode {
  id: string;
  label: string;
  shape: "rectangle" | "circle" | "diamond";
  width: number;
  height: number;
  x: number;
  y: number;
  layer: number;
  column: number;
}

export interface LayeredLayoutMetrics {
  edgeCrossingRatio: number;
  edgeCrossings: number;
  edgeComparablePairs: number;
  hierarchyViolations: number;
  nodeOverlapCount: number;
  diagramWidth: number;
}

export interface LayeredLayoutResult {
  nodes: Map<string, PositionedLayerNode>;
  layers: LayerBand[];
  metrics: LayeredLayoutMetrics;
}

const DEFAULT_OPTIONS: Required<LayeredLayoutOptions> = {
  centerX: 980,
  topY: 160,
  layerGap: 170,
  rowPadding: 28,
  maxDiagramWidth: 1520,
  minHorizontalGap: 94,
  maxHorizontalGap: 176,
  orderingPasses: 3,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const createFenwick = (size: number) => {
  const tree = new Array(size + 2).fill(0);
  const update = (index: number, delta: number) => {
    for (let i = index + 1; i < tree.length; i += i & -i) {
      tree[i] += delta;
    }
  };
  const query = (index: number) => {
    let sum = 0;
    for (let i = index + 1; i > 0; i -= i & -i) {
      sum += tree[i];
    }
    return sum;
  };
  return { update, query };
};

const countInversions = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  const rankByValue = new Map<number, number>();
  unique.forEach((value, index) => rankByValue.set(value, index));
  const fenwick = createFenwick(unique.length + 2);

  let inversions = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const rank = rankByValue.get(values[i]) ?? 0;
    inversions += fenwick.query(rank - 1);
    fenwick.update(rank, 1);
  }
  return inversions;
};

const countNodeOverlaps = (nodes: PositionedLayerNode[]): number => {
  const byLayer = new Map<number, PositionedLayerNode[]>();
  nodes.forEach((node) => {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
    byLayer.get(node.layer)!.push(node);
  });

  let overlapCount = 0;
  byLayer.forEach((layerNodes) => {
    const ordered = [...layerNodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      const prevRight = prev.x + prev.width / 2;
      const currLeft = curr.x - curr.width / 2;
      if (currLeft < prevRight) {
        overlapCount += 1;
      }
    }
  });

  return overlapCount;
};

const computeEdgeCrossingMetrics = (
  edges: LayeredLayoutEdgeInput[],
  nodesById: Map<string, PositionedLayerNode>,
) => {
  const grouped = new Map<string, Array<{ sourceColumn: number; targetColumn: number }>>();

  edges.forEach((edge) => {
    const source = nodesById.get(edge.from);
    const target = nodesById.get(edge.to);
    if (!source || !target) return;
    if (source.layer === target.layer) return;

    const fromLayer = Math.min(source.layer, target.layer);
    const toLayer = Math.max(source.layer, target.layer);
    const key = `${fromLayer}->${toLayer}`;
    if (!grouped.has(key)) grouped.set(key, []);

    const directionIsForward = source.layer <= target.layer;
    grouped.get(key)!.push({
      sourceColumn: directionIsForward ? source.column : target.column,
      targetColumn: directionIsForward ? target.column : source.column,
    });
  });

  let crossings = 0;
  let comparablePairs = 0;
  grouped.forEach((group) => {
    if (group.length <= 1) return;
    const ordered = [...group].sort((a, b) => {
      if (a.sourceColumn !== b.sourceColumn) {
        return a.sourceColumn - b.sourceColumn;
      }
      return a.targetColumn - b.targetColumn;
    });
    crossings += countInversions(ordered.map((edge) => edge.targetColumn));
    comparablePairs += (ordered.length * (ordered.length - 1)) / 2;
  });

  const ratio =
    comparablePairs === 0 ? 0 : clamp(crossings / comparablePairs, 0, 1);
  return { crossings, comparablePairs, ratio };
};

const mean = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const createOrderingMaps = (nodesByLayer: Map<number, LayeredLayoutNodeInput[]>) => {
  const orderByNodeId = new Map<string, number>();
  nodesByLayer.forEach((nodes) => {
    nodes
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((node, index) => {
        orderByNodeId.set(node.id, index);
      });
  });
  return orderByNodeId;
};

export const computeArchitectureLayeredLayout = ({
  nodes,
  edges,
  options = {},
}: {
  nodes: LayeredLayoutNodeInput[];
  edges: LayeredLayoutEdgeInput[];
  options?: LayeredLayoutOptions;
}): LayeredLayoutResult => {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter(
    (edge) => nodeById.has(edge.from) && nodeById.has(edge.to),
  );

  const constraints = assignArchitectureLayerConstraints(nodes, validEdges);
  const layerByNodeId = constraints.layerByNodeId;

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });
  validEdges.forEach((edge) => {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  });

  const nodesByLayer = new Map<number, LayeredLayoutNodeInput[]>();
  nodes.forEach((node) => {
    const layer = layerByNodeId.get(node.id) ?? 1;
    if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
    nodesByLayer.get(layer)!.push(node);
  });

  const orderByNodeId = createOrderingMaps(nodesByLayer);
  const maxLayer = ARCHITECTURE_LAYER_ORDER.length - 1;

  const reorderLayer = (layer: number, neighborsFrom: "incoming" | "outgoing") => {
    const layerNodes = nodesByLayer.get(layer);
    if (!layerNodes || layerNodes.length <= 1) return;

    const reordered = [...layerNodes]
      .map((node) => {
        const neighborIds =
          neighborsFrom === "incoming"
            ? incoming.get(node.id) ?? []
            : outgoing.get(node.id) ?? [];
        const sameSide = neighborIds
          .filter((neighborId) => {
            const neighborLayer = layerByNodeId.get(neighborId);
            if (neighborLayer === undefined) return false;
            return neighborsFrom === "incoming"
              ? neighborLayer <= layer
              : neighborLayer >= layer;
          })
          .map((neighborId) => orderByNodeId.get(neighborId) ?? 0);

        const barycenter =
          sameSide.length > 0 ? mean(sameSide) : orderByNodeId.get(node.id) ?? 0;
        const hintPriority = constraints.columnByNodeId.get(node.id);
        return {
          node,
          barycenter,
          hintPriority: hintPriority ?? Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        if (a.hintPriority !== b.hintPriority) {
          return a.hintPriority - b.hintPriority;
        }
        if (a.barycenter !== b.barycenter) {
          return a.barycenter - b.barycenter;
        }
        return a.node.label.localeCompare(b.node.label);
      })
      .map((entry) => entry.node);

    nodesByLayer.set(layer, reordered);
    reordered.forEach((node, index) => {
      orderByNodeId.set(node.id, index);
    });
  };

  for (let pass = 0; pass < resolved.orderingPasses; pass += 1) {
    for (let layer = 1; layer <= maxLayer; layer += 1) {
      reorderLayer(layer, "incoming");
    }
    for (let layer = maxLayer - 1; layer >= 0; layer -= 1) {
      reorderLayer(layer, "outgoing");
    }
  }

  const distributed = distributeLayerGrid(
    Array.from(nodesByLayer.entries()).map(([layer, layerNodes]) => ({
      layer,
      nodes: layerNodes.map((node) => ({
        id: node.id,
        width: node.width,
        order: orderByNodeId.get(node.id) ?? 0,
        columnHint: constraints.columnByNodeId.get(node.id) ?? null,
      })),
    })),
    {
      centerX: resolved.centerX,
      maxWidth: resolved.maxDiagramWidth,
      minGap: resolved.minHorizontalGap,
      maxGap: resolved.maxHorizontalGap,
    },
  );

  const nodesOut = new Map<string, PositionedLayerNode>();
  const layerHeights = new Map<number, number>();
  const layerTop = new Map<number, number>();

  for (let layer = 0; layer <= maxLayer; layer += 1) {
    const entries = nodesByLayer.get(layer) ?? [];
    const maxHeight = entries.reduce((acc, node) => Math.max(acc, node.height), 0);
    layerHeights.set(layer, Math.max(maxHeight, 68));
  }

  let cursorY = resolved.topY;
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    layerTop.set(layer, cursorY);
    cursorY += (layerHeights.get(layer) ?? 0) + resolved.layerGap;
  }

  nodes.forEach((node) => {
    const layer = layerByNodeId.get(node.id) ?? 1;
    const x = distributed.xByNodeId.get(node.id) ?? resolved.centerX;
    const top = layerTop.get(layer) ?? resolved.topY;
    const rowHeight = layerHeights.get(layer) ?? node.height;
    const y = top + (rowHeight - node.height) / 2;
    nodesOut.set(node.id, {
      ...node,
      x,
      y,
      layer,
      column: orderByNodeId.get(node.id) ?? 0,
    });
  });

  const layerBands: LayerBand[] = [];
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    const layerNodes = Array.from(nodesOut.values()).filter(
      (node) => node.layer === layer,
    );
    const top = layerTop.get(layer) ?? resolved.topY;
    const height = layerHeights.get(layer) ?? 68;
    if (layerNodes.length === 0) {
      layerBands.push({
        index: layer,
        name: layerNameFromIndex(layer),
        top: top - resolved.rowPadding,
        bottom: top + height + resolved.rowPadding,
        left: resolved.centerX - 280,
        right: resolved.centerX + 280,
        height: height + resolved.rowPadding * 2,
      });
      continue;
    }
    const left = Math.min(...layerNodes.map((node) => node.x - node.width / 2));
    const right = Math.max(...layerNodes.map((node) => node.x + node.width / 2));
    layerBands.push({
      index: layer,
      name: layerNameFromIndex(layer),
      top: top - resolved.rowPadding,
      bottom: top + height + resolved.rowPadding,
      left: left - 70,
      right: right + 70,
      height: height + resolved.rowPadding * 2,
    });
  }

  const hierarchyValidation = validateArchitectureLayerHierarchy(
    validEdges,
    layerByNodeId,
  );
  const crossing = computeEdgeCrossingMetrics(validEdges, nodesOut);
  const overlapCount = countNodeOverlaps(Array.from(nodesOut.values()));

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  nodesOut.forEach((node) => {
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
  });
  const diagramWidth = Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0;

  return {
    nodes: nodesOut,
    layers: layerBands,
    metrics: {
      edgeCrossingRatio: crossing.ratio,
      edgeCrossings: crossing.crossings,
      edgeComparablePairs: crossing.comparablePairs,
      hierarchyViolations: hierarchyValidation.violations,
      nodeOverlapCount: overlapCount,
      diagramWidth,
    },
  };
};
