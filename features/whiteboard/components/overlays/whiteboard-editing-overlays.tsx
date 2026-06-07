import { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import CanvasTextBlock from "@/features/whiteboard/components/canvas/canvas-text-block";
import { getAdaptiveColor } from "@/features/whiteboard/utils/canvas-render-utils";
import KeyboardShortcuts from "@/features/whiteboard/components/overlays/keyboard-shortcuts";
import { AIPanel } from "@/features/whiteboard/components/overlays/ai-panel";
import { CommandMenu } from "@/features/whiteboard/components/overlays/command-menu";
import { AIAgentStatusWidget } from "@/features/whiteboard/components/overlays/ai-agent-status-widget";
import { DrawingElementJson } from "@/liveblocks.config";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
  normalizeRichTextInput,
} from "@/features/whiteboard/utils/rich-text-renderer";

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
    shapeLabelEditorRef,
    canvasViewport,
    elements,
    getElementBounds,
    whiteboardAccess,
    setCurrentTool,
    handleCommandAction,
    handleEditingTextChange,
    handleEditingTextCommit,
    handleEditingTextMove,
    handleGenerateAIDiagram,
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
        disabled={!whiteboardAccess.hasEditAccess}
      />

      <AIAgentStatusWidget
        isGenerating={controller.isAIGenerating}
        thoughtPhase={controller.aiThoughtPhase}
        placedCount={controller.aiPlacedCount}
        currentNodeLabel={controller.aiCurrentNodeLabel}
        error={controller.aiError}
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
          const shape = elements.find((el: DrawingElement) => el.id === editingShapeLabelId);
          if (!shape) return null;
          const bounds = getElementBounds(shape);
          if (!bounds) return null;

          const cx = (bounds.minX + bounds.maxX) / 2;
          const cy = (bounds.minY + bounds.maxY) / 2;
          const sx = cx * canvasViewport.zoom + canvasViewport.panOffset.x;
          const sy = cy * canvasViewport.zoom + canvasViewport.panOffset.y;
          const labelMarkdown = normalizeRichTextInput(
            editingShapeLabelDraft || "TEXT",
          );
          const inputWidth = Math.max(
            120,
            Math.min(260, (bounds.maxX - bounds.minX) * canvasViewport.zoom * 0.9),
          );
          const editorFontSize = Math.max(
            9,
            editingShapeLabelFontSize * canvasViewport.zoom,
          );
          const editorLineHeight = editorFontSize * 1.2;

          return (
            <>
              <div
                style={{
                  position: "absolute",
                  left: sx,
                  top: sy - 36,
                  transform: "translate(-50%, -50%)",
                  zIndex: 111,
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 px-1 py-1 shadow-sm backdrop-blur"
              >
                <button
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    document.execCommand("bold");
                    shapeLabelEditorRef.current?.focus();
                    const next = editableHtmlToMarkdown(
                      shapeLabelEditorRef.current || document.createElement("div"),
                    );
                    setEditingShapeLabelDraft(next);
                  }}
                  className={`h-7 w-7 rounded text-xs font-bold ${
                    editingShapeLabelFontWeight === "700"
                      ? "bg-primary text-primary-foreground"
                      : "text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Bold"
                >
                  B
                </button>
                <button
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    document.execCommand("italic");
                    shapeLabelEditorRef.current?.focus();
                    const next = editableHtmlToMarkdown(
                      shapeLabelEditorRef.current || document.createElement("div"),
                    );
                    setEditingShapeLabelDraft(next);
                  }}
                  className={`h-7 w-7 rounded text-xs italic ${
                    editingShapeLabelFontStyle === "italic"
                      ? "bg-primary text-primary-foreground"
                      : "text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Italic"
                >
                  I
                </button>
                <button
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() =>
                    setEditingShapeLabelFontSize((s: number) => Math.max(12, s - 2))
                  }
                  className="h-7 w-7 rounded text-slate-700 hover:bg-slate-200"
                  title="Decrease size"
                >
                  -
                </button>
                <span className="w-10 text-center text-xs font-medium text-muted-foreground">
                  {editingShapeLabelFontSize}
                </span>
                <button
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() =>
                    setEditingShapeLabelFontSize((s: number) => Math.min(96, s + 2))
                  }
                  className="h-7 w-7 rounded text-slate-700 hover:bg-slate-200"
                  title="Increase size"
                >
                  +
                </button>
              </div>
              <div
                ref={(node) => {
                  if (node && !node.dataset.initialized) {
                    shapeLabelEditorRef.current = node;
                    node.innerHTML = markdownToEditableHtml(labelMarkdown);
                    node.dataset.initialized = "true";
                    setTimeout(() => {
                      node.focus();
                      try {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        selection?.removeAllRanges();
                        selection?.addRange(range);
                      } catch (e) {}
                    }, 0);
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                onMouseDown={(ev) => ev.stopPropagation()}
                onInput={(ev) => {
                  const next = editableHtmlToMarkdown(
                    ev.currentTarget as HTMLDivElement,
                  );
                  setEditingShapeLabelDraft(next);
                }}
                onKeyDown={(ev) => {
                  const mod = ev.metaKey || ev.ctrlKey;
                  if (mod && ev.key.toLowerCase() === "b") {
                    ev.preventDefault();
                    document.execCommand("bold");
                    setEditingShapeLabelDraft(
                      editableHtmlToMarkdown(
                        shapeLabelEditorRef.current || ev.currentTarget,
                      ),
                    );
                    return;
                  }
                  if (mod && ev.key.toLowerCase() === "i") {
                    ev.preventDefault();
                    document.execCommand("italic");
                    setEditingShapeLabelDraft(
                      editableHtmlToMarkdown(
                        shapeLabelEditorRef.current || ev.currentTarget,
                      ),
                    );
                    return;
                  }
                  if (mod && (ev.key === "+" || ev.key === "=")) {
                    ev.preventDefault();
                    setEditingShapeLabelFontSize((s: number) => Math.min(96, s + 2));
                    return;
                  }
                  if (mod && ev.key === "-") {
                    ev.preventDefault();
                    setEditingShapeLabelFontSize((s: number) => Math.max(12, s - 2));
                    return;
                  }
                  if (ev.key === "Escape") {
                    setEditingShapeLabelId(null);
                    setEditingShapeLabelDraft("");
                    return;
                  }
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    const nextLabel =
                      editableHtmlToMarkdown(
                        shapeLabelEditorRef.current || ev.currentTarget,
                      ) || editingShapeLabelDraft || "TEXT";
                    updateElement({
                      ...shape,
                      label: nextLabel,
                      fontSize: editingShapeLabelFontSize,
                      fontWeight: editingShapeLabelFontWeight,
                      fontStyle: editingShapeLabelFontStyle,
                    } as unknown as DrawingElementJson);
                    setEditingShapeLabelId(null);
                    setEditingShapeLabelDraft("");
                  }
                }}
                onBlur={() => {
                  const nextLabel =
                    editableHtmlToMarkdown(shapeLabelEditorRef.current || "") ||
                    editingShapeLabelDraft ||
                    "TEXT";
                  updateElement({
                    ...shape,
                    label: nextLabel,
                    fontSize: editingShapeLabelFontSize,
                    fontWeight: editingShapeLabelFontWeight,
                    fontStyle: editingShapeLabelFontStyle,
                  } as unknown as DrawingElementJson);
                  setEditingShapeLabelId(null);
                  setEditingShapeLabelDraft("");
                }}
                style={{
                  position: "absolute",
                  left: sx,
                  top: sy,
                  transform: "translate(-50%, -50%)",
                  width: inputWidth,
                  zIndex: 110,
                  textAlign: "center",
                  fontSize: editorFontSize,
                  fontWeight: editingShapeLabelFontWeight,
                  fontStyle: editingShapeLabelFontStyle as
                    | "normal"
                    | "italic",
                  lineHeight: `${editorLineHeight}px`,
                  letterSpacing: 0,
                  padding: 0,
                  minHeight: `${editorLineHeight}px`,
                  margin: 0,
                  direction: "ltr",
                  unicodeBidi: "plaintext",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  color: getAdaptiveColor(shape.color, typeof document !== 'undefined' && document.documentElement.classList.contains('dark')),
                  caretColor: getAdaptiveColor(shape.color, typeof document !== 'undefined' && document.documentElement.classList.contains('dark')),
                }}
                className="bg-transparent outline-none"
              />
            </>
          );
        })()}
    </>
  );
};

export default WhiteboardEditingOverlays;
