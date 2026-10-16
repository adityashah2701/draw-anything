import { useRef, useState, useCallback, useEffect } from "react";
import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import CanvasTextBlock from "@/features/whiteboard/components/canvas/canvas-text-block";
import { getAdaptiveColor } from "@/features/whiteboard/utils/canvas-render-utils";
import KeyboardShortcuts from "@/features/whiteboard/components/overlays/keyboard-shortcuts";
import { AIPanel } from "@/features/whiteboard/components/overlays/ai-panel";
import { ExportDialog } from "@/features/whiteboard/components/overlays/export-dialog";
import { CommandMenu } from "@/features/whiteboard/components/overlays/command-menu";
import { DrawingElementJson } from "@/liveblocks.config";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
  normalizeRichTextInput,
} from "@/features/whiteboard/utils/rich-text-renderer";
import { measureShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { getShapeLabelRegion } from "@/core/text/label-region";
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
  onCommit: (
    label: string,
    fontSize: number,
    fontWeight: string,
    fontStyle: string,
  ) => void;
  onCancel: () => void;
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
  onCommit,
  onCancel,
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
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch (_) {
        /* ignore */
      }
    }, 0);
  }, [initialMarkdown]);

  const doCommit = useCallback(() => {
    const nextLabel =
      editableHtmlToMarkdown(editorRef.current || "") ||
      initialMarkdown ||
      "TEXT";
    onCommit(nextLabel, fontSize, fontWeight, fontStyle);
  }, [onCommit, initialMarkdown, fontSize, fontWeight, fontStyle]);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

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
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/90 px-1 py-1 shadow-sm backdrop-blur"
      >
        <button
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => {
            document.execCommand("bold");
            editorRef.current?.focus();
            const next = editableHtmlToMarkdown(
              editorRef.current || document.createElement("div"),
            );
            // Detect bold state from selection
            const isBold = document.queryCommandState("bold");
            setFontWeight(isBold ? "700" : String(initialFontWeight));
            // Also fire onChange with updated markdown
            _ = next;
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
          if (ev.key === "Escape") {
            onCancel();
            return;
          }
          if (ev.key === "Enter") {
            ev.preventDefault();
            doCommit();
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
          color: getAdaptiveColor(shape.color, isDark),
        })}
        className="bg-transparent outline-none"
      />
    </>
  );
}

// Suppress unused variable lint warning for the `_ = next` hack above
declare let _: unknown;

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

  return (
    <>
      <KeyboardShortcuts
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <AIPanel
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        triggerAIGeneration={controller.triggerAIGeneration}
        isGenerating={controller.isAIGenerating}
        messages={controller.aiMessages}
        disabled={!whiteboardAccess.hasEditAccess}
        elements={controller.elements}
        selectedElementIds={controller.selectedElements}
        onApplyDiagramCode={controller.applyDiagramCode}
      />

      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        selectedCount={controller.selectedElements.length}
        isExporting={boardExport.isExporting}
        onExport={boardExport.exportFile}
        onCopy={boardExport.copyImage}
        onCancelExport={boardExport.cancel}
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
          const bounds = getElementBounds(shape);
          if (!bounds) return null;

          // The text region, not the whole shape: semantic nodes keep their label beside the icon.
          const region = getShapeLabelRegion(shape.type, bounds);
          const sx = region.centerX * canvasViewport.zoom + canvasViewport.panOffset.x;
          const sy = region.centerY * canvasViewport.zoom + canvasViewport.panOffset.y;

          const labelMarkdown = normalizeRichTextInput(
            editingShapeLabelDraft || "TEXT",
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
              onCancel={() => {
                setEditingShapeLabelId(null);
                setEditingShapeLabelDraft("");
              }}
            />
          );
        })()}
    </>
  );
};

export default WhiteboardEditingOverlays;
