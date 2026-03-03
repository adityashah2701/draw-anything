export interface GridNode {
  id: string;
  width: number;
  order: number;
  columnHint?: number | null;
}

export interface GridLayerInput {
  layer: number;
  nodes: GridNode[];
}

export interface GridDistributorOptions {
  centerX?: number;
  maxWidth?: number;
  minGap?: number;
  maxGap?: number;
}

export interface GridDistributorResult {
  xByNodeId: Map<string, number>;
  widthByLayer: Map<number, number>;
}

const DEFAULT_OPTIONS: Required<GridDistributorOptions> = {
  centerX: 0,
  maxWidth: 1480,
  minGap: 84,
  maxGap: 176,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const compareLayerNodes = (a: GridNode, b: GridNode) => {
  const aColumn = a.columnHint ?? Number.NaN;
  const bColumn = b.columnHint ?? Number.NaN;
  const bothColumns = Number.isFinite(aColumn) && Number.isFinite(bColumn);
  if (bothColumns && aColumn !== bColumn) {
    return (aColumn as number) - (bColumn as number);
  }
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id);
};

const distributeSingleLayer = (
  layerNodes: GridNode[],
  options: Required<GridDistributorOptions>,
): { xByNodeId: Map<string, number>; width: number } => {
  const ordered = [...layerNodes].sort(compareLayerNodes);
  const xByNodeId = new Map<string, number>();
  if (ordered.length === 0) {
    return { xByNodeId, width: 0 };
  }

  const totalNodeWidth = ordered.reduce((sum, node) => sum + node.width, 0);
  const slots = Math.max(ordered.length - 1, 1);
  const idealGap = (options.maxWidth - totalNodeWidth) / slots;
  const gap = clamp(idealGap, options.minGap, options.maxGap);
  const width = totalNodeWidth + gap * (ordered.length - 1);

  let cursorX = options.centerX - width / 2;
  ordered.forEach((node) => {
    const x = cursorX + node.width / 2;
    xByNodeId.set(node.id, x);
    cursorX += node.width + gap;
  });

  // Post-distribution overlap correction: shift any overlapping nodes apart.
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const prevX = xByNodeId.get(prev.id) ?? 0;
    const currX = xByNodeId.get(curr.id) ?? 0;
    const minDistance = prev.width / 2 + options.minGap + curr.width / 2;
    if (currX - prevX < minDistance) {
      xByNodeId.set(curr.id, prevX + minDistance);
    }
  }

  return { xByNodeId, width };
};

export const distributeLayerGrid = (
  layers: GridLayerInput[],
  options: GridDistributorOptions = {},
): GridDistributorResult => {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const xByNodeId = new Map<string, number>();
  const widthByLayer = new Map<number, number>();

  layers.forEach((layer) => {
    const distributed = distributeSingleLayer(layer.nodes, resolved);
    distributed.xByNodeId.forEach((x, nodeId) => {
      xByNodeId.set(nodeId, x);
    });
    widthByLayer.set(layer.layer, distributed.width);
  });

  return { xByNodeId, widthByLayer };
};
