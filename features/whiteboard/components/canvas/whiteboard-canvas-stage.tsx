import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import useCanvasEngine from "@/features/whiteboard/hooks/canvas/use-canvas-engine";
import { Cursors } from "@/features/whiteboard/components/canvas/cursors";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { normalizeRichTextInput } from "@/features/whiteboard/utils/rich-text-renderer";

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
    setEditingShapeLabelId,
    setEditingShapeLabelDraft,
    setEditingShapeLabelFontSize,
    setEditingShapeLabelFontWeight,
    setEditingShapeLabelFontStyle,
    arrowSnapPreview,
    editingShapeLabelId,
  } = controller;

  useCanvasEngine({
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

  return (
    <div
      className="absolute inset-0 z-0 touch-none"
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

          if (topEl.type === "text") {
            setEditingTextElement(topEl);
            setCurrentTool("select");
            return;
          }

          if (isArrowElement(topEl)) {
            const handled = updateArrowBendsAtPoint(topEl, pos);
            if (handled) {
              return;
            }
          }

          const shapeDef = shapeRegistry.get(topEl.type as DrawingElement["type"]);

          if (shapeDef?.labelConfig?.anchor === "center") {
            setEditingShapeLabelId(topEl.id);
            setEditingShapeLabelDraft(
              normalizeRichTextInput(topEl.label?.trim() || "TEXT"),
            );
            setEditingShapeLabelFontSize(topEl.fontSize || 20);
            setEditingShapeLabelFontWeight(topEl.fontWeight || "600");
            setEditingShapeLabelFontStyle(topEl.fontStyle || "normal");
            setSelectedElements([topEl.id]);
            setCurrentTool("select");
          }
        }}
        onPointerMove={(e) => {
          if (!e.isPrimary) return;
          whiteboardDrawing.draw(e);
        }}
        onWheel={canvasViewport.handleWheelZoom}
        onPointerUp={(e) => {
          if (!e.isPrimary) return;
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          whiteboardDrawing.stopDrawing();
        }}
        onPointerCancel={(e) => {
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
    </div>
  );
};

export default WhiteboardCanvasStage;
