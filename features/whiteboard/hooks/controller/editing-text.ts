import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export interface TextFormat {
  fontSize: number;
  fontWeight: string | number;
  fontStyle: string;
}

/** Only the three format fields reach the element, whatever else the editor passes. */
export const withTextFormat = <T extends object>(base: T, text: string, { fontSize, fontWeight, fontStyle }: TextFormat) =>
  ({ ...base, text, fontSize, fontWeight, fontStyle }) as T;

export type TextCommit =
  | { kind: "add"; element: DrawingElement }
  | { kind: "update"; element: DrawingElement }
  | { kind: "delete"; id: string }
  | { kind: "none" };

/**
 * What finishing a text edit does. A new element with no text is dropped, an existing one is updated from its
 * latest stored copy (not the editor's snapshot, which other users may have outdated), and emptying an
 * existing one deletes it.
 */
export const resolveTextCommit = ({
  editing,
  isNew,
  text,
  format,
  stored,
}: {
  editing: DrawingElement;
  isNew: boolean;
  text: string;
  format: TextFormat;
  stored: DrawingElement | undefined;
}): TextCommit => {
  const trimmed = text.trim();
  const apply = (base: DrawingElement) => withTextFormat(base, trimmed, format);
  if (isNew) return trimmed ? { kind: "add", element: apply(editing) } : { kind: "none" };
  return trimmed ? { kind: "update", element: apply(stored ?? editing) } : { kind: "delete", id: editing.id };
};
