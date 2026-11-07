import { useCallback, useState } from "react";
import type {
  Bounds,
  ConnectionHandle,
  DrawingElement,
  Point,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import { getConnectionHandles } from "@/features/whiteboard/utils/canvas-render-utils";
import type { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";
import {
  buildConnectorArrow,
  handleUnderPoint,
  resolveConnectionDrop,
} from "@/features/whiteboard/hooks/interaction/connector-arrow";
import type { Gesture } from "@/features/whiteboard/hooks/interaction/gesture-state";

export interface ConnectionDraft {
  fromElementId: string;
  fromAnchorId: string;
  fromHandle: ConnectionHandle;
  currentPoint: Point;
  snapMatch: MagneticSnapMatch | null;
}

export interface ArrowSnapPreview {
  endpoint: "start" | "end";
  pointer: Point;
  match: MagneticSnapMatch;
}

/** Connector snap distance in screen pixels (divided by zoom to get world units). */
export const CONNECTOR_SNAP_PX = 14;
/** Reach of a connection handle, in world units. */
export const CONNECTION_HANDLE_RADIUS = 12;

export const isConnectorTool = (tool: Tool) =>
  tool === "arrow" || tool === "arrow-bidirectional";

export interface UseConnectorGestureProps {
  elements: DrawingElement[];
  getElementBounds: (element: DrawingElement) => Bounds | null;
  hasEditAccess: boolean;
  zoom: number;
  generateId: () => string;
  setGesture: (gesture: Gesture) => void;
  findNearestAnchorSnap?: (input: {
    point: Point;
    dragVector?: Point;
    previous?: MagneticSnapMatch | null;
    excludeElementIds?: string[];
    radius?: number;
  }) => MagneticSnapMatch | null;
  routeConnectedArrow?: (arrow: DrawingElement) => DrawingElement;
  onArrowSnapPreviewChange?: (preview: ArrowSnapPreview | null) => void;
  addElementDirect?: (element: DrawingElement) => void;
  getElementsAtPoint: (point: Point, radius?: number) => DrawingElement[];
  resetScratch: () => void;
}

export function useConnectorGesture({
  elements,
  getElementBounds,
  hasEditAccess,
  zoom,
  generateId,
  setGesture,
  findNearestAnchorSnap,
  routeConnectedArrow,
  onArrowSnapPreviewChange,
  addElementDirect,
  getElementsAtPoint,
  resetScratch,
}: UseConnectorGestureProps) {
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);

  /** Get the connection handle positions for an element (world coords) */
  const getElementConnectionHandles = useCallback(
    (element: DrawingElement) => {
      const bounds = getElementBounds(element);
      return getConnectionHandles(element, bounds);
    },
    [getElementBounds],
  );

  const tryStartConnection = useCallback(
    (point: Point, grabsArrowEnd: boolean): boolean => {
      if (!hasEditAccess || !hoveredElementId || grabsArrowEnd) return false;
      const hoveredEl = elements.find((el) => el.id === hoveredElementId);
      if (!hoveredEl) return false;
      const handle = handleUnderPoint(
        getElementConnectionHandles(hoveredEl),
        point,
        CONNECTION_HANDLE_RADIUS,
      );
      if (!handle) return false;

      setGesture("connecting");
      setConnectionDraft({
        fromElementId: hoveredElementId,
        fromAnchorId: handle.id,
        fromHandle: handle.name,
        currentPoint: point,
        snapMatch: null,
      });
      return true;
    },
    [elements, getElementConnectionHandles, hasEditAccess, hoveredElementId, setGesture],
  );

  const updateConnection = useCallback(
    (point: Point): boolean => {
      if (!connectionDraft) return false;
      const dragVector = {
        x: point.x - connectionDraft.currentPoint.x,
        y: point.y - connectionDraft.currentPoint.y,
      };
      const snapMatch = findNearestAnchorSnap?.({
        point,
        dragVector,
        previous: connectionDraft.snapMatch,
        excludeElementIds: [connectionDraft.fromElementId],
        radius: CONNECTOR_SNAP_PX / zoom,
      });
      setConnectionDraft((prev) =>
        prev
          ? { ...prev, currentPoint: point, snapMatch: snapMatch ?? null }
          : null,
      );
      onArrowSnapPreviewChange?.(
        snapMatch
          ? {
              endpoint: "end",
              pointer: point,
              match: snapMatch,
            }
          : null,
      );
      return true;
    },
    [connectionDraft, findNearestAnchorSnap, onArrowSnapPreviewChange, zoom],
  );

  const updateHover = useCallback(
    (point: Point, currentTool: Tool, isDrawing: boolean) => {
      if (currentTool === "select") {
        const atPoint = getElementsAtPoint(point);
        const connectable = [...atPoint]
          .reverse()
          .find((element) => getElementConnectionHandles(element).length > 0);
        // A frame has no connection handles; it is hovered so its box can be shown.
        const hoverable = connectable ?? [...atPoint].reverse().find((element) => element.type === "frame");
        setHoveredElementId(hoverable?.id ?? null);
      } else {
        setHoveredElementId(null);
        if (isConnectorTool(currentTool) && !isDrawing && hasEditAccess) {
          const hover = findNearestAnchorSnap?.({
            point,
            radius: CONNECTOR_SNAP_PX / zoom,
          });
          onArrowSnapPreviewChange?.(
            hover ? { endpoint: "start", pointer: point, match: hover } : null,
          );
        }
      }
    },
    [findNearestAnchorSnap, getElementConnectionHandles, getElementsAtPoint, hasEditAccess, onArrowSnapPreviewChange, zoom],
  );

  const completeConnection = useCallback((): boolean => {
    if (!connectionDraft) return false;

    const targetSnap =
      connectionDraft.snapMatch ??
      findNearestAnchorSnap?.({
        point: connectionDraft.currentPoint,
        excludeElementIds: [connectionDraft.fromElementId],
        radius: CONNECTOR_SNAP_PX / zoom,
      }) ??
      null;

    const drop = addElementDirect
      ? resolveConnectionDrop({
          draft: connectionDraft,
          elements,
          candidates: targetSnap
            ? elements.filter((element) => element.id === targetSnap.elementId)
            : getElementsAtPoint(connectionDraft.currentPoint),
          snapAnchor: targetSnap?.anchor
            ? { id: targetSnap.anchor.id, name: targetSnap.anchor.side, x: targetSnap.anchor.x, y: targetSnap.anchor.y }
            : null,
          getHandles: getElementConnectionHandles,
        })
      : null;

    if (drop && addElementDirect) {
      const arrow = buildConnectorArrow({ id: generateId(), from: drop.from, to: drop.to, route: routeConnectedArrow });
      if (arrow) addElementDirect(arrow);
    }

    setConnectionDraft(null);
    setGesture("idle");
    onArrowSnapPreviewChange?.(null);
    resetScratch();
    return true;
  }, [
    addElementDirect,
    connectionDraft,
    elements,
    findNearestAnchorSnap,
    generateId,
    getElementConnectionHandles,
    getElementsAtPoint,
    onArrowSnapPreviewChange,
    resetScratch,
    routeConnectedArrow,
    setGesture,
    zoom,
  ]);

  const cancelConnection = useCallback(() => {
    setConnectionDraft(null);
    onArrowSnapPreviewChange?.(null);
  }, [onArrowSnapPreviewChange]);

  const clearHover = useCallback(() => {
    setHoveredElementId(null);
  }, []);

  return {
    hoveredElementId,
    connectionDraft,
    setConnectionDraft,
    getElementConnectionHandles,
    tryStartConnection,
    updateConnection,
    updateHover,
    completeConnection,
    cancelConnection,
    clearHover,
  };
}

