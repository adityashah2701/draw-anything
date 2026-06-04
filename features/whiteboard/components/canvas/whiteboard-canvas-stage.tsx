import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import useCanvasEngine from "@/features/whiteboard/hooks/canvas/use-canvas-engine";
import { Cursors } from "@/features/whiteboard/components/canvas/cursors";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface WhiteboardCanvasStageProps {
  controller: WhiteboardPageController;
}

export const WhiteboardCanvasStage = ({
  controller,
}: WhiteboardCanvasStageProps) => {
  const {
    canvasRef,
    whiteboard,
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

      {!whiteboardAccess.hasEditAccess && (
        <div className="absolute left-1/2 top-20 z-20 max-w-[90vw] -translate-x-1/2 rounded-lg border border-yellow-300 bg-yellow-100 p-2">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500"></div>
            <span className="truncate text-sm text-yellow-800">
              Read-only mode - You don&apos;t have edit access to this whiteboard
            </span>
          </div>
        </div>
      )}

      {!whiteboard && whiteboardId && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-50 bg-opacity-75">
          <div className="text-center">
            <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
            <p className="text-gray-600">Loading whiteboard...</p>
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
        onMouseDown={(e) => {
          if (editingShapeLabelId) {
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

          if (
            topEl.type === "rectangle" ||
            topEl.type === "circle" ||
            topEl.type === "diamond"
          ) {
            setEditingShapeLabelId(topEl.id);
            setEditingShapeLabelDraft(topEl.label?.trim() || "TEXT");
            setEditingShapeLabelFontSize(topEl.fontSize || 20);
            setEditingShapeLabelFontWeight(topEl.fontWeight || "600");
            setEditingShapeLabelFontStyle(topEl.fontStyle || "normal");
            setSelectedElements([topEl.id]);
            setCurrentTool("select");
          }
        }}
        onMouseMove={(e) => {
          whiteboardDrawing.draw(e);
        }}
        onWheel={canvasViewport.handleWheelZoom}
        onMouseUp={whiteboardDrawing.stopDrawing}
        onMouseLeave={whiteboardDrawing.stopDrawing}
        onMouseEnter={() => {}}
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
