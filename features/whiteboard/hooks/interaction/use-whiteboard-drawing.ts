import { outlineVariantOfTool } from "@/core/shapes/outline/variants";
import { withFrameContents } from "@/core/frames/payload";
import { classifyDraftCommit, growDraftElement } from "./draft-element";
import { createScratch } from "./gesture-scratch";
import { useCallback, useRef, useState } from "react";
import {
  DrawingElement,
  Point,
  Tool,
  Bounds,
} from "@/features/whiteboard/types/whiteboard.types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { MagneticSnapMatch } from "@/core/snap/magnetic-snap";
import { createShape } from "@/core/shapes/shape-runtime";
import type { ClickOutcome } from "@/features/whiteboard/hooks/interaction/group-selection";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import type { GroupIndex } from "@/core/groups/group-index";
import type { SnapSettings } from "@/features/whiteboard/utils/snap-settings";
import { isActive, isDrawingGesture, type Gesture } from "@/features/whiteboard/hooks/interaction/gesture-state";
import {
  useConnectorGesture,
  useResizeGesture,
  useDragGesture,
  type ConnectionDraft,
  type ArrowSnapPreview,
  CONNECTOR_SNAP_PX,
  isConnectorTool,
} from "./gestures";

export type { ConnectionDraft, ArrowSnapPreview };

const TOOL_TO_SHAPE_TYPE: Partial<Record<Tool, DrawingElement["type"]>> = {
  pen: "freehand",
  // Other tools will fall back to their name if they exist in shapeRegistry
};

/**
 * What the pointer code needs to know about composite groups and locks. The controller supplies it,
 * so this hook neither knows how groups are stored nor how a click is resolved against them.
 */
export interface GroupSelectionPort {
  /** What a press on `hitId` (null = empty canvas) selects, given the current selection and entered group. */
  resolveClick: (input: { selected: string[]; hitId: string | null; additive: boolean }) => ClickOutcome;
  /** What a marquee that touched `hitIds` selects. */
  resolveMarquee: (hitIds: string[]) => { selected: string[]; context: string | null };
  /** True for a shape that is locked itself or sits inside a locked group. */
  isLocked: (shapeId: string) => boolean;
  /** Step into (or out of) a group. */
  setContext: (groupId: string | null) => void;
  /** The frame (and the shapes behind it) of a group or multi-selection that can be resized; null otherwise. */
  frame: () => { bounds: Bounds; elements: DrawingElement[] } | null;
  /** How the board nests, and the group being edited: distances are measured between whole groups. */
  index: GroupIndex;
  context: string | null;
}

interface UseWhiteboardDrawingProps {
  currentTool: Tool;
  currentColor: string;
  strokeWidth: number;
  fillColor: string;
  hasEditAccess: boolean;
  getMousePosition: (e: React.MouseEvent<HTMLCanvasElement>) => Point;
  generateId: () => string;
  getElementsAtPoint: (point: Point, radius?: number) => DrawingElement[];
  getElementsInBounds: (start: Point, end: Point) => DrawingElement[];
  getResizeHandle: (point: Point, element: DrawingElement) => string | null;
  deleteElements: (elementIds: string[]) => void;
  /** Writes `origin` (the elements as they were when the drag began) moved by the total delta. */
  moveElements: (origin: DrawingElement[], deltaX: number, deltaY: number) => void;
  zoom: number;
  selection: GroupSelectionPort;
  /** How dragging snaps (tolerance in screen pixels, spacing, distances). Alt always suspends it. */
  snapSettings: SnapSettings;
  /** Absolute y of a text element's first baseline, for baseline guides. */
  baselineOf?: (element: DrawingElement) => number | null;
  /** Writes `origin` (the shapes as they were when the resize began) scaled from the box `from` onto `to`. */
  resizeFrameElements: (origin: DrawingElement[], from: Bounds, to: Bounds) => void;
  resizeElement: (
    elementId: string,
    handle: string,
    point: Point,
    originalBounds: Bounds,
    base?: DrawingElement,
  ) => DrawingElement | null;
  updateElement: (element: DrawingElement) => void;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  getElementsOnPath: (p1: Point, p2: Point, radius: number) => DrawingElement[];
  eraserSize: number;
  // State management
  currentElement: DrawingElement | null;
  setCurrentElement: (element: DrawingElement | null) => void;
  selectedElements: string[];
  setSelectedElements: (
    elements: string[] | ((prev: string[]) => string[]),
  ) => void;
  elements: DrawingElement[];
  completeCurrentElement: () => void;
  /** Group everything between begin and end into one undo step. */
  beginGesture?: () => void;
  endGesture?: () => void;
  findNearestAnchorSnap?: (input: {
    point: Point;
    dragVector?: Point;
    previous?: MagneticSnapMatch | null;
    excludeElementIds?: string[];
    radius?: number;
  }) => MagneticSnapMatch | null;
  bindArrowEndpoint?: (
    arrow: DrawingElement,
    endpoint: "start" | "end",
    point: Point,
    snap: MagneticSnapMatch | null,
  ) => DrawingElement;
  routeConnectedArrow?: (arrow: DrawingElement) => DrawingElement;
  onArrowSnapPreviewChange?: (preview: ArrowSnapPreview | null) => void;
  /** Called to directly add a completed arrow element (used for connection drops) */
  addElementDirect?: (element: DrawingElement) => void;
  /** A shape, line or connector was just drawn: the editor selects it and returns to the select tool. */
  onElementCreated?: (id: string) => void;
  /** A frame was drawn out. The frame tool hands over its box instead of adding the draft, so the host can adopt what it covers. */
  onFrameDrawn?: (frame: DrawingElement) => void;
  /** A drag just ended: these shapes were moved (inside the same undo step). The editor re-homes them in frames. */
  onDragCommit?: (movedIds: string[]) => void;
  // Viewport
  startPanning: (point: Point) => void;
  handlePan: (point: Point) => void;
  stopPanning: () => void;
}

export const useWhiteboardDrawing = ({
  currentTool,
  currentColor,
  strokeWidth,
  fillColor,
  hasEditAccess,
  getMousePosition,
  generateId,
  getElementsAtPoint,
  getElementsInBounds,
  getResizeHandle,
  deleteElements,
  moveElements,
  zoom,
  selection,
  snapSettings,
  baselineOf,
  resizeFrameElements,
  resizeElement,
  updateElement,
  getElementBounds,
  getElementsOnPath,
  eraserSize,
  currentElement,
  setCurrentElement,
  selectedElements,
  setSelectedElements,
  elements,
  completeCurrentElement,
  beginGesture,
  endGesture,
  findNearestAnchorSnap,
  bindArrowEndpoint,
  routeConnectedArrow,
  onArrowSnapPreviewChange,
  addElementDirect,
  onElementCreated,
  onFrameDrawn,
  onDragCommit,
  startPanning,
  handlePan,
  stopPanning,
}: UseWhiteboardDrawingProps) => {
  // One gesture at a time: the booleans below are derived from it, never set on their own.
  const [gesture, setGestureState] = useState<Gesture>("idle");
  const gestureRef = useRef<Gesture>("idle");
  const setGesture = useCallback((next: Gesture) => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);
  const isDrawing = isDrawingGesture(gesture);
  const isDragging = gesture === "dragging";
  const isResizing = gesture === "resizing";
  const isSelectingArea = gesture === "marquee";

  const scratchRef = useRef(createScratch());
  const resetScratch = useCallback(() => {
    scratchRef.current = createScratch();
  }, []);

  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);

  // Multi-selection state
  const [selectionBox, setSelectionBox] = useState<{
    start: Point;
    end: Point;
  } | null>(null);

  // ── Strategy Hooks ────────────────────────────────────────────────────────
  const connectorGesture = useConnectorGesture({
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
  });

  const resizeGesture = useResizeGesture({
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
  });

  const dragGesture = useDragGesture({
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
  });

  // A pointer-down while a gesture is still marked active means its pointer-up never arrived.
  const resetStaleGesture = useCallback(() => {
    setGesture("idle");
    connectorGesture.cancelConnection();
    setCurrentElement(null);
    setSelectionBox(null);
    resizeGesture.clearResize();
    dragGesture.clearDrag();
    resetScratch();
    stopPanning();
    endGesture?.();
    onArrowSnapPreviewChange?.(null);
  }, [
    connectorGesture,
    dragGesture,
    endGesture,
    onArrowSnapPreviewChange,
    resetScratch,
    resizeGesture,
    setCurrentElement,
    setGesture,
    stopPanning,
  ]);

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isActive(gestureRef.current)) resetStaleGesture();
      if (
        !hasEditAccess &&
        currentTool !== "hand" &&
        currentTool !== "select"
      ) {
        return;
      }

      const point = getMousePosition(e);

      if (currentTool === "hand") {
        startPanning(point);
        return;
      }

      if (currentTool === "text") {
        // Text is completely handled at the page level now.
        return;
      }

      if (currentTool === "select") {
        // A selected arrow's end sits on its target's connection handle; grabbing it must move the
        // arrow end, not start a second connector from the target.
        const grabsArrowEnd = selectedElements.some((id) => {
          const element = elements.find((el) => el.id === id);
          if (!element || !isArrowElement(element)) return false;
          const handle = getResizeHandle(point, element);
          return handle === "start" || handle === "end";
        });

        // ── Connection handle check (takes priority over resize/select) ──────
        if (connectorGesture.tryStartConnection(point, grabsArrowEnd)) {
          return;
        }

        // ── Frame handles & shape resize handles ───────────────────────────
        if (
          resizeGesture.tryStartResize(
            point,
            selection,
            selectedElements,
            beginGesture,
            dragGesture.setDragStart,
          )
        ) {
          return;
        }

        const elementsAtPoint = getElementsAtPoint(point);
        const hit = elementsAtPoint[elementsAtPoint.length - 1] ?? null;
        const outcome = selection.resolveClick({
          selected: selectedElements,
          hitId: hit?.id ?? null,
          additive: e.ctrlKey || e.metaKey || e.shiftKey,
        });
        selection.setContext(outcome.context);
        setSelectedElements(outcome.selected);
        scratchRef.current.collapseOnRelease = outcome.collapseOnRelease
          ? { ids: outcome.collapseOnRelease, origin: point }
          : null;

        // Locked shapes can be selected but never dragged; the rest of a mixed selection still moves.
        // A frame moves with everything it owns, though only the frame is selected.
        const movable = withFrameContents(elements, outcome.selected).filter((id) => !selection.isLocked(id));
        if (outcome.startDrag && dragGesture.tryStartDrag(point, movable, selection, beginGesture)) {
          return;
        } else if (!hit && hasEditAccess) {
          setGesture("marquee");
          setSelectionBox({ start: point, end: point });
        }
        return;
      }

      if (currentTool === "eraser") {
        if (!hasEditAccess) return;
        // The eraser leaves frames alone (they hold other shapes); a frame is deleted by selecting it.
        const elementsToDelete = getElementsAtPoint(point, eraserSize / 2).filter((el) => el.type !== "frame");
        beginGesture?.();
        if (elementsToDelete.length > 0) {
          deleteElements(elementsToDelete.map((el) => el.id));
        }
        setGesture("erasing");
        scratchRef.current.lastPoint = point;
        return;
      }

      if (!hasEditAccess) return;

      setGesture("drawing");

      // Every outline variant draws as an "outline" element; the tool name carries which.
      const outlineVariant = outlineVariantOfTool(currentTool);
      const shapeType = outlineVariant !== null ? "outline" : TOOL_TO_SHAPE_TYPE[currentTool] || currentTool;
      
      const shapeDef = shapeRegistry.get(shapeType as DrawingElement["type"]);
      if (!shapeDef) return;

      // A connector begins on the shape under the pointer, not at the raw pointer.
      const startSnap = isConnectorTool(currentTool)
        ? (findNearestAnchorSnap?.({
            point,
            radius: CONNECTOR_SNAP_PX / zoom,
          }) ?? null)
        : null;
      scratchRef.current.arrowSnap = { start: startSnap, end: null };
      onArrowSnapPreviewChange?.(null);

      const newElement = createShape(shapeType as DrawingElement["type"], {
        id: generateId(),
        ...(outlineVariant !== null ? { variant: outlineVariant } : {}),
        points: [startSnap ? { x: startSnap.anchor.x, y: startSnap.anchor.y } : point],
        startConnection: startSnap
          ? { elementId: startSnap.elementId, anchorId: startSnap.anchor.id }
          : undefined,
        color: currentColor,
        strokeWidth,
        fill: fillColor !== "#transparent" ? fillColor : undefined,
        dashed: false,
        arrowHeadStart: currentTool === "arrow-bidirectional",
        arrowHeadEnd:
          currentTool === "arrow" || currentTool === "arrow-bidirectional",
        routingMode:
          currentTool === "arrow" || currentTool === "arrow-bidirectional"
            ? "orthogonal"
            : undefined,
        isManuallyRouted: false,
      });

      if (newElement) {
        setCurrentElement(newElement);
      }
    },
    [
      beginGesture,
      connectorGesture,
      currentColor,
      currentTool,
      deleteElements,
      dragGesture,
      elements,
      eraserSize,
      fillColor,
      findNearestAnchorSnap,
      generateId,
      getElementsAtPoint,
      getMousePosition,
      getResizeHandle,
      hasEditAccess,
      onArrowSnapPreviewChange,
      resetStaleGesture,
      resizeGesture,
      selectedElements,
      selection,
      setCurrentElement,
      setGesture,
      setSelectedElements,
      startPanning,
      strokeWidth,
      zoom,
    ],
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getMousePosition(e);
      setCursorPosition(point);

      if (currentTool === "hand") {
        handlePan(point);
        return;
      }

      // ── Track hovered shape for connection handles ───────────────────────
      if (connectorGesture.updateConnection(point)) {
        return;
      }
      connectorGesture.updateHover(point, currentTool, isDrawing);

      if (currentTool === "select" && hasEditAccess) {
        if (isSelectingArea && selectionBox) {
          setSelectionBox({
            start: selectionBox.start,
            end: point,
          });
          return;
        }

        if (dragGesture.dragStart) {
          if (isResizing && resizeGesture.updateResize(point, e, selectedElements)) {
            return;
          }

          if (isDragging && dragGesture.updateDrag(point, e)) {
            return;
          }
        }
      }

      if (!isDrawing || !hasEditAccess) return;

      if (currentTool === "eraser") {
        if (scratchRef.current.lastPoint) {
          const elementsToDelete = getElementsOnPath(
            scratchRef.current.lastPoint,
            point,
            eraserSize / 2,
          ).filter((el) => el.type !== "frame");
          if (elementsToDelete.length > 0) {
            deleteElements(elementsToDelete.map((el) => el.id));
          }
        }
        scratchRef.current.lastPoint = point;
        return;
      }

      if (!currentElement) return;

      let endSnap: MagneticSnapMatch | null = null;
      if (isArrowElement(currentElement)) {
        endSnap =
          findNearestAnchorSnap?.({
            point,
            previous: scratchRef.current.arrowSnap.end,
            excludeElementIds: currentElement.startConnection
              ? [currentElement.startConnection.elementId]
              : undefined,
            radius: CONNECTOR_SNAP_PX / zoom,
          }) ?? null;
        scratchRef.current.arrowSnap.end = endSnap;
        onArrowSnapPreviewChange?.(
          endSnap ? { endpoint: "end", pointer: point, match: endSnap } : null,
        );
      }
      setCurrentElement(growDraftElement(currentElement, point, endSnap));
    },
    [
      connectorGesture,
      currentElement,
      currentTool,
      deleteElements,
      dragGesture,
      eraserSize,
      findNearestAnchorSnap,
      getElementsOnPath,
      getMousePosition,
      handlePan,
      hasEditAccess,
      isDragging,
      isDrawing,
      isResizing,
      isSelectingArea,
      onArrowSnapPreviewChange,
      resizeGesture,
      selectedElements,
      selectionBox,
      setCurrentElement,
      zoom,
    ],
  );

  /**
   * Abandon whatever the user is in the middle of creating (a shape being
   * drawn, a connector being dragged, a marquee) without committing it.
   */
  const cancelDrawing = useCallback((): boolean => {
    const creating =
      isDrawing && currentElement !== null && currentTool !== "eraser";
    if (!creating && !connectorGesture.connectionDraft && !isSelectingArea) return false;

    setCurrentElement(null);
    setGesture("idle");
    connectorGesture.cancelConnection();
    setSelectionBox(null);
    resetScratch();
    onArrowSnapPreviewChange?.(null);
    return true;
  }, [
    connectorGesture,
    currentElement,
    currentTool,
    isDrawing,
    isSelectingArea,
    onArrowSnapPreviewChange,
    resetScratch,
    setCurrentElement,
    setGesture,
  ]);

  const stopDrawing = useCallback(() => {
    // ── Complete a connection drag ────────────────────────────────────────
    if (connectorGesture.completeConnection()) {
      return;
    }

    resetScratch();

    resizeGesture.completeResize();
    dragGesture.completeDrag();

    if (isSelectingArea && selectionBox) {
      if (
        Math.abs(selectionBox.start.x - selectionBox.end.x) > 5 ||
        Math.abs(selectionBox.start.y - selectionBox.end.y) > 5
      ) {
        const intersectedElements = getElementsInBounds(
          selectionBox.start,
          selectionBox.end,
        );
        const picked = selection.resolveMarquee(intersectedElements.map((el) => el.id));
        setSelectedElements(picked.selected);
        selection.setContext(picked.context);
      }
      setSelectionBox(null);
    }

    if (
      isDrawing &&
      currentElement &&
      currentTool !== "eraser" &&
      hasEditAccess
    ) {
      const commit = classifyDraftCommit(currentElement);
      if (commit !== "click") {
        if (currentElement.type === "frame" && onFrameDrawn) {
          onFrameDrawn(currentElement);
        } else if (commit === "connected-arrow" && routeConnectedArrow && addElementDirect) {
          addElementDirect(routeConnectedArrow(currentElement));
        } else {
          completeCurrentElement();
        }
        if (currentElement.type !== "freehand") onElementCreated?.(currentElement.id);
      }
    }

    // Everything the gesture wrote is now one undo step.
    endGesture?.();

    setGesture("idle");
    setCurrentElement(null);
    stopPanning();
    setSelectionBox(null);
    onArrowSnapPreviewChange?.(null);
  }, [
    addElementDirect,
    completeCurrentElement,
    connectorGesture,
    currentElement,
    currentTool,
    dragGesture,
    endGesture,
    getElementsInBounds,
    hasEditAccess,
    isDrawing,
    isSelectingArea,
    onArrowSnapPreviewChange,
    onElementCreated,
    onFrameDrawn,
    resetScratch,
    resizeGesture,
    routeConnectedArrow,
    selection,
    selectionBox,
    setCurrentElement,
    setGesture,
    setSelectedElements,
    stopPanning,
  ]);

  // Text handling
  const handleTextSubmit = useCallback(
    (text: string, fontSize: number) => {
      if (!hasEditAccess) {
        return false;
      }

      if (text && textPosition) {
        const textElement = createShape("text", {
          id: generateId(),
          points: [textPosition],
          color: currentColor,
          strokeWidth,
          text,
          fontSize,
        });

        if (!textElement) {
          return false;
        }

        setCurrentElement(textElement);
        completeCurrentElement();
        setTextPosition(null);
        return true;
      }
      return false;
    },
    [
      textPosition,
      currentColor,
      strokeWidth,
      hasEditAccess,
      generateId,
      setCurrentElement,
      completeCurrentElement,
    ],
  );

  const handleTextCancel = useCallback(() => {
    setTextPosition(null);
  }, []);

  return {
    // State
    gesture,
    isDrawing,
    isDragging,
    isResizing,
    isSelectingArea,
    selectionBox,
    alignmentGuides: dragGesture.alignmentGuides,
    alignmentSpans: dragGesture.alignmentSpans,
    textPosition,

    // Connection state
    hoveredElementId: connectorGesture.hoveredElementId,
    connectionDraft: connectorGesture.connectionDraft,

    // Actions
    startDrawing,
    draw,
    stopDrawing,
    cancelDrawing,
    handleTextSubmit,
    handleTextCancel,
    cursorPosition,
    setCursorPosition,

    // Computed
    hasActiveDrawing: isActive(gesture),
  };
};
