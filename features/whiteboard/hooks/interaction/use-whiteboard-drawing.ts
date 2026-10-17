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
import { buildConnectorArrow } from "@/features/whiteboard/hooks/interaction/connector-arrow";
import { resolveClickSelection } from "@/features/whiteboard/hooks/interaction/selection";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import { computeDrag, unionBounds, type Guide } from "@/features/whiteboard/hooks/interaction/drag-session";

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
/** A drag shorter than this (world units, both axes) is a click, not a shape. */
const MIN_DRAWN_SIZE = 4;
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
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
  // What a drag started from. Positions are always origin + total travel, so a missed or repeated
  // pointer event cannot make a shape drift away from the cursor.
  const dragSessionRef = useRef<{
    start: Point;
    origin: DrawingElement[];
    selection: Bounds;
    targets: Bounds[];
  } | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const resizeInitialBoundsRef = useRef<Bounds | null>(null);
  const lastResizePointRef = useRef<Point | null>(null);
  const pendingArrowRerouteRef = useRef<DrawingElement | null>(null);
  // A plain click on one member of a multi-selection: collapse to it on release unless the pointer moved.
  const collapseOnReleaseRef = useRef<{ id: string; origin: Point } | null>(null);
  const previousSnapRef = useRef<{
    start: MagneticSnapMatch | null;
    end: MagneticSnapMatch | null;
  }>({ start: null, end: null });

  // Shapes a new connector snapped to at each end while it is being drawn.
  const arrowSnapRef = useRef<{
    start: MagneticSnapMatch | null;
    end: MagneticSnapMatch | null;
  }>({ start: null, end: null });

  // Connection handle state
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);

  // Multi-selection state
  const [isSelectingArea, setIsSelectingArea] = useState(false);
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
  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
            const handles = getElementConnectionHandles(hoveredEl);
            const HANDLE_RADIUS = 12; // px in world space
            for (const handle of handles) {
              const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
              if (dist <= HANDLE_RADIUS) {
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
        }

        // ── Existing resize / select / drag logic ─────────────────────────
        let foundResizeHandle = false;
        for (const elementId of selectedElements) {
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            const handle = getResizeHandle(point, element);
            if (handle && hasEditAccess) {
              beginGesture?.();
              setIsResizing(true);
              setResizeHandle(handle);
              setDragStart(point);
              lastResizePointRef.current = point;
              previousSnapRef.current = { start: null, end: null };
              resizeInitialBoundsRef.current = getElementBounds(element);
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
        collapseOnReleaseRef.current = outcome.collapseOnRelease
          ? { id: outcome.collapseOnRelease, origin: point }
          : null;

        if (outcome.startDrag && hasEditAccess) {
          beginGesture?.();
          const moving = new Set(outcome.selected);
          const origin = elements.filter((el) => moving.has(el.id));
          const selectionBounds = unionBounds(
            origin.flatMap((el) => getElementBounds(el) ?? []),
          );
          dragSessionRef.current = selectionBounds
            ? {
                start: point,
                origin,
                selection: selectionBounds,
                // Other shapes to align with; connectors, freehand and group frames are not alignment targets.
                targets: elements.flatMap((el) =>
                  moving.has(el.id) ||
                  el.isGuide ||
                  el.type === "freehand" ||
                  isArrowElement(el)
                    ? []
                    : (getElementBounds(el) ?? []),
                ),
              }
            : null;
          setIsDragging(true);
          setDragStart(point);
        } else if (!hit && hasEditAccess) {
          setIsSelectingArea(true);
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
        setIsDrawing(true);
        lastPointRef.current = point;
        return;
      }

      if (!hasEditAccess) return;

      setIsDrawing(true);

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
      arrowSnapRef.current = { start: startSnap, end: null };
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
            resizeInitialBoundsRef.current
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
                const previousPoint = lastResizePointRef.current ?? point;
                const dragVector = {
                  x: point.x - previousPoint.x,
                  y: point.y - previousPoint.y,
                };

                snapMatch = findNearestAnchorSnap({
                  point,
                  dragVector,
                  previous: previousSnapRef.current[endpoint],
                  radius: CONNECTOR_SNAP_PX / zoom,
                });
                previousSnapRef.current[endpoint] = snapMatch;

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
                resizeInitialBoundsRef.current,
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
                  const previewStart = updated.points[0] ?? point;
                  const previewEnd =
                    updated.points[Math.max(1, updated.points.length - 1)] ??
                    previewStart;
                  const previewArrow = {
                    ...updated,
                    points: [previewStart, previewEnd],
                    isManuallyRouted: false,
                  } as DrawingElement;
                  updated = previewArrow;
                  pendingArrowRerouteRef.current = previewArrow;
                }
                updateElement(updated);
              }
            }
            lastResizePointRef.current = point;
            return;
          }

          if (isDragging && selectedElements.length > 0) {
            const pending = collapseOnReleaseRef.current;
            if (
              pending &&
              Math.hypot(point.x - pending.origin.x, point.y - pending.origin.y) > 3
            ) {
              collapseOnReleaseRef.current = null;
            }
            const session = dragSessionRef.current;
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
        if (lastPointRef.current) {
          const elementsToDelete = getElementsOnPath(
            lastPointRef.current,
            point,
            eraserSize / 2,
          );
          if (elementsToDelete.length > 0) {
            deleteElements(elementsToDelete.map((el) => el.id));
          }
        }
        lastPointRef.current = point;
        return;
      }

      if (!currentElement) return;

      if (currentElement.type === "freehand") {
        setCurrentElement({
          ...currentElement,
          points: [...currentElement.points, point],
        });
      } else if (isArrowElement(currentElement)) {
        const start = currentElement.points[0];
        // ── Drag preview: straight line only ──────────────────────────────
        // Full orthogonal routing runs only when the arrow is committed
        // (stopDrawing). Calling routeArrowPoints mid-drag can crash because
        // sourceId/targetId/connection handles are not yet resolved.
        const endSnap =
          findNearestAnchorSnap?.({
            point,
            previous: arrowSnapRef.current.end,
            excludeElementIds: currentElement.startConnection
              ? [currentElement.startConnection.elementId]
              : undefined,
            radius: CONNECTOR_SNAP_PX / zoom,
          }) ?? null;
        arrowSnapRef.current.end = endSnap;
        onArrowSnapPreviewChange?.(
          endSnap ? { endpoint: "end", pointer: point, match: endSnap } : null,
        );
        setCurrentElement({
          ...currentElement,
          points: [start, endSnap ? { x: endSnap.anchor.x, y: endSnap.anchor.y } : point],
          endConnection: endSnap
            ? { elementId: endSnap.elementId, anchorId: endSnap.anchor.id }
            : undefined,
        });
      } else {
        setCurrentElement({
          ...currentElement,
          points: [currentElement.points[0], point],
        });
      }
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
    setIsDrawing(false);
    setConnectionDraft(null);
    setIsSelectingArea(false);
    setSelectionBox(null);
    collapseOnReleaseRef.current = null;
    pendingArrowRerouteRef.current = null;
    lastPointRef.current = null;
    previousSnapRef.current = { start: null, end: null };
    arrowSnapRef.current = { start: null, end: null };
    onArrowSnapPreviewChange?.(null);
    return true;
  }, [
    isDrawing,
    currentElement,
    currentTool,
    connectionDraft,
    isSelectingArea,
    setCurrentElement,
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

      const targetElements = targetSnap
        ? elements.filter((element) => element.id === targetSnap.elementId)
        : getElementsAtPoint(connectionDraft.currentPoint);
      const target = [...targetElements]
        .reverse()
        .find(
          (element) =>
            element.id !== connectionDraft.fromElementId &&
            getElementConnectionHandles(element).length > 0,
        );

      if (target && addElementDirect) {
        const fromEl = elements.find(
          (el) => el.id === connectionDraft.fromElementId,
        );
        if (fromEl) {
          const fromHandles = getElementConnectionHandles(fromEl);
          const fromHandle = fromHandles.find(
            (h) => h.name === connectionDraft.fromHandle,
          );
          const targetHandle = targetSnap?.anchor
            ? {
                id: targetSnap.anchor.id,
                name: targetSnap.anchor.side,
                x: targetSnap.anchor.x,
                y: targetSnap.anchor.y,
              }
            : null;
          const toHandles = targetHandle
            ? [targetHandle]
            : getElementConnectionHandles(target);

          // Find nearest target handle to the cursor
          let nearestToHandle = toHandles[0];
          let minDist = Infinity;
          for (const h of toHandles) {
            const d = Math.hypot(
              connectionDraft.currentPoint.x - h.x,
              connectionDraft.currentPoint.y - h.y,
            );
            if (d < minDist) {
              minDist = d;
              nearestToHandle = h;
            }
          }

          if (fromHandle && nearestToHandle) {
            const arrow = buildConnectorArrow({
              id: generateId(),
              from: {
                elementId: fromEl.id,
                anchorId: connectionDraft.fromAnchorId,
                x: fromHandle.x,
                y: fromHandle.y,
                side: fromHandle.name,
              },
              to: {
                elementId: target.id,
                anchorId: nearestToHandle.id,
                x: nearestToHandle.x,
                y: nearestToHandle.y,
                side: nearestToHandle.name,
              },
              route: routeConnectedArrow,
            });
            if (arrow) {
              addElementDirect(arrow);
            }
          }
        }
      }
      setConnectionDraft(null);
      onArrowSnapPreviewChange?.(null);
      pendingArrowRerouteRef.current = null;
      return;
    }

    const collapseTo = collapseOnReleaseRef.current;
    collapseOnReleaseRef.current = null;
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
      setIsSelectingArea(false);
      setSelectionBox(null);
    }

    if (
      isDrawing &&
      currentElement &&
      currentTool !== "eraser" &&
      hasEditAccess
    ) {
      const first = currentElement.points[0];
      const last = currentElement.points[currentElement.points.length - 1];
      const isClick =
        currentElement.type !== "freehand" &&
        Math.abs(first.x - last.x) < MIN_DRAWN_SIZE &&
        Math.abs(first.y - last.y) < MIN_DRAWN_SIZE;
      if (!isClick) {
        if (
          isArrowElement(currentElement) &&
          currentElement.startConnection &&
          currentElement.endConnection &&
          routeConnectedArrow &&
          addElementDirect
        ) {
          addElementDirect(routeConnectedArrow(currentElement));
        } else {
          completeCurrentElement();
        }
        if (currentElement.type !== "freehand") onElementCreated?.(currentElement.id);
      }
    }
    arrowSnapRef.current = { start: null, end: null };

    if (pendingArrowRerouteRef.current && routeConnectedArrow) {
      const rerouted = routeConnectedArrow(pendingArrowRerouteRef.current);
      if (rerouted) {
        updateElement(rerouted);
      }
      pendingArrowRerouteRef.current = null;
    }

    // Everything the gesture wrote (including the final arrow reroute above) is
    // now one undo step.
    endGesture?.();

    setIsDrawing(false);
    setCurrentElement(null);
    stopPanning();
    setIsDragging(false);
    setIsResizing(false);
    setIsSelectingArea(false);
    setSelectionBox(null);
    setResizeHandle(null);
    setDragStart(null);
    dragSessionRef.current = null;
    setAlignmentGuides([]);
    lastResizePointRef.current = null;
    pendingArrowRerouteRef.current = null;
    previousSnapRef.current = { start: null, end: null };
    onArrowSnapPreviewChange?.(null);
    lastPointRef.current = null;
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
    hasActiveDrawing: isDrawing || isDragging || isResizing || isSelectingArea,
  };
};
