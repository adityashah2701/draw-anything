export type ArchitectureLayerName =
  | "edge"
  | "application"
  | "data"
  | "observability";

export interface LayerConstraintNode {
  id: string;
  label: string;
  shape: "rectangle" | "circle" | "diamond";
  layerHint?: string | null;
  columnHint?: number | null;
}

export interface LayerConstraintEdge {
  from: string;
  to: string;
}

export interface LayerConstraintAssignment {
  layerByNodeId: Map<string, number>;
  explicitLayerByNodeId: Map<string, ArchitectureLayerName | null>;
  columnByNodeId: Map<string, number | null>;
}

export interface LayerHierarchyValidation {
  violations: number;
  violatingEdges: LayerConstraintEdge[];
}

export const ARCHITECTURE_LAYER_ORDER: ArchitectureLayerName[] = [
  "edge",
  "application",
  "data",
  "observability",
];

export const MAX_ARCHITECTURE_LAYER_INDEX = ARCHITECTURE_LAYER_ORDER.length - 1;

const layerIndexByName: Record<ArchitectureLayerName, number> = {
  edge: 0,
  application: 1,
  data: 2,
  observability: 3,
};

const clampLayer = (value: number) =>
  Math.max(0, Math.min(MAX_ARCHITECTURE_LAYER_INDEX, value));

export const parseArchitectureLayerName = (
  value: string | null | undefined,
): ArchitectureLayerName | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "edge" ||
    normalized === "application" ||
    normalized === "data" ||
    normalized === "observability"
  ) {
    return normalized;
  }
  if (normalized === "app" || normalized === "service") return "application";
  if (normalized === "storage" || normalized === "database") return "data";
  if (normalized === "ops" || normalized === "monitoring") {
    return "observability";
  }
  return null;
};

export const inferArchitectureLayer = (
  label: string,
  shape: LayerConstraintNode["shape"],
): ArchitectureLayerName => {
  const normalized = label.toLowerCase();

  if (
    /(user|users|browser|mobile|client|frontend|edge|cdn|waf|gateway|ingress)/.test(
      normalized,
    )
  ) {
    return "edge";
  }

  if (
    /(db|database|postgres|mysql|redis|cache|storage|bucket|object|s3|blob|warehouse)/.test(
      normalized,
    )
  ) {
    return "data";
  }

  if (
    /(monitor|metrics|logging|trace|alert|audit|observability|telemetry|analytics)/.test(
      normalized,
    )
  ) {
    return "observability";
  }

  if (
    /(api|service|backend|app|auth|worker|processor|queue|broker|event|cart|order|payment|search|product)/.test(
      normalized,
    )
  ) {
    return "application";
  }

  if (shape === "circle") return "data";
  return "application";
};

export const assignArchitectureLayerConstraints = (
  nodes: LayerConstraintNode[],
  edges: LayerConstraintEdge[],
): LayerConstraintAssignment => {
  const layerByNodeId = new Map<string, number>();
  const explicitLayerByNodeId = new Map<string, ArchitectureLayerName | null>();
  const columnByNodeId = new Map<string, number | null>();

  const nodeIds = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => {
    const explicitLayer = parseArchitectureLayerName(node.layerHint);
    explicitLayerByNodeId.set(node.id, explicitLayer);
    const inferredLayer = inferArchitectureLayer(node.label, node.shape);
    const initialLayer = explicitLayer ?? inferredLayer;
    layerByNodeId.set(node.id, layerIndexByName[initialLayer]);

    const columnHint = Number.isFinite(node.columnHint)
      ? Math.max(0, Math.floor(node.columnHint ?? 0))
      : null;
    columnByNodeId.set(node.id, columnHint);
  });

  const validEdges = edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );

  // Relax hierarchy: ensure children don't appear above parents, with both
  // downward and upward passes for better convergence on complex graphs.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    // Downward pass: push children down if needed.
    validEdges.forEach((edge) => {
      const fromLayer = layerByNodeId.get(edge.from);
      const toLayer = layerByNodeId.get(edge.to);
      if (fromLayer === undefined || toLayer === undefined) return;

      const explicitTarget = explicitLayerByNodeId.get(edge.to);
      const targetFloor = explicitTarget
        ? layerIndexByName[explicitTarget]
        : fromLayer;
      const nextTarget = clampLayer(Math.max(toLayer, targetFloor));
      if (nextTarget !== toLayer) {
        layerByNodeId.set(edge.to, nextTarget);
        changed = true;
      }
    });
    // Upward pass: pull parents up if they ended up below their children.
    validEdges.forEach((edge) => {
      const fromLayer = layerByNodeId.get(edge.from);
      const toLayer = layerByNodeId.get(edge.to);
      if (fromLayer === undefined || toLayer === undefined) return;

      const explicitSource = explicitLayerByNodeId.get(edge.from);
      if (explicitSource) return; // Don't move explicitly placed nodes.
      if (fromLayer > toLayer) {
        layerByNodeId.set(edge.from, clampLayer(toLayer));
        changed = true;
      }
    });
    if (!changed) break;
  }

  return { layerByNodeId, explicitLayerByNodeId, columnByNodeId };
};

export const validateArchitectureLayerHierarchy = (
  edges: LayerConstraintEdge[],
  layerByNodeId: Map<string, number>,
): LayerHierarchyValidation => {
  const violatingEdges: LayerConstraintEdge[] = [];
  edges.forEach((edge) => {
    const fromLayer = layerByNodeId.get(edge.from);
    const toLayer = layerByNodeId.get(edge.to);
    if (fromLayer === undefined || toLayer === undefined) return;
    if (toLayer < fromLayer) {
      violatingEdges.push(edge);
    }
  });
  return {
    violations: violatingEdges.length,
    violatingEdges,
  };
};

export const layerNameFromIndex = (index: number): ArchitectureLayerName =>
  ARCHITECTURE_LAYER_ORDER[clampLayer(index)];
