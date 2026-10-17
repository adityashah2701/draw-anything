import { useEffect, useRef, useSyncExternalStore } from "react";
import { iconLibraryVersion, loadIconLibrary, needsIconLibrary, subscribeIconLibrary } from "@/core/icons/registry";
import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import useCanvasEngine from "@/features/whiteboard/hooks/canvas/use-canvas-engine";
import { CanvasContextMenu } from "@/features/whiteboard/components/canvas/canvas-context-menu";
import { CanvasEmptyState } from "@/features/whiteboard/components/canvas/canvas-empty-state";
import { Minimap } from "@/features/whiteboard/components/canvas/minimap";
import { Cursors } from "@/features/whiteboard/components/canvas/cursors";
import { CommentLayer } from "@/features/whiteboard/components/canvas/comment-layer";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { Pair } from "@/features/whiteboard/utils/viewport-math";

const firstTwo = (pointers: Map<number, Point>): Pair | null => {
  const [a, b] = [...pointers.values()];
  return a && b ? [a, b] : null;
};

interface WhiteboardCanvasStageProps {
  controller: WhiteboardPageController;
}

export const WhiteboardCanvasStage = ({
  controller,
}: WhiteboardCanvasStageProps) => {
  const {
    canvasRef,
    whiteboardId,
    whiteboardAccess,
    canvasViewport,
    elements,
    currentElement,
    selectedElements,
    editingTextElement,
    setEditingTextElement,
    setIsNewTextElement,
    setCurrentTool,
    currentTool,
    currentColorRef,
    strokeWidthRef,
    fontSizeRef,
    generateId,
    whiteboardDrawing,
    otherUsersDrafts,
    otherUsersSelections,
    updateMyPresence,
    getElementsAtPoint,
    getElementBounds,
    updateArrowBendsAtPoint,
    setSelectedElements,
    beginEditing,
    arrowSnapPreview,
    editingShapeLabelId,
  } = controller;

  // Boards that use icons beyond the curated set fetch the rest of the library, then redraw.
  const iconLibraryVersionNow = useSyncExternalStore(subscribeIconLibrary, iconLibraryVersion, iconLibraryVersion);
  useEffect(() => {
    if (needsIconLibrary(elements)) void loadIconLibrary();
  }, [elements]);

  useCanvasEngine({
    iconLibraryVersion: iconLibraryVersionNow,
    canvasRef,
    elements,
    currentElement,
    otherUsersDrafts,
    otherUsersSelections,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    canvasSize: canvasViewport.canvasSize,
    selectedElements,
    selectionBox: whiteboardDrawing.selectionBox,
    alignmentGuides: whiteboardDrawing.alignmentGuides,
    editingTextId: editingTextElement?.id || null,
    getElementBounds,
    cursorPosition: whiteboardDrawing.cursorPosition,
    eraserSize: controller.eraserSize,
    currentTool,
    hoveredElementId: whiteboardDrawing.hoveredElementId,
    connectionDraft: whiteboardDrawing.connectionDraft,
    magneticSnapPreview: arrowSnapPreview,
    editingShapeLabelId,
  });

  // Fingers currently down (a mouse or pen is never tracked: a missed release must not turn a click into a pinch), canvas-relative; `pinch` is set while two or more are.
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<Pair | null>(null);

  const { handleNativeWheel } = canvasViewport;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleNativeWheel);
  }, [canvasRef, handleNativeWheel]);

  // Right-click selects what is under the pointer first (unless it is already selected), like every editor.
  const selectUnderContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = {
      x:
        (e.clientX - rect.left - canvasViewport.panOffset.x) /
        canvasViewport.zoom,
      y:
        (e.clientY - rect.top - canvasViewport.panOffset.y) /
        canvasViewport.zoom,
    };
    const top = [...(getElementsAtPoint(world) || [])].reverse()[0];
    if (!top) setSelectedElements([]);
    else if (!selectedElements.includes(top.id)) setSelectedElements([top.id]);
  };

  return (
    <CanvasContextMenu controller={controller}>
      <div
        className="absolute inset-0 z-0 touch-none"
        onContextMenu={selectUnderContextMenu}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          updateMyPresence({
            cursor: { x: e.clientX - rect.left, y: e.clientY - rect.top },
          });
        }}
        onPointerLeave={() => {
          updateMyPresence({ cursor: null });
        }}
      >
        <Cursors />

        {whiteboardAccess.status === "loading" && whiteboardId && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background bg-opacity-75">
            <div className="text-center">
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
              <p className="text-muted-foreground">Loading whiteboard...</p>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={
            canvasViewport.canvasSize.width *
            (typeof window !== "undefined" ? window.devicePixelRatio : 1)
          }
          height={
            canvasViewport.canvasSize.height *
            (typeof window !== "undefined" ? window.devicePixelRatio : 1)
          }
          onPointerDown={(e) => {
            // Second finger: whatever the first one started is abandoned and the two fingers pan and zoom.
            if (e.pointerType === "touch") {
              const rect = e.currentTarget.getBoundingClientRect();
              touches.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
            if (touches.current.size >= 2) {
              if (!pinch.current) {
                // A shape being drawn is dropped; a move or resize is already on the board, so it is just ended.
                if (!whiteboardDrawing.cancelDrawing()) whiteboardDrawing.stopDrawing();
                pinch.current = firstTwo(touches.current);
              }
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // best effort
              }
              return;
            }
            // Left button / touch / pen only, and only the first finger: a second
            // finger or a right click must not start a second gesture.
            if (e.button !== 0 || !e.isPrimary) return;
            if (editingShapeLabelId) {
              return;
            }
            // Keep receiving move/up events when the pointer leaves the canvas
            // (over a toolbar, outside the window), so a drag finishes where the
            // user released instead of being cut off at the edge.
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Capture is best effort; the gesture still works without it.
            }
            if (currentTool === "comment") {
              if (whiteboardAccess.hasEditAccess) controller.setCommentDraft(canvasViewport.getMousePosition(e));
              setCurrentTool("select");
              return;
            }
            if (currentTool === "text" && whiteboardAccess.hasEditAccess) {
              const pos = canvasViewport.getMousePosition(e);
              const draftEl: DrawingElement = {
                id: generateId(),
                type: "text",
                points: [pos],
                color: currentColorRef.current,
                strokeWidth: strokeWidthRef.current,
                text: "TEXT",
                fontSize: fontSizeRef.current,
                fontWeight: "400",
                fontStyle: "normal",
              };
              setEditingTextElement(draftEl);
              setIsNewTextElement(true);
              setCurrentTool("select");
              return;
            }
            if (editingTextElement) {
              return;
            }
            whiteboardDrawing.startDrawing(e);
          }}
          onDoubleClick={(e) => {
            if (!whiteboardAccess.hasEditAccess) return;
            const pos = canvasViewport.getMousePosition(e);
            const clickedElements = getElementsAtPoint(pos) || [];
            const topEl = [...clickedElements].reverse()[0];
            if (!topEl) return;

            if (isArrowElement(topEl)) {
              const handled = updateArrowBendsAtPoint(topEl, pos);
              if (handled) {
                return;
              }
            }

            beginEditing(topEl);
          }}
          onPointerMove={(e) => {
            if (touches.current.has(e.pointerId)) {
              const rect = e.currentTarget.getBoundingClientRect();
              touches.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
            if (pinch.current) {
              const next = firstTwo(touches.current);
              if (next) {
                canvasViewport.pinchTo(pinch.current, next);
                pinch.current = next;
              }
              return;
            }
            if (!e.isPrimary) return;
            whiteboardDrawing.draw(e);
          }}
          onPointerUp={(e) => {
            touches.current.delete(e.pointerId);
            if (pinch.current) {
              if (touches.current.size < 2) pinch.current = null;
              return;
            }
            if (!e.isPrimary) return;
            if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            whiteboardDrawing.stopDrawing();
          }}
          onPointerCancel={(e) => {
            touches.current.delete(e.pointerId);
            if (pinch.current) {
              if (touches.current.size < 2) pinch.current = null;
              return;
            }
            if (!e.isPrimary) return;
            whiteboardDrawing.stopDrawing();
          }}
          className="cursor-crosshair"
          style={{
            width: canvasViewport.canvasSize.width,
            height: canvasViewport.canvasSize.height,
            display: "block",
            cursor:
              currentTool === "hand"
                ? "grab"
                : currentTool === "select"
                  ? "default"
                  : currentTool === "eraser" && whiteboardAccess.hasEditAccess
                    ? "none"
                    : whiteboardAccess.hasEditAccess
                      ? "crosshair"
                      : "not-allowed",
          }}
        />

        <CommentLayer
          whiteboardId={whiteboardId}
          zoom={canvasViewport.zoom}
          panOffset={canvasViewport.panOffset}
          stageSize={canvasViewport.canvasSize}
          canEdit={whiteboardAccess.hasEditAccess}
          draft={controller.commentDraft}
          onDraftChange={controller.setCommentDraft}
        />

        {controller.isBoardReady &&
          elements.length === 0 &&
          whiteboardAccess.status === "granted" && (
            <CanvasEmptyState
              canEdit={whiteboardAccess.hasEditAccess}
              onGenerate={controller.handleGenerateDiagram}
            />
          )}
        {!controller.hideCanvasUi && elements.length > 0 && (
          <Minimap
            elements={elements}
            getElementBounds={getElementBounds}
            zoom={canvasViewport.zoom}
            panOffset={canvasViewport.panOffset}
            canvasSize={canvasViewport.canvasSize}
            onCenter={canvasViewport.centerOn}
          />
        )}
      </div>
    </CanvasContextMenu>
  );
};

export default WhiteboardCanvasStage;
