import {
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { isValidPoint } from "@/core/routing/routing-guards";

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

const getDirectionBucket = (
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
): "h" | "v" => {
  // Guard: if either point is invalid, fall back to horizontal
  if (!isValidPoint(start) || !isValidPoint(end)) return "h";
  if (startHandle === "left" || startHandle === "right") return "h";
  if (startHandle === "top" || startHandle === "bottom") return "v";
  if (endHandle === "left" || endHandle === "right") return "h";
  if (endHandle === "top" || endHandle === "bottom") return "v";
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "h" : "v";
};

const getFallbackEdgeKey = (descriptor: ParallelEdgeDescriptor): string => {
  const roundedStartX = Math.round(descriptor.start.x / 16);
  const roundedStartY = Math.round(descriptor.start.y / 16);
  const roundedEndX = Math.round(descriptor.end.x / 16);
  const roundedEndY = Math.round(descriptor.end.y / 16);
  return `${roundedStartX},${roundedStartY}->${roundedEndX},${roundedEndY}`;
};

const getGroupKey = (descriptor: ParallelEdgeDescriptor): string => {
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
  edges: ParallelEdgeDescriptor[],
  baseSpacing = 16,
): Map<string, number> => {
  // Guard: skip descriptors with invalid start/end to prevent crash in getDirectionBucket
  const validEdges = edges.filter(
    (d) => isValidPoint(d.start) && isValidPoint(d.end),
  );
  const grouped: GroupedEdge[] = validEdges.map((descriptor) => ({
    descriptor,
    groupKey: getGroupKey(descriptor),
  }));

  const byGroup = new Map<string, GroupedEdge[]>();
  grouped.forEach((entry) => {
    if (!byGroup.has(entry.groupKey)) {
      byGroup.set(entry.groupKey, []);
    }
    byGroup.get(entry.groupKey)!.push(entry);
  });

  const offsets = new Map<string, number>();
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
