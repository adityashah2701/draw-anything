import { useCallback } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { editBendAtPoint } from "@/features/whiteboard/hooks/interaction/arrow-bend-edit";

interface UseSelectedArrowOptions {
  hasEditAccess: boolean;
  zoom: number;
  updateElement: (element: DrawingElementJson) => void;
}

/** Double-click bend editing of an arrow (its style and routing live in the properties bar: `use-connector-style.ts`). */
export const useSelectedArrow = ({ hasEditAccess, zoom, updateElement }: UseSelectedArrowOptions) => {
  const updateArrowBendsAtPoint = useCallback(
    (arrow: DrawingElement, point: Point) => {
      if (!hasEditAccess || !isArrowElement(arrow)) return false;
      const points = editBendAtPoint(arrow.points, point, zoom);
      if (!points) return false;
      updateElement({
        ...arrow,
        points,
        routingMode: "orthogonal",
        isManuallyRouted: true,
      } as unknown as DrawingElementJson);
      return true;
    },
    [zoom, updateElement, hasEditAccess],
  );

  return { updateArrowBendsAtPoint };
};
