import {
  ConnectionHandle,
  Point,
} from "@/core/model";
import {
  isNonEmptyString,
  isValidPoint,
  toValidPoint,
} from "@/core/routing/routing-guards";

export interface ParallelEdgeDescriptor {
  arrowId: string;
  sourceId?: string;
  targetId?: string;
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
}

interface GroupedEdge {
  descriptor: ParallelEdgeDescriptor;
  groupKey: string;
}

const isValidParallelEdgeDescriptor = (
  descriptor: Partial<ParallelEdgeDescriptor> | null | undefined,
): descriptor is ParallelEdgeDescriptor => {
  if (!descriptor) return false;
  if (!isValidPoint(descriptor.start) || !isValidPoint(descriptor.end)) return false;

  return (
    isNonEmptyString(descriptor.arrowId) &&
    isValidPoint(descriptor.start) &&
    isValidPoint(descriptor.end)
  );
};

const getDirectionBucket = (
  start?: Point | null,
  end?: Point | null,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
): "h" | "v" => {
  if (!start || !end) return "h";
  if (
    typeof start.x !== "number" ||
    typeof start.y !== "number" ||
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y)
  ) {
    return "h";
  }
  if (
    typeof end.x !== "number" ||
    typeof end.y !== "number" ||
    !Number.isFinite(end.x) ||
    !Number.isFinite(end.y)
  ) {
    return "h";
  }

  if (startHandle === "left" || startHandle === "right") return "h";
  if (startHandle === "top" || startHandle === "bottom") return "v";
  if (endHandle === "left" || endHandle === "right") return "h";
  if (endHandle === "top" || endHandle === "bottom") return "v";
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "h" : "v";
};

const getFallbackEdgeKey = (descriptor: Partial<ParallelEdgeDescriptor> | null | undefined): string => {
  if (!descriptor) return "invalid-edge";
  const safeStart = toValidPoint(descriptor.start);
  const safeEnd = toValidPoint(descriptor.end);
  if (!safeStart || !safeEnd) {
    return descriptor.arrowId || "invalid-edge";
  }
  const roundedStartX = Math.round(safeStart.x / 16);
  const roundedStartY = Math.round(safeStart.y / 16);
  const roundedEndX = Math.round(safeEnd.x / 16);
  const roundedEndY = Math.round(safeEnd.y / 16);
  return `${roundedStartX},${roundedStartY}->${roundedEndX},${roundedEndY}`;
};

const getGroupKey = (descriptor: Partial<ParallelEdgeDescriptor> | null | undefined): string => {
  if (!isValidParallelEdgeDescriptor(descriptor)) {
    return "invalid-edge|h";
  }

  const axis = getDirectionBucket(
    descriptor.start,
    descriptor.end,
    descriptor.startHandle,
    descriptor.endHandle,
  );
  if (descriptor.sourceId && descriptor.targetId) {
    const a = descriptor.sourceId;
    const b = descriptor.targetId;
    const undirected = a < b ? `${a}|${b}` : `${b}|${a}`;
    return `${undirected}|${axis}`;
  }
  return `${getFallbackEdgeKey(descriptor)}|${axis}`;
};

const centeredIndex = (position: number, total: number): number => {
  if (total % 2 === 1) {
    const center = (total - 1) / 2;
    return position - center;
  }
  const center = total / 2 - 0.5;
  return position - center;
};

const computeGroupSpacing = (
  baseSpacing: number,
  groupSize: number,
): number => {
  if (groupSize <= 2) return baseSpacing;
  // Increase spacing for dense bundles while keeping compact routing.
  const scale = 1 + Math.min(1.0, (groupSize - 2) * 0.1);
  return Math.max(12, baseSpacing * scale);
};

export const computeParallelOffsets = (
  edges: readonly (ParallelEdgeDescriptor | null | undefined)[],
  baseSpacing = 16,
): Map<string, number> => {
  const offsets = new Map<string, number>();
  if (!Array.isArray(edges) || edges.length === 0) return offsets;

  const byGroup = new Map<string, GroupedEdge[]>();
  for (const descriptor of edges) {
    if (!isValidParallelEdgeDescriptor(descriptor)) continue;
    const groupKey = getGroupKey(descriptor);
    const grouped = byGroup.get(groupKey);
    if (grouped) {
      grouped.push({ descriptor, groupKey });
    } else {
      byGroup.set(groupKey, [{ descriptor, groupKey }]);
    }
  }

  byGroup.forEach((entries) => {
    const sorted = [...entries].sort((a, b) =>
      a.descriptor.arrowId.localeCompare(b.descriptor.arrowId),
    );
    const spacing = computeGroupSpacing(baseSpacing, sorted.length);
    sorted.forEach((entry, index) => {
      offsets.set(
        entry.descriptor.arrowId,
        centeredIndex(index, sorted.length) * spacing,
      );
    });
  });

  return offsets;
};
