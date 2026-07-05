"use client";

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  CSSProperties,
} from "react";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  editableHtmlToMarkdown,
  markdownToEditableHtml,
  normalizeRichTextInput,
} from "@/features/whiteboard/utils/rich-text-renderer";


let _injected = false;
function ensureStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const s = document.createElement("style");
  s.textContent = `
    .ctb-root {
      /* No animation — even a scale(0.98→1) pop causes visible text shift on entry */
    }
    .ctb-editor:empty::before {
      content: attr(data-ph);
      color: rgba(150,150,150,0.3);
      font-style: normal;
      pointer-events: none;
    }
    .ctb-editor::selection {
      background: rgba(59,130,246,0.15);
    }
    .ctb-editor {
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
  `;
  document.head.appendChild(s);
}

// ─── Types ────────────────────────────────────────────────────────────────────

import { TextFormat, TextToolbar } from "../overlays/text-toolbar";
import { getAdaptiveColor } from "@/features/whiteboard/utils/canvas-render-utils";
import { FONT_FAMILY } from "@/core/shapes/base/shape-label-renderer";

export interface CanvasTextBlockProps {
  element: DrawingElement;
  zoom: number;
  panOffset: { x: number; y: number };
  selectAllOnMount?: boolean;
  /** Called with final text and format when user commits (Enter / Escape). Empty string = discard. */
  onCommit: (
    text: string,
    format: {
      fontSize: number;
      fontWeight: string | number;
      fontStyle: string;
    },
  ) => void;
  /** Called when user types or changes formatting - for real-time sync */
  onChange?: (
    text: string,
    format: {
      fontSize: number;
      fontWeight: string | number;
      fontStyle: string;
    },
  ) => void;
  /** Called when user drags text to a new canvas position */
  onMove?: (pos: { x: number; y: number }) => void;
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the computed font-weight string for a given TextFormat state.
 */
function resolveFontWeight(fmt: TextFormat): string {
  if (fmt.heading === "h1") return "800";
  if (fmt.heading === "h2") return "700";
  if (fmt.heading === "h3") return "600";
  if (fmt.bold) return "700";
  return "400";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CanvasTextBlock({
  element,
  zoom,
  panOffset,
  selectAllOnMount = false,
  onCommit,
  onChange,
  onMove,
  disabled = false,
}: CanvasTextBlockProps) {
  // Inject styles once
  useEffect(() => {
    ensureStyles();
  }, []);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const justMountedRef = useRef(true);

  // ── Format ────────────────────────────────────────────────────────────────
  const [fmt, setFmt] = useState<TextFormat>(() => {
    const fw = element.fontWeight?.toString() || "400";
    const fs = element.fontStyle || "normal";
    const baseSize = element.fontSize || 18;

    let heading: TextFormat["heading"] = "none";
    if (fw === "800") heading = "h1";
    else if (fw === "700") heading = "h2";
    else if (fw === "600" && baseSize >= 20) heading = "h3";

    return {
      bold: (fw === "600" && heading === "none") || fw === "bold" || (fw === "700" && heading === "none"),
      italic: fs === "italic",
      heading,
      size: baseSize,
    };
  });

  // ── Visual state ──────────────────────────────────────────────────────────
  const [focused, setFocused] = useState(false);
  const [toolbarAnchor, setToolbarAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const [localPos, setLocalPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const dragRef = useRef<{
    mx: number;
    my: number;
    cx: number;
    cy: number;
  } | null>(null);

  // ── Derived geometry ──────────────────────────────────────────────────────
  const canvasPos = localPos ?? element.points[0];
  const sx = canvasPos.x * zoom + panOffset.x;
  const sy = canvasPos.y * zoom + panOffset.y;

  /**
   * effectiveSize = actual rendered pixel size on screen (already zoom-scaled).
   * The editor div uses this directly as its CSS font-size.
   * No additional transform:scale(zoom) is applied.
   */
  const effectiveSize = useMemo(() => {
    return fmt.size * zoom;
  }, [fmt.size, zoom]);

  const lineHeightPx = effectiveSize * 1.2;

  // ── Focus immediately on mount ────────────────────────────────────────────
  useLayoutEffect(() => {
    committedRef.current = false;
    const el = editorRef.current;
    if (el && !el.dataset.initialized) {
      el.innerHTML = markdownToEditableHtml(
        normalizeRichTextInput(element.text || ""),
      );
      el.dataset.initialized = "true";
    }
    el?.focus();

    try {
      const r = document.createRange();
      r.selectNodeContents(el as Node);
      if (!selectAllOnMount) {
        r.collapse(false);
      }
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  // Set justMounted false after first tick to enable outside-click detection
  useEffect(() => {
    const timer = setTimeout(() => {
      justMountedRef.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // ── Commit helpers ────────────────────────────────────────────────────────
  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;

    const markdown = editableHtmlToMarkdown(editorRef.current || "");
    const text = markdown.trim();

    onCommit(text, {
      fontSize: fmt.size,
      fontWeight: resolveFontWeight(fmt),
      fontStyle: fmt.italic ? "italic" : "normal",
    });
  }, [onCommit, fmt]);

  // ── Toolbar anchor update ─────────────────────────────────────────────────
  const refreshAnchor = useCallback(() => {
    const r = editorRef.current?.getBoundingClientRect();
    if (r) setToolbarAnchor({ x: r.left, y: r.top });
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleFocus = useCallback(() => {
    setFocused(true);
    refreshAnchor();
  }, [refreshAnchor]);

  useEffect(() => {
    if (focused) {
      refreshAnchor();
    }
  }, [sx, sy, focused, refreshAnchor]);

  // Click outside to commit
  useEffect(() => {
    if (!focused) return;
    const handleWindowMousedown = (e: MouseEvent) => {
      if (justMountedRef.current) return;
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setTimeout(() => {
          if (document.activeElement !== editorRef.current) {
            commit();
          }
        }, 120);
      }
    };
    window.addEventListener("mousedown", handleWindowMousedown);
    return () => window.removeEventListener("mousedown", handleWindowMousedown);
  }, [focused, commit]);

  // Blur: ONLY updates visual state — no commit
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (editorRef.current?.contains(active)) return;
      setFocused(false);
      setToolbarAnchor(null);
    }, 100);
  }, []);

  /**
   * handleInput: serialize the current DOM to markdown and fire onChange.
   * We do NOT reset innerHTML here — that would destroy the cursor position.
   */
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const markdown = editableHtmlToMarkdown(e.currentTarget);
      onChange?.(markdown, {
        fontSize: fmt.size,
        fontWeight: resolveFontWeight(fmt),
        fontStyle: fmt.italic ? "italic" : "normal",
      });
    },
    [fmt, onChange],
  );

  /**
   * Apply inline formatting via execCommand. Still universally supported.
   * Preserves selection and modifies the DOM in place.
   */
  const applyInlineFormat = useCallback(
    (command: "bold" | "italic") => {
      document.execCommand(command);
      const markdown = editableHtmlToMarkdown(editorRef.current || "");
      onChange?.(markdown, {
        fontSize: fmt.size,
        fontWeight: resolveFontWeight(fmt),
        fontStyle: fmt.italic ? "italic" : "normal",
      });
    },
    [fmt, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        e.preventDefault();
        commit();
        return;
      }
      if (mod && e.key === "b") {
        e.preventDefault();
        applyInlineFormat("bold");
      } else if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        applyInlineFormat("italic");
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    },
    [commit, applyInlineFormat],
  );

  // ── Drag ──────────────────────────────────────────────────────────────────
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        mx: e.clientX,
        my: e.clientY,
        cx: canvasPos.x,
        cy: canvasPos.y,
      };

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        setLocalPos({
          x: dragRef.current.cx + (me.clientX - dragRef.current.mx) / zoom,
          y: dragRef.current.cy + (me.clientY - dragRef.current.my) / zoom,
        });
      };
      const handleMouseUp = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const pos = {
          x: dragRef.current.cx + (me.clientX - dragRef.current.mx) / zoom,
          y: dragRef.current.cy + (me.clientY - dragRef.current.my) / zoom,
        };
        dragRef.current = null;
        setLocalPos(pos);
        onMove?.(pos);
        setTimeout(() => editorRef.current?.focus(), 40);
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp, { once: true });
      window.addEventListener(
        "mouseup",
        () => window.removeEventListener("mousemove", handleMouseMove),
        { once: true },
      );
    },
    [canvasPos, zoom, disabled, onMove],
  );

  if (disabled) return null;

  // ── Styles ────────────────────────────────────────────────────────────────
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const editorStyle: CSSProperties = {
    outline: "none",
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    minWidth: 48,
    fontFamily: FONT_FAMILY,
    fontSize: effectiveSize,
    fontWeight: resolveFontWeight(fmt),
    fontStyle: fmt.italic ? "italic" : "normal",
    letterSpacing: "0",
    color: getAdaptiveColor(element.color || "#111", isDark),
    caretColor: getAdaptiveColor(element.color || "#111", isDark),
    lineHeight: `${lineHeightPx}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    display: "block",
  };

  return (
    <>
      {focused && toolbarAnchor && (
        <TextToolbar
          fmt={fmt}
          ax={toolbarAnchor.x}
          ay={toolbarAnchor.y}
          onBold={() => {
            applyInlineFormat("bold");
            editorRef.current?.focus();
          }}
          onItalic={() => {
            applyInlineFormat("italic");
            editorRef.current?.focus();
          }}
          onHeading={(h) => {
            const nextHeading = fmt.heading === h ? "none" : h;
            let nextSize = fmt.size;
            if (nextHeading === "h1") nextSize = Math.max(fmt.size, 36);
            else if (nextHeading === "h2") nextSize = Math.max(fmt.size, 26);
            else if (nextHeading === "h3") nextSize = Math.max(fmt.size, 20);

            setFmt((f) => ({ ...f, heading: nextHeading, size: nextSize }));
            editorRef.current?.focus();
            const markdown = editableHtmlToMarkdown(editorRef.current || "");
            const nextFmt = { ...fmt, heading: nextHeading, size: nextSize };
            onChange?.(markdown, {
              fontSize: nextFmt.size,
              fontWeight: resolveFontWeight(nextFmt),
              fontStyle: nextFmt.italic ? "italic" : "normal",
            });
          }}
          onSize={(d) => {
            const nextSize = Math.max(10, Math.min(120, fmt.size + d));
            setFmt((f) => ({ ...f, size: nextSize }));
            editorRef.current?.focus();
            const markdown = editableHtmlToMarkdown(editorRef.current || "");
            const nextFmt = { ...fmt, size: nextSize };
            onChange?.(markdown, {
              fontSize: nextSize,
              fontWeight: resolveFontWeight(nextFmt),
              fontStyle: nextFmt.italic ? "italic" : "normal",
            });
          }}
        />
      )}

      <div
        className="ctb-root"
        style={{
          position: "absolute",
          left: sx,
          top: sy,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          pointerEvents: "all",
          cursor: focused ? "default" : "move",
        }}
        onMouseDown={(e) => {
          if (!focused) startDrag(e);
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          className="ctb-editor"
          data-ph="Type something…"
          onFocus={handleFocus}
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          style={editorStyle}
        />
      </div>
    </>
  );
}

export default CanvasTextBlock;
