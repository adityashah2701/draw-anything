import { useCallback } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ArrowElement, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { applyArrowChange, type ArrowChange } from "@/features/whiteboard/commands/connectors";

interface UseConnectorStyleOptions {
  elements: readonly DrawingElement[];
  hasEditAccess: boolean;
  routeArrowByConnections: (arrow: ArrowElement) => ArrowElement;
  /** One storage mutation for the whole batch, so a change to many connectors is one undo step. */
  updateElements: (batch: DrawingElementJson[]) => void;
}

/** Connector look and routing from the properties bar, for any number of connectors (`applyArrowChange` is the one definition). */
export const useConnectorStyle = ({ elements, hasEditAccess, routeArrowByConnections, updateElements }: UseConnectorStyleOptions) =>
  useCallback(
    (ids: readonly string[], change: ArrowChange) => {
      if (!hasEditAccess) return;
      const wanted = new Set(ids);
      const batch = elements.flatMap((element) =>
        wanted.has(element.id) && isArrowElement(element) ? [applyArrowChange(element, change, routeArrowByConnections) as unknown as DrawingElementJson] : [],
      );
      if (batch.length > 0) updateElements(batch);
    },
    [elements, hasEditAccess, routeArrowByConnections, updateElements],
  );
