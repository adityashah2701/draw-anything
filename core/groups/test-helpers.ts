import type { DrawingElement, GroupRecord, StoredElement } from "@/features/whiteboard/types/whiteboard.types";

type Extra = Partial<DrawingElement> & Record<string, unknown>;

/** A rectangle from its top-left corner and size. */
export const rect = (id: string, x: number, y: number, w = 100, h = 60, extra: Extra = {}): DrawingElement =>
  ({
    id,
    type: "rectangle",
    points: [
      { x, y },
      { x: x + w, y: y + h },
    ],
    color: "#000000",
    strokeWidth: 2,
    ...extra,
  }) as DrawingElement;

/** An arrow glued to two shapes. */
export const arrow = (id: string, from: string | undefined, to: string | undefined, extra: Extra = {}): DrawingElement =>
  ({
    id,
    type: "arrow",
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ],
    color: "#000000",
    strokeWidth: 2,
    startConnection: from ? { elementId: from } : undefined,
    endConnection: to ? { elementId: to } : undefined,
    ...extra,
  }) as DrawingElement;

export const group = (id: string, extra: Partial<GroupRecord> = {}): GroupRecord => ({
  id,
  type: "group",
  points: [],
  color: "#000000",
  strokeWidth: 0,
  ...extra,
});

/** Bounds of a two-point shape, for tests that need a `getBounds`. */
export const boundsOf = (shape: DrawingElement | undefined) => {
  if (!shape || shape.points.length === 0) return null;
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/** Round-trip through JSON exactly as the saved snapshot does (drops `undefined` keys). */
export const viaJson = <T extends StoredElement[]>(stored: T): T => JSON.parse(JSON.stringify(stored)) as T;
