import { classifyDraftCommit, growDraftElement, straightArrowPreview } from "./draft-element";
import { createScratch } from "./gesture-scratch";
import { useCallback, useRef, useState } from "react";
import {
  DrawingElement,
  Point,
  Tool,
  Bounds,
  ConnectionHandle,
} from "@/features/whiteboard/types/whiteboard.types";
import { getConnectionHandles } from "@/features/whiteboard/utils/canvas-render-utils";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";
import { createShape } from "@/core/shapes/shape-runtime";
import { buildConnectorArrow, handleUnderPoint, resolveConnectionDrop } from "@/features/whiteboard/hooks/interaction/connector-arrow";
import { resolveClickSelection } from "@/features/whiteboard/hooks/interaction/selection";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import { computeDrag, startDragSession, type Guide } from "@/features/whiteboard/hooks/interaction/drag-session";
import { isActive, isDrawingGesture, type Gesture } from "@/features/whiteboard/hooks/interaction/gesture-state";

/** Pixels (on screen) within which a dragged shape snaps to another shape's edge or centre. */
const SNAP_SCREEN_PX = 6;

interface ConnectionDraft {
  fromElementId: string;
  fromAnchorId: string;
  fromHandle: ConnectionHandle;
  currentPoint: Point;
  snapMatch: MagneticSnapMatch | null;
}

interface ArrowSnapPreview {
  endpoint: "start" | "end";
  pointer: Point;
  match: MagneticSnapMatch;
}

const TOOL_TO_SHAPE_TYPE: Partial<Record<Tool, DrawingElement["type"]>> = {
  pen: "freehand",
  // Other tools will fall back to their name if they exist in shapeRegistry
};

/** Connector snap distance in screen pixels (divided by zoom to get world units). */
const CONNECTOR_SNAP_PX = 14;
/** Reach of a connection handle, in world units. */
const CONNECTION_HANDLE_RADIUS = 12;
const isConnectorTool = (tool: Tool) =>
  tool === "arrow" || tool === "arrow-bidirectional";

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
  const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
  const scratchRef = useRef(createScratch());
  const resetScratch = useCallback(() => {
    scratchRef.current = createScratch();
  }, []);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  // Connection handle state
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);

  // Multi-selection state
  const [selectionBox, setSelectionBox] = useState<{
    start: Point;
    end: Point;
  } | null>(null);

  /** Get the 4 connection handle positions for an element (world coords) */
  const getElementConnectionHandles = useCallback(
    (element: DrawingElement) => {
      const bounds = getElementBounds(element);
      return getConnectionHandles(element, bounds);
    },
    [getElementBounds],
  );

  // Mouse event handlers
  // A pointer-down while a gesture is still marked active means its pointer-up never arrived (released
  // outside the window, a lost capture). Finish that gesture's leftovers instead of starting on top of it.
  const resetStaleGesture = useCallback(() => {
    setGesture("idle");
    setConnectionDraft(null);
    setCurrentElement(null);
    setSelectionBox(null);
    setResizeHandle(null);
    setDragStart(null);
    setAlignmentGuides([]);
    resetScratch();
    stopPanning();
    endGesture?.();
    onArrowSnapPreviewChange?.(null);
  }, [setGesture, setCurrentElement, resetScratch, stopPanning, endGesture, onArrowSnapPreviewChange]);

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
        if (hasEditAccess && hoveredElementId && !grabsArrowEnd) {
          const hoveredEl = elements.find((el) => el.id === hoveredElementId);
          if (hoveredEl) {
            const handle = handleUnderPoint(getElementConnectionHandles(hoveredEl), point, CONNECTION_HANDLE_RADIUS);
            if (handle) {
              setGesture("connecting");
              setConnectionDraft({
                fromElementId: hoveredElementId,
                fromAnchorId: handle.id,
                fromHandle: handle.name,
                currentPoint: point,
                snapMatch: null,
              });
              return;
            }
          }
        }

        // ── Existing resize / select / drag logic ─────────────────────────
        let foundResizeHandle = false;
        for (const elementId of selectedElements) {
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            const handle = getResizeHandle(point, element);
            if (handle && hasEditAccess) {
              beginGesture?.();
              setGesture("resizing");
              setResizeHandle(handle);
              setDragStart(point);
              scratchRef.current.lastResizePoint = point;
              scratchRef.current.previousSnap = { start: null, end: null };
              scratchRef.current.resizeInitialBounds = getElementBounds(element);
              scratchRef.current.resizeBase = element;
              foundResizeHandle = true;
              break;
            }
          }
        }

        if (foundResizeHandle) {
          return;
        }

        const elementsAtPoint = getElementsAtPoint(point);
        const hit = elementsAtPoint[elementsAtPoint.length - 1] ?? null;
        const outcome = resolveClickSelection({
          selected: selectedElements,
          hitId: hit?.id ?? null,
          additive: e.ctrlKey || e.metaKey || e.shiftKey,
        });
        setSelectedElements(outcome.selected);
        scratchRef.current.collapseOnRelease = outcome.collapseOnRelease
          ? { id: outcome.collapseOnRelease, origin: point }
          : null;

        if (outcome.startDrag && hasEditAccess) {
          beginGesture?.();
          scratchRef.current.dragSession = startDragSession(outcome.selected, elements, point, getElementBounds);
          setGesture("dragging");
          setDragStart(point);
        } else if (!hit && hasEditAccess) {
          setGesture("marquee");
          setSelectionBox({ start: point, end: point });
        }
        return;
      }

      if (currentTool === "eraser") {
        if (!hasEditAccess) return;
        const elementsToDelete = getElementsAtPoint(point, eraserSize / 2);
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

      const shapeType = TOOL_TO_SHAPE_TYPE[currentTool] || currentTool;
      
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
      currentTool,
      getMousePosition,
      currentColor,
      strokeWidth,
      fillColor,
      getElementsAtPoint,
      deleteElements,
      selectedElements,
      getResizeHandle,
      elements,
      hasEditAccess,
      generateId,
      setSelectedElements,
      setCurrentElement,
      startPanning,
      eraserSize,
      getElementBounds,
      hoveredElementId,
      getElementConnectionHandles,
      beginGesture,
      findNearestAnchorSnap,
      onArrowSnapPreviewChange,
      zoom,
      resetStaleGesture,
      setGesture,
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
      if (currentTool === "select") {
        // If dragging a connection, just update its endpoint
        if (connectionDraft) {
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
          return;
        }

        // Update hovered element (shape nodes expose connection handles)
        const atPoint = getElementsAtPoint(point);
        const connectable = [...atPoint]
          .reverse()
          .find((element) => getElementConnectionHandles(element).length > 0);
        setHoveredElementId(connectable?.id ?? null);
      } else {
        // Clear hover when not on select tool
        setHoveredElementId(null);
        // Connector tool: show where the arrow would attach before the press.
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

      if (currentTool === "select" && hasEditAccess) {
        if (isSelectingArea && selectionBox) {
          setSelectionBox({
            start: selectionBox.start,
            end: point,
          });
          return;
        }

        if (dragStart) {
          if (
            isResizing &&
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
            return;
          }

          if (isDragging && selectedElements.length > 0) {
            const pending = scratchRef.current.collapseOnRelease;
            if (
              pending &&
              Math.hypot(point.x - pending.origin.x, point.y - pending.origin.y) > 3
            ) {
              scratchRef.current.collapseOnRelease = null;
            }
            const session = scratchRef.current.dragSession;
            if (session) {
              const { dx, dy, guides } = computeDrag({
                start: session.start,
                point,
                selection: session.selection,
                targets: session.targets,
                threshold: SNAP_SCREEN_PX / zoom,
                snap: !e.altKey,
              });
              moveElements(session.origin, dx, dy);
              setAlignmentGuides(guides);
            }
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
          );
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
      isDrawing,
      currentElement,
      getMousePosition,
      currentTool,
      setCurrentElement,
      handlePan,
      eraserSize,
      getElementsOnPath,
      dragStart,
      isDragging,
      isResizing,
      isSelectingArea,
      selectionBox,
      resizeHandle,
      selectedElements,
      elements,
      resizeElement,
      updateElement,
      moveElements,
      zoom,
      hasEditAccess,
      deleteElements,
      connectionDraft,
      getElementsAtPoint,
      findNearestAnchorSnap,
      bindArrowEndpoint,
      routeConnectedArrow,
      onArrowSnapPreviewChange,
    ],
  );

  /**
   * Abandon whatever the user is in the middle of creating (a shape being
   * drawn, a connector being dragged, a marquee) without committing it.
   * Returns false when there was nothing to cancel. Moves and resizes are not
   * covered: they have already been written to the shared board.
   */
  const cancelDrawing = useCallback((): boolean => {
    const creating =
      isDrawing && currentElement !== null && currentTool !== "eraser";
    if (!creating && !connectionDraft && !isSelectingArea) return false;

    setCurrentElement(null);
    setGesture("idle");
    setConnectionDraft(null);
    setSelectionBox(null);
    resetScratch();
    onArrowSnapPreviewChange?.(null);
    return true;
  }, [
    isDrawing,
    currentElement,
    currentTool,
    connectionDraft,
    isSelectingArea,
    setCurrentElement,
    resetScratch,
    onArrowSnapPreviewChange,
  ]);

  const stopDrawing = useCallback(() => {
    // ── Complete a connection drag ────────────────────────────────────────
    if (connectionDraft) {
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
      return;
    }

    const { collapseOnRelease: collapseTo, pendingArrowReroute } = scratchRef.current;
    resetScratch();
    if (collapseTo) setSelectedElements([collapseTo.id]);

    if (isSelectingArea && selectionBox) {
      if (
        Math.abs(selectionBox.start.x - selectionBox.end.x) > 5 ||
        Math.abs(selectionBox.start.y - selectionBox.end.y) > 5
      ) {
        const intersectedElements = getElementsInBounds(
          selectionBox.start,
          selectionBox.end,
        );
        setSelectedElements(intersectedElements.map((el) => el.id));
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
        if (commit === "connected-arrow" && routeConnectedArrow && addElementDirect) {
          addElementDirect(routeConnectedArrow(currentElement));
        } else {
          completeCurrentElement();
        }
        if (currentElement.type !== "freehand") onElementCreated?.(currentElement.id);
      }
    }

    if (pendingArrowReroute && routeConnectedArrow) {
      const rerouted = routeConnectedArrow(pendingArrowReroute);
      if (rerouted) {
        updateElement(rerouted);
      }
    }

    // Everything the gesture wrote (including the final arrow reroute above) is
    // now one undo step.
    endGesture?.();

    setGesture("idle");
    setCurrentElement(null);
    stopPanning();
    setSelectionBox(null);
    setResizeHandle(null);
    setDragStart(null);
    setAlignmentGuides([]);
    onArrowSnapPreviewChange?.(null);
  }, [
    isDrawing,
    currentElement,
    completeCurrentElement,
    currentTool,
    isSelectingArea,
    selectionBox,
    getElementsInBounds,
    hasEditAccess,
    endGesture,
    setCurrentElement,
    setSelectedElements,
    stopPanning,
    connectionDraft,
    getElementsAtPoint,
    findNearestAnchorSnap,
    addElementDirect,
    elements,
    getElementConnectionHandles,
    generateId,
    onArrowSnapPreviewChange,
    routeConnectedArrow,
    updateElement,
    onElementCreated,
    resetScratch,
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
    alignmentGuides,
    textPosition,

    // Connection state
    hoveredElementId,
    connectionDraft,

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
