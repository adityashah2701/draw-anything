import { useRef, useState, useCallback, useEffect } from "react";
import { IconPicker } from "@/features/whiteboard/components/overlays/icon-picker";
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
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
  normalizeRichTextInput,
} from "@/features/whiteboard/utils/rich-text-renderer";
import { measureShapeLabel, resolveTextColor } from "@/core/shapes/base/shape-label-renderer";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { getShapeLocalBounds, getShapeRotation } from "@/core/shapes/shape-runtime";
import { centerOf, rotatePoint } from "@/core/geometry/box";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import { measureLabelEditTopOffset, shapeLabelEditorStyle } from "./shape-label-editor-style";

// ─── Shape Label Editor ───────────────────────────────────────────────────────

interface ShapeLabelEditorProps {
  shape: DrawingElement;
  /** Screen-space center X */
  sx: number;
  /** Screen-space center Y */
  sy: number;
  zoom: number;
  initialMarkdown: string;
  initialFontSize: number;
  initialFontWeight: string | number;
  initialFontStyle: string;
  /** Available width in screen pixels */
  availableWidthPx: number;
  /** Available height in screen pixels */
  availableHeightPx: number;
  /** Same line cap the canvas applies, so the editor wraps like the rendered label. */
  maxLines?: number;
  /** Degrees the shape is rotated by; the editor is turned to match. */
  rotation?: number;
  /** Same alignment the canvas uses for this shape's label. */
  align?: "left" | "center";
  onCommit: (
    label: string,
    fontSize: number,
    fontWeight: string,
    fontStyle: string,
  ) => void;
  updateElement: (el: DrawingElementJson) => void;
}

function ShapeLabelEditor({
  shape,
  sx,
  sy,
  zoom,
  initialMarkdown,
  initialFontSize,
  initialFontWeight,
  initialFontStyle,
  availableWidthPx,
  availableHeightPx,
  maxLines,
  rotation,
  align,
  onCommit,
  updateElement,
}: ShapeLabelEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontWeight, setFontWeight] = useState(String(initialFontWeight));
  const [fontStyle, setFontStyle] = useState(initialFontStyle);
  const initializedRef = useRef(false);

  // Compute the actual font metrics (auto-shrink to fit shape)
  const { editorFontSize, editorLineHeight, editorWidth, editorMinHeight } =
    (() => {
      if (typeof document === "undefined") {
        return {
          editorFontSize: fontSize * zoom,
          editorLineHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
          editorWidth: Math.max(120, availableWidthPx),
          editorMinHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
        };
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return {
          editorFontSize: fontSize * zoom,
          editorLineHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
          editorWidth: Math.max(120, availableWidthPx),
          editorMinHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
        };
      }
      const metrics = measureShapeLabel({
        ctx,
        label: initialMarkdown,
        maxWidth: availableWidthPx,
        maxHeight: availableHeightPx,
        zoom,
        preferredFontSize: fontSize,
        preferredFontWeight: fontWeight,
        preferredFontStyle: fontStyle,
        maxLines,
      });
      if (metrics) {
        return {
          editorFontSize: metrics.finalFontSize,
          editorLineHeight: metrics.finalLineHeight,
          editorWidth: metrics.wrapWidth,
          editorMinHeight: metrics.height,
        };
      }
      return {
        editorFontSize: fontSize * zoom,
        editorLineHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
        editorWidth: Math.max(120, availableWidthPx),
        editorMinHeight: fontSize * zoom * LINE_HEIGHT_RATIO,
      };
    })();

  const editTopOffset = measureLabelEditTopOffset(
    editorFontSize,
    fontWeight,
    fontStyle,
  );

  // Focus on mount and set initial content
  useEffect(() => {
    if (!editorRef.current || initializedRef.current) return;
    initializedRef.current = true;
    editorRef.current.innerHTML = markdownToEditableHtml(initialMarkdown);
    setTimeout(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        // Caret at the end: typing extends the label instead of silently replacing it.
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch (_) {
        /* ignore */
      }
    }, 0);
  }, [initialMarkdown]);

  // Escape, a click outside and unmounting can all fire; the label is saved once.
  const committedRef = useRef(false);
  const doCommit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    // Emptying the editor is deliberate: the shape goes back to blank.
    onCommit(editableHtmlToMarkdown(editorRef.current || ""), fontSize, fontWeight, fontStyle);
  }, [onCommit, fontSize, fontWeight, fontStyle]);

  return (
    <>
      {/* Formatting toolbar */}
      <div
        style={{
          position: "absolute",
          left: sx,
          top: sy - editorMinHeight / 2 - 38,
          transform: "translate(-50%, -50%)",
          zIndex: 111,
        }}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/90 px-1 py-1 shadow-sm"
      >
        <button
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => {
            document.execCommand("bold");
            editorRef.current?.focus();
            const isBold = document.queryCommandState("bold");
            setFontWeight(isBold ? "700" : String(initialFontWeight));
          }}
          className={`h-7 w-7 rounded text-xs font-bold ${
            fontWeight === "700" || fontWeight === "600"
              ? "bg-primary text-primary-foreground"
              : "text-text-secondary hover:bg-surface-secondary"
          }`}
          title="Bold"
        >
          B
        </button>
        <button
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => {
            document.execCommand("italic");
            editorRef.current?.focus();
            const isItalic = document.queryCommandState("italic");
            setFontStyle(isItalic ? "italic" : "normal");
          }}
          className={`h-7 w-7 rounded text-xs italic ${
            fontStyle === "italic"
              ? "bg-primary text-primary-foreground"
              : "text-text-secondary hover:bg-surface-secondary"
          }`}
          title="Italic"
        >
          I
        </button>
        <button
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => setFontSize((s) => Math.max(12, s - 2))}
          className="h-7 w-7 rounded text-text-secondary hover:bg-surface-secondary"
          title="Decrease size"
        >
          −
        </button>
        <span className="w-10 text-center text-xs font-medium text-muted-foreground">
          {fontSize}
        </span>
        <button
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => setFontSize((s) => Math.min(96, s + 2))}
          className="h-7 w-7 rounded text-text-secondary hover:bg-surface-secondary"
          title="Increase size"
        >
          +
        </button>
      </div>

      {/* Label editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onMouseDown={(ev) => ev.stopPropagation()}
        onInput={() => {
          /* handled on commit */
        }}
        onKeyDown={(ev) => {
          const mod = ev.metaKey || ev.ctrlKey;
          if (mod && ev.key.toLowerCase() === "b") {
            ev.preventDefault();
            document.execCommand("bold");
            const isBold = document.queryCommandState("bold");
            setFontWeight(isBold ? "700" : String(initialFontWeight));
            return;
          }
          if (mod && ev.key.toLowerCase() === "i") {
            ev.preventDefault();
            document.execCommand("italic");
            const isItalic = document.queryCommandState("italic");
            setFontStyle(isItalic ? "italic" : "normal");
            return;
          }
          if (mod && (ev.key === "+" || ev.key === "=")) {
            ev.preventDefault();
            setFontSize((s) => Math.min(96, s + 2));
            return;
          }
          if (mod && ev.key === "-") {
            ev.preventDefault();
            setFontSize((s) => Math.max(12, s - 2));
            return;
          }
          // Escape and Ctrl/Cmd+Enter finish editing and keep the text; Enter is a newline.
          if (ev.key === "Escape" || (mod && ev.key === "Enter")) {
            ev.preventDefault();
            doCommit();
            return;
          }
          if (ev.key === "Enter") {
            ev.preventDefault();
            document.execCommand("insertLineBreak");
          }
        }}
        onBlur={doCommit}
        style={shapeLabelEditorStyle({
          sx,
          sy,
          editTopOffset,
          editorWidth,
          editorFontSize,
          editorLineHeight,
          editorMinHeight,
          fontWeight,
          fontStyle,
          // The colour the canvas draws the label in (contrast against the fill), so typing never changes it.
          color: resolveTextColor(shape.color, shape.fill),
          rotation,
          align,
        })}
        className="bg-transparent outline-none"
      />
    </>
  );
}

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
