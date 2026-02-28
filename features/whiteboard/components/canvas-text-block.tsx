"use client";

/**
 * CanvasTextBlock — production-grade canvas-native text editing
 *
 * Architecture:
 * - DRAFT MODE: text stays in local state while typing. Storage is NOT updated on every keystroke.
 * - COMMIT: only on Enter or Escape. Empty commit = notify parent to discard.
 * - BLUR: never auto-commits or auto-deletes.
 * - UNMOUNT: never auto-commits. Parent controls lifecycle.
 * - TOOLBAR: formatting toolbar appears above focused block; mousedown=preventDefault keeps editor focused.
 */

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  CSSProperties,
} from "react";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

// ─── One-time global style injection ─────────────────────────────────────────

let _injected = false;
function ensureStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes ctb-pop {
      0%   { opacity:0; transform:scale(0.98); }
      100% { opacity:1; transform:scale(1);    }
    }
    @keyframes ctb-bar {
      from { opacity:0; transform:translateY(4px) scale(0.98); }
      to   { opacity:1; transform:translateY(0)   scale(1);    }
    }
    .ctb-root { animation: ctb-pop 120ms cubic-bezier(.16,1,.3,1) forwards; }
    .ctb-editor:empty::before {
      content: attr(data-ph);
      color: rgba(150,150,150,0.3);
      font-style: normal;
      pointer-events: none;
    }
    .ctb-editor::selection {
      background: rgba(59,130,246,0.15);
    }
  `;
  document.head.appendChild(s);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Fmt {
  bold: boolean;
  italic: boolean;
  heading: "none" | "h1" | "h2" | "h3";
  size: number;
}

export interface CanvasTextBlockProps {
  element: DrawingElement;
  zoom: number;
  panOffset: { x: number; y: number };
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

// ─── Formatting Toolbar ───────────────────────────────────────────────────────

const H_LABELS = { none: "¶", h1: "H1", h2: "H2", h3: "H3" } as const;
const HEADINGS: Fmt["heading"][] = ["none", "h1", "h2", "h3"];

function Toolbar({
  fmt,
  color,
  ax,
  ay,
  onBold,
  onItalic,
  onHeading,
  onSize,
}: {
  fmt: Fmt;
  color: string;
  ax: number;
  ay: number;
  onBold: () => void;
  onItalic: () => void;
  onHeading: (h: Fmt["heading"]) => void;
  onSize: (d: number) => void;
}) {
  return (
    <div
      className="ctb-bar"
      onMouseDown={(e) => e.preventDefault()} // keep editor focused
      style={{
        position: "fixed",
        top: ay - 52,
        left: ax,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        background: "rgba(24,24,27,0.8)",
        backdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
        userSelect: "none",
        animation: "ctb-bar 0.12s cubic-bezier(.16,1,.3,1) forwards",
      }}
    >
      <Btn active={fmt.bold} fw="bold" onClick={onBold} tip="Bold ⌘B">
        B
      </Btn>
      <Btn active={fmt.italic} fi="italic" onClick={onItalic} tip="Italic ⌘I">
        I
      </Btn>
      <Sep />
      {HEADINGS.map((h) => (
        <Btn
          key={h}
          active={fmt.heading === h}
          fw="600"
          fs={h === "none" ? 15 : 11}
          w={h === "none" ? 24 : 30}
          onClick={() => onHeading(h)}
          tip={h === "none" ? "Body" : `H${h[1]}`}
        >
          {H_LABELS[h]}
        </Btn>
      ))}
      <Sep />
      <Btn
        active={false}
        fs={11}
        w={28}
        onClick={() => onSize(-2)}
        tip="Smaller"
      >
        A−
      </Btn>
      <span
        style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 10,
          width: 22,
          textAlign: "center",
          fontFamily: "monospace",
        }}
      >
        {fmt.size}
      </span>
      <Btn active={false} fs={11} w={28} onClick={() => onSize(2)} tip="Larger">
        A+
      </Btn>
    </div>
  );
}

function Btn({
  active,
  fw,
  fi,
  fs = 13,
  w = 28,
  onClick,
  tip,
  children,
}: {
  active: boolean;
  fw?: string;
  fi?: string;
  fs?: number;
  w?: number;
  onClick: () => void;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={tip}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        background: active ? "rgba(255,255,255,0.18)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: w,
        height: 28,
        fontSize: fs,
        fontFamily: "system-ui,sans-serif",
        fontWeight: fw,
        fontStyle: fi,
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: "rgba(255,255,255,0.13)",
        margin: "0 4px",
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CanvasTextBlock({
  element,
  zoom,
  panOffset,
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

  // ── Draft (local only — NOT synced to storage per keystroke) ──────────────
  const [draft, setDraft] = useState(element.text || "");

  // ── Format ────────────────────────────────────────────────────────────────
  const [fmt, setFmt] = useState<Fmt>(() => {
    const fw = element.fontWeight?.toString() || "400";
    const fs = element.fontStyle || "normal";
    const baseSize = element.fontSize || 18;

    let heading: Fmt["heading"] = "none";
    if (fw === "800") heading = "h1";
    else if (fw === "700") heading = "h2";
    else if (fw === "600" && baseSize >= 20) heading = "h3";

    return {
      bold: fw === "600" && heading === "none",
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
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    mx: number;
    my: number;
    cx: number;
    cy: number;
  } | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const canvasPos = localPos ?? element.points[0];
  const sx = canvasPos.x * zoom + panOffset.x;
  const sy = canvasPos.y * zoom + panOffset.y;

  const effectiveSize = (() => {
    const base = fmt.size;
    let size = base;
    if (fmt.heading === "h1") size = Math.max(base, 36);
    else if (fmt.heading === "h2") size = Math.max(base, 26);
    else if (fmt.heading === "h3") size = Math.max(base, 20);
    return size * zoom;
  })();

  // ── Focus immediately on mount ────────────────────────────────────────────
  useLayoutEffect(() => {
    committedRef.current = false;
    const el = editorRef.current;
    if (!el) return;
    el.innerText = element.text || "";
    el.focus();
    // Caret to end
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
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
    const text = editorRef.current?.innerText?.trim() ?? draft.trim();

    // Map fmt to actual storage attributes
    const fw =
      fmt.heading === "h1"
        ? "800"
        : fmt.heading === "h2"
          ? "700"
          : fmt.heading === "h3"
            ? "600"
            : fmt.bold
              ? "600"
              : "400";
    const fs = fmt.italic ? "italic" : "normal";

    onCommit(text, {
      fontSize: fmt.size,
      fontWeight: fw,
      fontStyle: fs,
    });
  }, [onCommit, draft, fmt]);

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

  // Click outside to commit
  useEffect(() => {
    if (!focused) return;
    const handleWindowMousedown = (e: MouseEvent) => {
      // Ignore if we just mounted (avoid capturing the click that opened us)
      if (justMountedRef.current) return;

      // If click is outside the editor
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        // Small delay to let toolbar button mousedown (preventDefault) work
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

  const handleInput = useCallback(() => {
    const text = editorRef.current?.innerText ?? "";
    setDraft(text); // draft only — NOT sent to Liveblocks
    refreshAnchor();
    onChange?.(text, {
      fontSize: fmt.size,
      fontWeight:
        fmt.heading === "h1"
          ? "800"
          : fmt.heading === "h2"
            ? "700"
            : fmt.heading === "h3"
              ? "600"
              : fmt.bold
                ? "600"
                : "400",
      fontStyle: fmt.italic ? "italic" : "normal",
    });
  }, [fmt, onChange, refreshAnchor]);

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
        setFmt((f) => ({ ...f, bold: !f.bold }));
        return;
      }
      if (mod && e.key === "i") {
        e.preventDefault();
        setFmt((f) => ({ ...f, italic: !f.italic }));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    },
    [commit],
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
      setDragging(true);

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
        setDragging(false);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [canvasPos, zoom, disabled, onMove],
  );

  if (disabled) return null;

  // ── Styles ────────────────────────────────────────────────────────────────
  const glowColor = element.color || "#3b82f6";

  const wrapperStyle: CSSProperties = {
    padding: 0, // Zero padding for pixel-perfect alignment with canvas startX/startY
    background: "transparent",
    borderRadius: 4,
    border: "none",
    outline: focused ? `1.5px solid ${glowColor}40` : "none",
    outlineOffset: "2px",
    transition: "outline 120ms ease",
    cursor: focused ? "text" : "move",
    minWidth: 40,
    position: "relative",
  };

  const editorStyle: CSSProperties = {
    outline: "none",
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    minWidth: 120,
    maxWidth: "90vw",
    transform: "translateY(-0.08em)", // Compensate for line-height leading to match canvas top baseline
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: effectiveSize,
    fontWeight:
      fmt.heading === "h1"
        ? "800"
        : fmt.heading === "h2"
          ? "700"
          : fmt.heading === "h3"
            ? "600"
            : fmt.bold
              ? "600"
              : "400",
    fontStyle: fmt.italic ? "italic" : "normal",
    letterSpacing:
      fmt.heading === "h1"
        ? "-0.04em"
        : fmt.heading === "h2"
          ? "-0.03em"
          : "-0.01em",
    color: element.color || "#111",
    caretColor: element.color || "#111",
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    display: "block",
  };

  return (
    <>
      {focused && toolbarAnchor && (
        <Toolbar
          fmt={fmt}
          color={element.color}
          ax={toolbarAnchor.x}
          ay={toolbarAnchor.y}
          onBold={() => {
            const next = !fmt.bold;
            setFmt((f) => ({ ...f, bold: next }));
            editorRef.current?.focus();
            onChange?.(draft, {
              fontSize: fmt.size,
              fontWeight:
                fmt.heading === "h1"
                  ? "800"
                  : fmt.heading === "h2"
                    ? "700"
                    : fmt.heading === "h3"
                      ? "600"
                      : next
                        ? "600"
                        : "400",
              fontStyle: fmt.italic ? "italic" : "normal",
            });
          }}
          onItalic={() => {
            const next = !fmt.italic;
            setFmt((f) => ({ ...f, italic: next }));
            editorRef.current?.focus();
            onChange?.(draft, {
              fontSize: fmt.size,
              fontWeight:
                fmt.heading === "h1"
                  ? "800"
                  : fmt.heading === "h2"
                    ? "700"
                    : fmt.heading === "h3"
                      ? "600"
                      : fmt.bold
                        ? "600"
                        : "400",
              fontStyle: next ? "italic" : "normal",
            });
          }}
          onHeading={(h) => {
            const nextHeading = fmt.heading === h ? "none" : h;
            setFmt((f) => ({ ...f, heading: nextHeading }));
            editorRef.current?.focus();
            onChange?.(draft, {
              fontSize: fmt.size,
              fontWeight:
                nextHeading === "h1"
                  ? "800"
                  : nextHeading === "h2"
                    ? "700"
                    : nextHeading === "h3"
                      ? "600"
                      : fmt.bold
                        ? "600"
                        : "400",
              fontStyle: fmt.italic ? "italic" : "normal",
            });
          }}
          onSize={(d) => {
            const nextSize = Math.max(10, Math.min(120, fmt.size + d));
            setFmt((f) => ({
              ...f,
              size: nextSize,
            }));
            editorRef.current?.focus();
            onChange?.(draft, {
              fontSize: nextSize,
              fontWeight:
                fmt.heading === "h1"
                  ? "800"
                  : fmt.heading === "h2"
                    ? "700"
                    : fmt.heading === "h3"
                      ? "600"
                      : fmt.bold
                        ? "600"
                        : "400",
              fontStyle: fmt.italic ? "italic" : "normal",
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
        {/* Text surface */}
        <div style={wrapperStyle}>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-ph="Type..."
            className="ctb-editor"
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            style={editorStyle}
          />
        </div>
      </div>
    </>
  );
}

export default CanvasTextBlock;
