import { useCallback, useState } from "react";
import type {
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { MagneticSnapMatch } from "@/core/snap/magnetic-snap";
import type { Gesture } from "@/features/whiteboard/hooks/interaction/gesture-state";
import { minimumScale } from "@/core/groups/transform";
import { frameHandleAt } from "@/features/whiteboard/utils/selection-overlay";
import { resizeFrame } from "@/features/whiteboard/utils/frame-resize";
import { straightArrowPreview } from "@/features/whiteboard/hooks/interaction/draft-element";
import type { GestureScratch } from "@/features/whiteboard/hooks/interaction/gesture-scratch";
import type { GroupSelectionPort } from "@/features/whiteboard/hooks/interaction/use-whiteboard-drawing";
import { CONNECTOR_SNAP_PX, type ArrowSnapPreview } from "./use-connector-gesture";

export interface UseResizeGestureProps {
  elements: DrawingElement[];
  hasEditAccess: boolean;
  zoom: number;
  getResizeHandle: (point: Point, element: DrawingElement) => string | null;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  resizeFrameElements: (origin: DrawingElement[], from: Bounds, to: Bounds) => void;
  resizeElement: (
    elementId: string,
    handle: string,
    point: Point,
    originalBounds: Bounds,
    base?: DrawingElement,
  ) => DrawingElement | null;
  updateElement: (element: DrawingElement) => void;
  routeConnectedArrow?: (arrow: DrawingElement) => DrawingElement;
  bindArrowEndpoint?: (
    arrow: DrawingElement,
    endpoint: "start" | "end",
    point: Point,
    snap: MagneticSnapMatch | null,
  ) => DrawingElement;
  findNearestAnchorSnap?: (input: {
    point: Point;
    dragVector?: Point;
    previous?: MagneticSnapMatch | null;
    excludeElementIds?: string[];
    radius?: number;
  }) => MagneticSnapMatch | null;
  onArrowSnapPreviewChange?: (preview: ArrowSnapPreview | null) => void;
  scratchRef: React.RefObject<GestureScratch>;
  setGesture: (gesture: Gesture) => void;
}

export function useResizeGesture({
  elements,
  hasEditAccess,
  zoom,
  getResizeHandle,
  getElementBounds,
  resizeFrameElements,
  resizeElement,
  updateElement,
  routeConnectedArrow,
  bindArrowEndpoint,
  findNearestAnchorSnap,
  onArrowSnapPreviewChange,
  scratchRef,
  setGesture,
}: UseResizeGestureProps) {
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  const tryStartResize = useCallback(
    (
      point: Point,
      selection: GroupSelectionPort,
      selectedElements: string[],
      beginGesture?: () => void,
      setDragStart?: (pt: Point) => void,
    ): boolean => {
      // ── Frame handles of a group or multi-selection ───────────────────
      const frame = hasEditAccess ? selection.frame() : null;
      const frameHandle = frame ? frameHandleAt(frame.bounds, point, zoom) : null;
      if (frame && frameHandle) {
        beginGesture?.();
        setGesture("resizing");
        setResizeHandle(frameHandle.name);
        setDragStart?.(point);
        scratchRef.current.frameResize = {
          handle: frameHandle.name,
          origin: frame.elements,
          content: frame.bounds,
          grab: { x: point.x - frameHandle.x, y: point.y - frameHandle.y },
          minScale: minimumScale(frame.elements.flatMap((el) => getElementBounds(el) ?? [])),
        };
        return true;
      }

      // ── Single shape resize handles ───────────────────────────────────
      for (const elementId of selectedElements.length === 1 ? selectedElements : []) {
        const element = elements.find((el) => el.id === elementId);
        if (element) {
          const handle = getResizeHandle(point, element);
          if (handle && hasEditAccess && !selection.isLocked(element.id)) {
            beginGesture?.();
            setGesture("resizing");
            setResizeHandle(handle);
            setDragStart?.(point);
            scratchRef.current.lastResizePoint = point;
            scratchRef.current.previousSnap = { start: null, end: null };
            scratchRef.current.resizeInitialBounds = getElementBounds(element);
            scratchRef.current.resizeBase = element;
            return true;
          }
        }
      }

      return false;
    },
    [elements, getElementBounds, getResizeHandle, hasEditAccess, scratchRef, setGesture, zoom],
  );

  const updateResize = useCallback(
    (
      point: Point,
      e: React.MouseEvent<HTMLCanvasElement>,
      selectedElements: string[],
    ): boolean => {
      const frameResize = scratchRef.current.frameResize;
      if (frameResize) {
        const next = resizeFrame({
          content: frameResize.content,
          handle: frameResize.handle,
          pointer: point,
          grab: frameResize.grab,
          zoom,
          minScale: frameResize.minScale,
          keepAspect: e.shiftKey,
        });
        resizeFrameElements(frameResize.origin, frameResize.content, next);
        return true;
      }

      if (
        resizeHandle &&
        selectedElements.length === 1 &&
        scratchRef.current.resizeInitialBounds
      ) {
        const selectedElement = elements.find(
          (el) => el.id === selectedElements[0],
        );
        if (selectedElement) {
          let resizePoint = point;
          let snapMatch: MagneticSnapMatch | null = null;

          if (
            isArrowElement(selectedElement) &&
            (resizeHandle === "start" || resizeHandle === "end") &&
            findNearestAnchorSnap
          ) {
            const endpoint = resizeHandle;
            const previousPoint = scratchRef.current.lastResizePoint ?? point;
            const dragVector = {
              x: point.x - previousPoint.x,
              y: point.y - previousPoint.y,
            };

            snapMatch = findNearestAnchorSnap({
              point,
              dragVector,
              previous: scratchRef.current.previousSnap[endpoint],
              radius: CONNECTOR_SNAP_PX / zoom,
            });
            scratchRef.current.previousSnap[endpoint] = snapMatch;

            if (snapMatch) {
              resizePoint = {
                x: snapMatch.anchor.x,
                y: snapMatch.anchor.y,
              };
            }

            onArrowSnapPreviewChange?.(
              snapMatch
                ? {
                    endpoint,
                    pointer: point,
                    match: snapMatch,
                  }
                : null,
            );
          } else {
            onArrowSnapPreviewChange?.(null);
          }

          let updated = resizeElement(
            selectedElement.id,
            resizeHandle,
            resizePoint,
            scratchRef.current.resizeInitialBounds,
            scratchRef.current.resizeBase ?? undefined,
          );
          if (updated) {
            if (
              isArrowElement(updated) &&
              (resizeHandle === "start" || resizeHandle === "end")
            ) {
              const endpoint = resizeHandle;
              if (bindArrowEndpoint) {
                updated = bindArrowEndpoint(
                  updated,
                  endpoint,
                  point,
                  snapMatch,
                );
              }
              const previewArrow = straightArrowPreview(updated, point) as DrawingElement;
              updated = previewArrow;
              scratchRef.current.pendingArrowReroute = previewArrow;
            }
            updateElement(updated);
          }
        }
        scratchRef.current.lastResizePoint = point;
        return true;
      }

      return false;
    },
    [bindArrowEndpoint, elements, findNearestAnchorSnap, onArrowSnapPreviewChange, resizeElement, resizeFrameElements, resizeHandle, scratchRef, updateElement, zoom],
  );

  const completeResize = useCallback(() => {
    const { pendingArrowReroute } = scratchRef.current;
    if (pendingArrowReroute && routeConnectedArrow) {
      const rerouted = routeConnectedArrow(pendingArrowReroute);
      if (rerouted) {
        updateElement(rerouted);
      }
    }
    setResizeHandle(null);
  }, [routeConnectedArrow, scratchRef, updateElement]);

  const clearResize = useCallback(() => {
    setResizeHandle(null);
  }, []);

  return {
    resizeHandle,
    setResizeHandle,
    tryStartResize,
    updateResize,
    completeResize,
    clearResize,
  };
}
