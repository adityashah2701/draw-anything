import { useCallback, useMemo } from "react";
import { Anchor, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  AnchorIndex,
  createAnchorIndex,
} from "@/core/anchors/generate-anchors";

import { squaredDistance } from "@/core/utils/distance";

interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface UseMagneticSnapOptions {
  elements: DrawingElement[];
  getElementBounds: (element: DrawingElement) => BoundsLike | null;
  snapRadius?: number;
}

export interface MagneticSnapMatch {
  elementId: string;
  anchor: Anchor;
  distanceSq: number;
}

interface FindNearestSnapInput {
  point: Point;
  dragVector?: Point;
  previous?: MagneticSnapMatch | null;
}

interface AnchorGridIndex {
  cellSize: number;
  grid: Map<string, number[]>;
}

const getCellKey = (x: number, y: number, cellSize: number) =>
  `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

const buildGridIndex = (
  anchors: AnchorIndex["anchors"],
  cellSize: number,
): AnchorGridIndex => {
  const grid = new Map<string, number[]>();

  anchors.forEach((record, index) => {
    const key = getCellKey(record.anchor.x, record.anchor.y, cellSize);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key)!.push(index);
  });

  return { cellSize, grid };
};

const getNeighborCandidateIndices = (
  point: Point,
  radius: number,
  gridIndex: AnchorGridIndex,
): number[] => {
  const minCellX = Math.floor((point.x - radius) / gridIndex.cellSize);
  const maxCellX = Math.floor((point.x + radius) / gridIndex.cellSize);
  const minCellY = Math.floor((point.y - radius) / gridIndex.cellSize);
  const maxCellY = Math.floor((point.y + radius) / gridIndex.cellSize);

  const result = new Set<number>();
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const key = `${cx}:${cy}`;
      const bucket = gridIndex.grid.get(key);
      if (!bucket) continue;
      bucket.forEach((index) => result.add(index));
    }
  }

  return Array.from(result);
};

const alignmentPenalty = (
  anchorSide: Anchor["side"],
  dragVector?: Point,
  snapRadius = 20,
) => {
  if (!dragVector) return 0;
  const dx = Math.abs(dragVector.x);
  const dy = Math.abs(dragVector.y);
  if (dx < 1 && dy < 1) return 0;

  const horizontalDominant = dx >= dy;
  const isHorizontalAnchor = anchorSide === "left" || anchorSide === "right";
  if (horizontalDominant === isHorizontalAnchor) return 0;
  return snapRadius * snapRadius * 0.12;
};

export const useMagneticSnap = ({
  elements,
  getElementBounds,
  snapRadius = 20,
}: UseMagneticSnapOptions) => {
  const anchorIndex = useMemo(
    () => createAnchorIndex(elements, getElementBounds),
    [elements, getElementBounds],
  );

  const useSpatialFiltering = anchorIndex.shapes.length > 200;

  const gridIndex = useMemo(() => {
    const cellSize = Math.max(40, snapRadius * 2);
    return buildGridIndex(anchorIndex.anchors, cellSize);
  }, [anchorIndex.anchors, snapRadius]);

  const findNearestSnap = useCallback(
    ({ point, dragVector, previous }: FindNearestSnapInput): MagneticSnapMatch | null => {
      const snapRadiusSq = snapRadius * snapRadius;
      const hysteresisRadiusSq = (snapRadius * 1.35) * (snapRadius * 1.35);

      if (previous) {
        const prevDistSq = squaredDistance(point, previous.anchor);
        if (prevDistSq <= hysteresisRadiusSq) {
          return { ...previous, distanceSq: prevDistSq };
        }
      }

      const candidateIndices = useSpatialFiltering
        ? getNeighborCandidateIndices(point, snapRadius, gridIndex)
        : anchorIndex.anchors.map((_, index) => index);

      let best: MagneticSnapMatch | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      candidateIndices.forEach((index) => {
        const record = anchorIndex.anchors[index];
        if (!record) return;

        const distSq = squaredDistance(point, record.anchor);
        if (distSq > snapRadiusSq) return;

        const flickerPenalty =
          previous && previous.anchor.id !== record.anchor.id
            ? snapRadiusSq * 0.08
            : 0;

        const score =
          distSq +
          alignmentPenalty(record.anchor.side, dragVector, snapRadius) +
          flickerPenalty;

        if (score < bestScore) {
          bestScore = score;
          best = {
            elementId: record.elementId,
            anchor: record.anchor,
            distanceSq: distSq,
          };
        }
      });

      return best;
    },
    [anchorIndex.anchors, gridIndex, snapRadius, useSpatialFiltering],
  );

  return {
    snapRadius,
    anchorIndex,
    findNearestSnap,
  };
};

