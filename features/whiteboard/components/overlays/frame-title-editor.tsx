import { useEffect, useRef } from "react";
import { MAX_FRAME_TITLE_LENGTH, frameRegions, resolveFrame } from "@/core/frames/frame-model";
import { TITLE_INSET, TITLE_SIZE } from "@/core/shapes/frame/renderer";
import { resolveTextColor } from "@/core/shapes/base/shape-label-renderer";
import { FONT_FAMILY } from "@/core/text/typography";
import type { FrameShape, Point } from "@/features/whiteboard/types/whiteboard.types";

interface FrameTitleEditorProps {
  frame: FrameShape;
  zoom: number;
  panOffset: Point;
  /** Called once with the finished title; Escape passes null (keep the old one). */
  onDone: (title: string | null) => void;
}

/**
 * The frame's title, edited where it is drawn: a single line over the header or tab. The title is a
 * field of the frame, so this is a plain input, not a text element. Enter or a click elsewhere keeps the
 * text, Escape throws it away.
 */
export function FrameTitleEditor({ frame, zoom, panOffset, onDone }: FrameTitleEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const header = frameRegions(frame)?.header;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  if (!header) return null;
  const finish = (title: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(title);
  };

  const resolved = resolveFrame(frame);
  const left = header.minX * zoom + panOffset.x + TITLE_INSET * zoom - 2;
  const height = header.height * zoom;
  // A short tab still needs room to type into; it grows to the right of the tab while editing.
  const width = Math.max(header.width * zoom - (TITLE_INSET * zoom - 2), 120 * zoom);
  return (
    <input
      ref={inputRef}
      aria-label="Frame title"
      defaultValue={frame.title ?? resolved.title}
      maxLength={MAX_FRAME_TITLE_LENGTH}
      spellCheck={false}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className="bg-transparent outline-none"
      style={{
        position: "absolute",
        left,
        top: header.minY * zoom + panOffset.y,
        width,
        height,
        padding: "0 2px",
        margin: 0,
        border: 0,
        zIndex: 111,
        fontFamily: FONT_FAMILY,
        fontWeight: 600,
        fontSize: TITLE_SIZE * zoom,
        lineHeight: `${height}px`,
        color: resolveTextColor(frame.color, frame.fill),
      }}
    />
  );
}
