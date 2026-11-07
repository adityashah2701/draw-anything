import { useCallback, useState } from "react";
import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  computeSmartDrag,
  startDragSession,
  type Guide,
  type Span,
} from "@/features/whiteboard/hooks/interaction/drag-session";
import {
  isSnapSuppressed,
  snapThreshold,
  type SnapSettings,
} from "@/features/whiteboard/utils/snap-settings";
import type { Gesture } from "@/features/whiteboard/hooks/interaction/gesture-state";
import type { GestureScratch } from "@/features/whiteboard/hooks/interaction/gesture-scratch";
import type { GroupSelectionPort } from "@/features/whiteboard/hooks/interaction/use-whiteboard-drawing";

export interface UseDragGestureProps {
  elements: DrawingElement[];
  hasEditAccess: boolean;
  zoom: number;
  snapSettings: SnapSettings;
  baselineOf?: (element: DrawingElement) => number | null;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  moveElements: (origin: DrawingElement[], deltaX: number, deltaY: number) => void;
  setSelectedElements: (
    elements: string[] | ((prev: string[]) => string[]),
  ) => void;
  onDragCommit?: (movedIds: string[]) => void;
  scratchRef: React.RefObject<GestureScratch>;
  setGesture: (gesture: Gesture) => void;
}

export function useDragGesture({
  elements,
  hasEditAccess,
  zoom,
  snapSettings,
  baselineOf,
  getElementBounds,
  moveElements,
  setSelectedElements,
  onDragCommit,
  scratchRef,
  setGesture,
}: UseDragGestureProps) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
  const [alignmentSpans, setAlignmentSpans] = useState<Span[]>([]);

  const tryStartDrag = useCallback(
    (
      point: Point,
      movable: string[],
      selection: GroupSelectionPort,
      beginGesture?: () => void,
    ): boolean => {
      if (hasEditAccess && movable.length > 0) {
        beginGesture?.();
        scratchRef.current.dragSession = startDragSession(
          movable,
          elements,
          point,
          getElementBounds,
          {
            index: selection.index,
            context: selection.context,
            baselineOf,
          },
        );
        setGesture("dragging");
        setDragStart(point);
        return true;
      }
      return false;
    },
    [baselineOf, elements, getElementBounds, hasEditAccess, scratchRef, setGesture],
  );

  const updateDrag = useCallback(
    (point: Point, e: React.MouseEvent<HTMLCanvasElement>): boolean => {
      if (!dragStart) return false;

      const pending = scratchRef.current.collapseOnRelease;
      if (
        pending &&
        Math.hypot(point.x - pending.origin.x, point.y - pending.origin.y) > 3
      ) {
        scratchRef.current.collapseOnRelease = null;
      }

      const session = scratchRef.current.dragSession;
      if (session) {
        const { dx, dy, guides, spans } = computeSmartDrag({
          session,
          point,
          threshold: snapThreshold(snapSettings, zoom),
          snap: snapSettings.enabled && !isSnapSuppressed(e),
          options: { spacing: snapSettings.spacing, measures: snapSettings.distances },
        });
        if (dx !== 0 || dy !== 0) scratchRef.current.dragMoved = true;
        moveElements(session.origin, dx, dy);
        setAlignmentGuides(guides);
        setAlignmentSpans(spans);
        return true;
      }

      return false;
    },
    [dragStart, moveElements, scratchRef, snapSettings, zoom],
  );

  const completeDrag = useCallback(() => {
    const { collapseOnRelease: collapseTo } = scratchRef.current;
    const dragged = scratchRef.current.dragMoved ? scratchRef.current.dragSession : null;

    if (collapseTo) setSelectedElements(collapseTo.ids);
    if (dragged && hasEditAccess) {
      onDragCommit?.(dragged.origin.map((element) => element.id));
    }

    setDragStart(null);
    setAlignmentGuides([]);
    setAlignmentSpans([]);
  }, [hasEditAccess, onDragCommit, scratchRef, setSelectedElements]);

  const clearDrag = useCallback(() => {
    setDragStart(null);
    setAlignmentGuides([]);
    setAlignmentSpans([]);
  }, []);

  return {
    dragStart,
    setDragStart,
    alignmentGuides,
    alignmentSpans,
    tryStartDrag,
    updateDrag,
    completeDrag,
    clearDrag,
  };
}

