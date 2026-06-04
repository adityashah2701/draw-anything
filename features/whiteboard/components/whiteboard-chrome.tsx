import { Eye, EyeOff } from "lucide-react";
import TopToolbar from "@/features/whiteboard/components/top-toolbar";
import PropertiesPanel from "@/features/whiteboard/components/properties-panel";
import Sidebar from "@/features/whiteboard/components/sidebar";
import { WhiteboardPageController } from "@/features/whiteboard/hooks/use-whiteboard-page-controller";

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
    whiteboardAutoSave,
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
          hideCanvasUi ? "top-4" : "top-24"
        }`}
      >
        <button
          onClick={() => setHideCanvasUi((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white"
          title={hideCanvasUi ? "Show toolbars" : "Hide toolbars"}
        >
          {hideCanvasUi ? <Eye size={14} /> : <EyeOff size={14} />}
          {hideCanvasUi ? "Show UI" : "Hide UI"}
        </button>
      </div>

      {!hideCanvasUi && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-50 w-[min(1440px,calc(100%-2rem))] -translate-x-1/2 px-1">
          <div className="pointer-events-auto">
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
              onSave={whiteboardAutoSave.saveWhiteboard}
              onLoad={loadWhiteboard}
              onRename={handleRenameWhiteboard}
              onGenerateDiagram={handleGenerateDiagram}
              disabled={!whiteboardAccess.hasEditAccess}
            />
          </div>
        </div>
      )}

      {!hideCanvasUi && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-40 w-[min(1280px,calc(100%-1rem))] -translate-x-1/2 px-1">
          <div className="pointer-events-auto">
            <PropertiesPanel
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
              isSaving={whiteboardAutoSave.isSaving}
              lastSaved={whiteboardAutoSave.lastSaved}
            />
          </div>
        </div>
      )}

      {!hideCanvasUi && (
        <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full">
          <Sidebar
            currentTool={currentTool}
            onToolChange={controller.setCurrentTool}
            disabled={!whiteboardAccess.hasEditAccess}
          />
        </div>
      )}
    </>
  );
};

export default WhiteboardChrome;
