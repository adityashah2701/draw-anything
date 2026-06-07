import { Eye, EyeOff } from "lucide-react";
import TopToolbar from "@/features/whiteboard/components/chrome/top-toolbar";
import FloatingPropertiesPanel from "@/features/whiteboard/components/chrome/floating-properties-panel";
import Sidebar from "@/features/whiteboard/components/chrome/sidebar";
import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";

interface WhiteboardChromeProps {
  controller: WhiteboardPageController;
}

export const WhiteboardChrome = ({ controller }: WhiteboardChromeProps) => {
  const {
    hideCanvasUi,
    setHideCanvasUi,
    currentTool,
    currentColor,
    strokeWidth,
    fillColor,
    fontSize,
    showOutlineColorPicker,
    showFillColorPicker,
    selectedArrow,
    whiteboardAccess,
    canvasViewport,
    handleUndo,
    handleRedo,
    handleClear,
    handleFitToScreen,
    loadWhiteboard,
    handleRenameWhiteboard,
    handleGenerateDiagram,
    handleColorChange,
    handleFillColorChange,
    handleToggleOutlineColorPicker,
    handleToggleFillColorPicker,
    handleStrokeWidthChange,
    handleFontSizeChange,
    handleArrowTypeChange,
    handleArrowRoutingModeChange,
    handleArrowDashedChange,
    handleArrowHeadStartChange,
    handleArrowHeadEndChange,
  } = controller;

  return (
    <>
      <div
        className={`absolute right-4 z-[70] transition-all ${
          hideCanvasUi ? "top-4" : "top-16"
        }`}
      >
        <button
          onClick={() => setHideCanvasUi((prev: boolean) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-popover/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur hover:bg-popover cursor-pointer"
          title={hideCanvasUi ? "Show toolbars" : "Hide toolbars"}
        >
          {hideCanvasUi ? <Eye size={14} /> : <EyeOff size={14} />}
          {hideCanvasUi ? "Show UI" : "Hide UI"}
        </button>
      </div>

      {!hideCanvasUi && (
        <div className="absolute left-[52px] right-0 top-0 z-40 pointer-events-none">
          <TopToolbar
            canUndo={controller.canUndo}
            canRedo={controller.canRedo}
            zoom={canvasViewport.zoom}
            showGrid={canvasViewport.showGrid}
            whiteboardTitle={controller.whiteboard?.title}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onZoomIn={canvasViewport.handleZoomIn}
            onZoomOut={canvasViewport.handleZoomOut}
            onResetZoom={canvasViewport.handleResetZoom}
            onFitToScreen={handleFitToScreen}
            onToggleGrid={canvasViewport.toggleGrid}
            onSave={controller.whiteboardAutoSave.saveWhiteboard}
            onLoad={loadWhiteboard}
            onRename={handleRenameWhiteboard}
            onGenerateDiagram={handleGenerateDiagram}
            disabled={!whiteboardAccess.hasEditAccess}
          />
        </div>
      )}

      {!hideCanvasUi && (
        <FloatingPropertiesPanel
          currentTool={currentTool}
          currentColor={currentColor}
          strokeWidth={strokeWidth}
          fillColor={fillColor}
          fontSize={fontSize}
          showOutlineColorPicker={showOutlineColorPicker}
          showFillColorPicker={showFillColorPicker}
          onColorChange={handleColorChange}
          onFillColorChange={handleFillColorChange}
          onToggleOutlineColorPicker={handleToggleOutlineColorPicker}
          onToggleFillColorPicker={handleToggleFillColorPicker}
          onStrokeWidthChange={handleStrokeWidthChange}
          onFontSizeChange={handleFontSizeChange}
          selectedArrow={selectedArrow}
          onArrowTypeChange={handleArrowTypeChange}
          onArrowRoutingModeChange={handleArrowRoutingModeChange}
          onArrowDashedChange={handleArrowDashedChange}
          onArrowHeadStartChange={handleArrowHeadStartChange}
          onArrowHeadEndChange={handleArrowHeadEndChange}
          disabled={!whiteboardAccess.hasEditAccess}
          hasSelection={controller.selectedElements.length > 0}
        />
      )}

      {!hideCanvasUi && (
        <Sidebar
          currentTool={currentTool}
          onToolChange={controller.setCurrentTool}
          disabled={!whiteboardAccess.hasEditAccess}
          onOpenAIPanel={handleGenerateDiagram}
        />
      )}
    </>
  );
};

export default WhiteboardChrome;
