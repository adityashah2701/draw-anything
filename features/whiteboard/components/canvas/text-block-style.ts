import type { CSSProperties } from "react";
import { FONT_FAMILY } from "@/core/text/typography";

export interface TextBlockEditorStyleInput {
  /** Already multiplied by zoom. */
  fontSizePx: number;
  lineHeightPx: number;
  fontWeight: string;
  italic: boolean;
  color: string;
}

/** The contentEditable that replaces a standalone text element while it is edited. */
export const textBlockEditorStyle = (i: TextBlockEditorStyleInput): CSSProperties => ({
  outline: "none",
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  minWidth: 48,
  fontFamily: FONT_FAMILY,
  fontSize: i.fontSizePx,
  fontWeight: i.fontWeight,
  fontStyle: i.italic ? "italic" : "normal",
  letterSpacing: "0",
  color: i.color,
  caretColor: i.color,
  lineHeight: `${i.lineHeightPx}px`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  display: "block",
});
