import type { DrawingElement, FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/** A frame from its top-left corner and size. */
export const frame = (id: string, x: number, y: number, w = 400, h = 300, extra: Partial<FrameShape> = {}): FrameShape => ({
  id,
  type: "frame",
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
  color: "#64748b",
  strokeWidth: 1,
  ...extra,
});

/** Applies a result's patch to a list; fails the test when the result is a failure. */
export const must = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
};

export const ids = (list: readonly StoredElement[]) => list.map((item) => item.id);
export const byId = (list: readonly StoredElement[], id: string) => list.find((item) => item.id === id) as DrawingElement;
