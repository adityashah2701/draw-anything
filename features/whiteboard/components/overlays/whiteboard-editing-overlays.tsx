import { useRef, useState, useCallback, useEffect } from "react";
import { FrameTitleEditor } from "@/features/whiteboard/components/overlays/frame-title-editor";
import { MAX_FRAME_TITLE_LENGTH } from "@/core/frames/frame-model";
import { renameFrame } from "@/core/frames/frame-api";
import { IconPicker } from "@/features/whiteboard/components/overlays/icon-picker";
import { StructuredEditor } from "@/features/whiteboard/components/overlays/structured-editor";
import { isStructured } from "@/features/whiteboard/utils/structured-edit";
import { ShapePicker } from "@/features/whiteboard/components/overlays/shape-picker";
import { LayoutPanel } from "@/features/whiteboard/components/overlays/layout-panel";
import { layoutEnginesEnabled } from "@/core/layout/flags";
import { hasFamilyLayout } from "@/core/layout/record";
import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import CanvasTextBlock from "@/features/whiteboard/components/canvas/canvas-text-block";
import KeyboardShortcuts from "@/features/whiteboard/components/overlays/keyboard-shortcuts";
import { AIPanel } from "@/features/whiteboard/components/overlays/ai-panel";
import { useCanvasAgent } from "@/features/canvas-tools/editor/use-canvas-agent";
import { DiagramCodePanel } from "@/features/whiteboard/components/overlays/diagram-code-panel";
import { ExportDialog } from "@/features/whiteboard/components/overlays/export-dialog";
import { CommandMenu } from "@/features/whiteboard/components/overlays/command-menu";
import { DrawingElementJson } from "@/liveblocks.config";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { normalizeRichTextInput } from "@/features/whiteboard/utils/rich-text-renderer";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { getShapeLocalBounds, getShapeRotation } from "@/core/shapes/shape-runtime";
import { centerOf, rotatePoint } from "@/core/geometry/box";
import { ShapeLabelEditor } from "./shape-label-editor";

// ─── Main Overlays Component ──────────────────────────────────────────────────

interface WhiteboardEditingOverlaysProps {
  controller: WhiteboardPageController;
}

export const WhiteboardEditingOverlays = ({
  controller,
}: WhiteboardEditingOverlaysProps) => {
  const {
    showShortcuts,
    setShowShortcuts,
    showAIModal,
    setShowAIModal,
    showCommandMenu,
    setShowCommandMenu,
    showExport,
    setShowExport,
    boardExport,
    editingTextElement,
    isNewTextElement,
    editingShapeLabelId,
    setEditingShapeLabelId,
    editingShapeLabelDraft,
    setEditingShapeLabelDraft,
    editingShapeLabelFontSize,
    setEditingShapeLabelFontSize,
    editingShapeLabelFontWeight,
    setEditingShapeLabelFontWeight,
    editingShapeLabelFontStyle,
    setEditingShapeLabelFontStyle,
    canvasViewport,
    elements,
    getElementBounds,
    whiteboardAccess,
    setCurrentTool,
    handleCommandAction,
    handleEditingTextChange,
    handleEditingTextCommit,
    handleEditingTextMove,
    updateElement,
  } = controller;

  const canvasAgent = useCanvasAgent(controller);

  return (
    <>
      <KeyboardShortcuts
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <AIPanel
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        disabled={!whiteboardAccess.hasEditAccess}
        onOpenCode={controller.openCodePanel}
        onFitToScreen={controller.handleFitToScreen}
        canvasAgent={canvasAgent}
      />

      <DiagramCodePanel
        isOpen={controller.showCodePanel}
        onClose={() => controller.setShowCodePanel(false)}
        agentOpen={showAIModal}
        elements={controller.elements}
        selectedElementIds={controller.selectedElements}
        onApply={controller.applyDiagramCode}
        loadToken={controller.codeLoadToken}
        familyLayout={hasFamilyLayout(controller.stored)}
        disabled={!whiteboardAccess.hasEditAccess}
      />

      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        selectedCount={controller.selectedElements.length}
        isExporting={boardExport.isExporting}
        onExport={boardExport.exportFile}
        onCopy={boardExport.copyImage}
        onCancelExport={boardExport.cancel}
        onCopySvg={boardExport.copySvg}
      />

      {layoutEnginesEnabled() && (
        <LayoutPanel
          open={controller.showLayoutPanel}
          onOpenChange={controller.setShowLayoutPanel}
          plan={controller.planLayout}
          apply={controller.applyLayoutPlan}
          onPreview={controller.setLayoutPreview}
          disabled={!whiteboardAccess.hasEditAccess}
        />
      )}

      <ShapePicker open={controller.showShapePicker} onOpenChange={controller.setShowShapePicker} onPick={controller.insertShape} />

      <IconPicker
        open={controller.showIconPicker}
        onOpenChange={controller.setShowIconPicker}
        mode={controller.iconPickerMode}
        onPick={controller.pickIcon}
        replace={
          controller.iconPickerMode === "replace"
            ? {
                onRemove: controller.semanticNodes.removeIcon,
                onRestore: controller.semanticNodes.restoreIcon,
                canRestore: controller.semanticNodes.model?.canRestore === true,
                hidden: controller.semanticNodes.model?.icon !== "mixed" && controller.semanticNodes.model?.icon.hidden === true,
              }
            : undefined
        }
      />

      <CommandMenu
        isOpen={showCommandMenu}
        onOpenChange={setShowCommandMenu}
        onToolChange={setCurrentTool}
        onAction={handleCommandAction}
      />

      {editingTextElement && (
        <CanvasTextBlock
          element={editingTextElement}
          zoom={canvasViewport.zoom}
          panOffset={canvasViewport.panOffset}
          selectAllOnMount={isNewTextElement}
          onChange={handleEditingTextChange}
          onCommit={handleEditingTextCommit}
          onMove={handleEditingTextMove}
          disabled={!whiteboardAccess.hasEditAccess}
        />
      )}

      {editingShapeLabelId &&
        (() => {
          const shape = elements.find(
            (el: DrawingElement) => el.id === editingShapeLabelId,
          );
          if (!shape) return null;
          if (isStructured(shape)) {
            return (
              <StructuredEditor
                key={editingShapeLabelId}
                element={shape}
                zoom={canvasViewport.zoom}
                panOffset={canvasViewport.panOffset}
                onDone={(next) => {
                  if (next) updateElement(next as unknown as DrawingElementJson);
                  setEditingShapeLabelId(null);
                }}
              />
            );
          }
          if (shape.type === "frame") {
            return (
              <FrameTitleEditor
                key={editingShapeLabelId}
                frame={shape}
                zoom={canvasViewport.zoom}
                panOffset={canvasViewport.panOffset}
                onDone={(title) => {
                  const current = shape.title ?? "";
                  const next = title === null ? null : title.trim().slice(0, MAX_FRAME_TITLE_LENGTH);
                  if (next !== null && next !== current.trim()) {
                    const renamed = renameFrame(controller.readLiveStored(), shape.id, next);
                    if (renamed.ok) controller.applyDocPatch(renamed.patch);
                  }
                  setEditingShapeLabelId(null);
                }}
              />
            );
          }
          // The shape's own box (before any rotation); the region is turned about its centre below.
          const bounds = getShapeLocalBounds(shape) ?? getElementBounds(shape);
          if (!bounds) return null;

          // The text region, not the whole shape: semantic nodes keep their label beside the icon.
          const region = getShapeLabelRegion(shape.type, bounds, shape.type === "semantic-node" ? shape.nodeStyle : undefined, shape.type === "outline" ? shape.variant : undefined);
          const rotation = getShapeRotation(shape);
          const labelCenter = rotatePoint({ x: region.centerX, y: region.centerY }, centerOf(bounds), rotation);
          const sx = labelCenter.x * canvasViewport.zoom + canvasViewport.panOffset.x;
          const sy = labelCenter.y * canvasViewport.zoom + canvasViewport.panOffset.y;

          const labelMarkdown = normalizeRichTextInput(
            editingShapeLabelDraft,
          );

          const availableWidthPx = region.width * canvasViewport.zoom;
          const availableHeightPx = region.height * canvasViewport.zoom;

          return (
            <ShapeLabelEditor
              key={editingShapeLabelId}
              shape={shape}
              sx={sx}
              sy={sy}
              zoom={canvasViewport.zoom}
              initialMarkdown={labelMarkdown}
              initialFontSize={editingShapeLabelFontSize}
              initialFontWeight={editingShapeLabelFontWeight}
              initialFontStyle={editingShapeLabelFontStyle}
              availableWidthPx={availableWidthPx}
              availableHeightPx={availableHeightPx}
              maxLines={region.maxLines}
              rotation={rotation}
              align={region.align}
              updateElement={updateElement}
              onCommit={(label, fontSize, fontWeight, fontStyle) => {
                updateElement({
                  ...shape,
                  label,
                  fontSize,
                  fontWeight,
                  fontStyle,
                } as unknown as DrawingElementJson);
                setEditingShapeLabelId(null);
                setEditingShapeLabelDraft("");
                setEditingShapeLabelFontSize(fontSize);
                setEditingShapeLabelFontWeight(fontWeight);
                setEditingShapeLabelFontStyle(fontStyle);
              }}
            />
          );
        })()}
    </>
  );
};

export default WhiteboardEditingOverlays;
