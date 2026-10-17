import { useCallback, useMemo } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type {
  ArrowRoutingMode,
  ArrowType,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  ArrowElement,
  getArrowHeadVisibility,
  isArrowElement,
} from "@/core/shapes/arrow/arrow-utils";
import { editBendAtPoint } from "@/features/whiteboard/hooks/interaction/arrow-bend-edit";

type ArrowPatch = Partial<
  Pick<ArrowElement, "type" | "routingMode" | "dashed" | "arrowHeadStart" | "arrowHeadEnd" | "isManuallyRouted">
>;

interface UseSelectedArrowOptions {
  selectedElement: DrawingElement | null;
  hasEditAccess: boolean;
  zoom: number;
  routeArrowByConnections: (arrow: ArrowElement) => ArrowElement;
  updateElement: (element: DrawingElementJson) => void;
}

/** Style panel state and edits for the single selected arrow, plus double-click bend editing. */
export const useSelectedArrow = ({
  selectedElement,
  hasEditAccess,
  zoom,
  routeArrowByConnections,
  updateElement,
}: UseSelectedArrowOptions) => {
  const selectedArrow = useMemo(() => {
    if (!selectedElement || !isArrowElement(selectedElement)) {
      return null;
    }
    const heads = getArrowHeadVisibility(selectedElement);
    return {
      type: selectedElement.type,
      routingMode: selectedElement.routingMode ?? "orthogonal",
      dashed: Boolean(selectedElement.dashed),
      arrowHeadStart: heads.start,
      arrowHeadEnd: heads.end,
    };
  }, [selectedElement]);

  const updateSelectedArrow = useCallback(
    (patch: ArrowPatch) => {
      if (!hasEditAccess) return;
      if (!selectedElement || !isArrowElement(selectedElement)) return;

      let next: ArrowElement = {
        ...selectedElement,
        ...patch,
      };

      if (patch.type === "arrow-bidirectional") {
        next.arrowHeadStart = patch.arrowHeadStart ?? true;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.type === "arrow") {
        next.arrowHeadStart = patch.arrowHeadStart ?? false;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.routingMode === "straight") {
        const endIndex = Math.max(1, next.points.length - 1);
        next.points = [next.points[0], next.points[endIndex]];
        next.isManuallyRouted = false;
      } else if (patch.routingMode === "orthogonal") {
        next = routeArrowByConnections(next);
      }

      updateElement(next as unknown as DrawingElementJson);
    },
    [routeArrowByConnections, selectedElement, updateElement, hasEditAccess],
  );

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

  const handleArrowTypeChange = useCallback(
    (type: ArrowType) => updateSelectedArrow({ type }),
    [updateSelectedArrow],
  );
  const handleArrowRoutingModeChange = useCallback(
    (mode: ArrowRoutingMode) => updateSelectedArrow({ routingMode: mode }),
    [updateSelectedArrow],
  );
  const handleArrowDashedChange = useCallback(
    (value: boolean) => updateSelectedArrow({ dashed: value }),
    [updateSelectedArrow],
  );
  const handleArrowHeadStartChange = useCallback(
    (value: boolean) => updateSelectedArrow({ arrowHeadStart: value }),
    [updateSelectedArrow],
  );
  const handleArrowHeadEndChange = useCallback(
    (value: boolean) => updateSelectedArrow({ arrowHeadEnd: value }),
    [updateSelectedArrow],
  );

  return {
    selectedArrow,
    updateSelectedArrow,
    updateArrowBendsAtPoint,
    handleArrowTypeChange,
    handleArrowRoutingModeChange,
    handleArrowDashedChange,
    handleArrowHeadStartChange,
    handleArrowHeadEndChange,
  };
};
