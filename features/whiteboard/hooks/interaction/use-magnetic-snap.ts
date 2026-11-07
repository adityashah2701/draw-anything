import { useCallback, useMemo } from "react";
import type { DrawingElement } from "@/core/model";
import { createAnchorIndex } from "@/core/anchors/generate-anchors";
import {
  buildGridIndex,
  findNearestAnchorSnapPure,
  type BoundsLike,
  type FindNearestSnapInput,
  type MagneticSnapMatch,
} from "@/core/snap/magnetic-snap";

export type { BoundsLike, FindNearestSnapInput, MagneticSnapMatch };

export interface UseMagneticSnapOptions {
  elements: DrawingElement[];
  getElementBounds: (element: DrawingElement) => BoundsLike | null;
  snapRadius?: number;
}

export const useMagneticSnap = ({
  elements,
  getElementBounds,
  snapRadius = 20,
}: UseMagneticSnapOptions) => {
  const anchorIndex = useMemo(
    () => createAnchorIndex(elements, getElementBounds),
    [elements, getElementBounds],
  );

  const typeById = useMemo(
    () => new Map(elements.map((element) => [element.id, element.type as string])),
    [elements],
  );

  const useSpatialFiltering = anchorIndex.shapes.length > 200;

  const gridIndex = useMemo(() => {
    const cellSize = Math.max(40, snapRadius * 2);
    return buildGridIndex(anchorIndex.anchors, cellSize);
  }, [anchorIndex.anchors, snapRadius]);

  const findNearestSnap = useCallback(
    ({
      point,
      dragVector,
      previous,
      excludeElementIds,
      radius = snapRadius,
    }: FindNearestSnapInput): MagneticSnapMatch | null => {
      return findNearestAnchorSnapPure({
        point,
        dragVector,
        previous,
        excludeElementIds,
        radius,
        anchorIndex,
        gridIndex,
        typeById,
        useSpatialFiltering,
      });
    },
    [anchorIndex, gridIndex, snapRadius, typeById, useSpatialFiltering],
  );

  return {
    snapRadius,
    anchorIndex,
    findNearestSnap,
  };
};

