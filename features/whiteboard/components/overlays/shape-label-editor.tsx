import { useRef, useState, useCallback, useEffect } from "react";
import type { DrawingElement } from "@/core/model";
import type { DrawingElementJson } from "@/liveblocks.config";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import { measureShapeLabel, resolveTextColor } from "@/core/shapes/base/shape-label-renderer";
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
} from "@/features/whiteboard/utils/rich-text-renderer";
import { measureLabelEditTopOffset, shapeLabelEditorStyle } from "./shape-label-editor-style";

export interface ShapeLabelEditorProps {
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

export function ShapeLabelEditor({
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

