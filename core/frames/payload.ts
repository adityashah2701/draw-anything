import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildFrameIndex, frameDescendants } from "./frame-index";

/**
 * `ids` plus everything owned (at any depth) by a frame among them, each id once. A frame in a
 * selection stands for its whole contents when it is moved, copied, restacked or deleted, but the
 * selection itself stays just the frame, so a click on its header shows one box with its own handles.
 * Boards without frames take the fast path and get `ids` back unchanged.
 */
export const withFrameContents = (shapes: readonly DrawingElement[], ids: readonly string[]): string[] => {
  if (!shapes.some((shape) => shape.type === "frame")) return [...ids];
  const index = buildFrameIndex(shapes);
  const out = new Set(ids);
  for (const id of ids) if (index.frames.has(id)) for (const owned of frameDescendants(index, id)) out.add(owned);
  return [...out];
};
