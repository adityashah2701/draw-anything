import { useRef, useState, useCallback, useEffect } from "react";
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
import { measureShapeLabel, FONT_FAMILY } from "@/core/shapes/base/shape-label-renderer";

// ─── Shape Label Editor ───────────────────────────────────────────────────────

/**
 * ShapeLabelEditor — pixel-perfect inline editor for shape center labels.
 *
 * Positioning strategy:
 * - We want the editor to sit exactly over the canvas-rendered label.
 * - The canvas renders the label centered at (cx, cy) in world coords.
 * - In screen space: sx = cx * zoom + panX, sy = cy * zoom + panY.
 * - We position the div at (sx, sy) and use transform: translate(-50%, -50%)
 *   to center it — no additional scale() transform.
 * - Font size is pre-zoomed: editorFontSize = unzoomedFontSize * zoom.
 * - Width is pre-zoomed: editorWidth = unzoomedWidth * zoom.
 * - Measure exact vertical offset to perfectly align CSS text baseline with Canvas text baseline.
 */
const _labelOffsetCache = new Map<string, number>();

function measureLabelEditTopOffset(
  fontSize: number,
  fontWeight: string,
  fontStyle: string,
): number {
  const key = `lbl|${fontSize}|${fontWeight}|${fontStyle}`;
  const cached = _labelOffsetCache.get(key);
  if (cached !== undefined) return cached;

  if (typeof document === "undefined") {
    return fontSize * 0.1;
  }

  const lineHeight = fontSize * 1.2;
  const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${FONT_FAMILY}`;

  // 1. Canvas fontAscent (distance from 'top' to alphabetic baseline)
  let fontAscent = fontSize * 0.8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = fontStr;
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText("Mg");
    if (metrics.fontBoundingBoxAscent !== undefined) {
      fontAscent = metrics.fontBoundingBoxAscent;
    } else if (metrics.actualBoundingBoxAscent !== undefined) {
      fontAscent = metrics.actualBoundingBoxAscent;
    }
  }

  // 2. CSS baseline Y
  const testDiv = document.createElement("div");
  testDiv.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    visibility: hidden;
    pointer-events: none;
    font-family: ${FONT_FAMILY};
    font-size: ${fontSize}px;
    font-weight: ${fontWeight};
    font-style: ${fontStyle};
    line-height: ${lineHeight}px;
    white-space: pre;
    padding: 0;
    margin: 0;
    border: 0;
  `;
  testDiv.innerHTML = `<span>Mg</span><span id="baseline-marker" style="display: inline-block; width: 0; height: 0;"></span>`;
  document.body.appendChild(testDiv);

  const marker = testDiv.querySelector("#baseline-marker") as HTMLSpanElement;
  const cssBaselineY = marker.offsetTop;

  document.body.removeChild(testDiv);

  const offset = cssBaselineY - fontAscent;
  _labelOffsetCache.set(key, offset);
  return offset;
}

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
          editorLineHeight: fontSize * zoom * 1.2,
          editorWidth: Math.max(120, availableWidthPx),
          editorMinHeight: fontSize * zoom * 1.2,
        };
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return {
          editorFontSize: fontSize * zoom,
          editorLineHeight: fontSize * zoom * 1.2,
          editorWidth: Math.max(120, availableWidthPx),
          editorMinHeight: fontSize * zoom * 1.2,
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
      });
      if (metrics) {
        return {
          editorFontSize: metrics.finalFontSize,
          editorLineHeight: metrics.finalLineHeight,
          editorWidth: Math.max(120, availableWidthPx),
          editorMinHeight: metrics.height,
        };
      }
      return {
        editorFontSize: fontSize * zoom,
        editorLineHeight: fontSize * zoom * 1.2,
        editorWidth: Math.max(120, availableWidthPx),
        editorMinHeight: fontSize * zoom * 1.2,
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
        style={{
          position: "absolute",
          left: sx,
          /**
           * Positioning: center the editor on (sx, sy) then shift up by editTopOffset.
           *
           * translate(-50%, -50%) centers the div on (sx, sy).
           * Then we subtract editTopOffset to compensate for CSS half-leading so the
           * first glyph aligns with the canvas-drawn label top.
           *
           * This is equivalent to positioning at:
           *   left = sx - editorWidth/2
           *   top  = sy - editorMinHeight/2 - editTopOffset
           * but using CSS transform for cleaner sub-pixel handling.
           */
          top: sy - editTopOffset,
          transform: "translate(-50%, -50%)",
          width: editorWidth,
          zIndex: 110,
          textAlign: "center",
          // Font size is already zoom-scaled (editorFontSize = unzoomedFontSize * zoom)
          fontSize: editorFontSize,
          fontWeight,
          fontStyle: fontStyle as "normal" | "italic",
          lineHeight: `${editorLineHeight}px`,
          letterSpacing: 0,
          padding: 0,
          minHeight: `${editorMinHeight}px`,
          margin: 0,
          direction: "ltr",
          unicodeBidi: "plaintext",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: FONT_FAMILY,
          color: getAdaptiveColor(
            shape.color,
            isDark,
          ),
          caretColor: getAdaptiveColor(shape.color, isDark),
        }}
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
          const shape = elements.find(
            (el: DrawingElement) => el.id === editingShapeLabelId,
          );
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

          const availableWidthPx =
            (bounds.maxX - bounds.minX) * canvasViewport.zoom;
          const availableHeightPx =
            (bounds.maxY - bounds.minY) * canvasViewport.zoom;

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
