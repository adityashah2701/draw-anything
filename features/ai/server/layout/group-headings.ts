import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import type { Box } from "./geometry";

export interface HeadingRequest {
  id: string;
  /** The group's frame. */
  frame: Box;
  width: number;
  height: number;
  /** Distance from the frame's top edge to the heading's top. */
  top: number;
  /** Distance from the frame's side to a heading that sits at the left or the right. */
  inset: number;
}

export interface HeadingSpot {
  x: number;
  y: number;
  /** The frame had to grow to the right to make room: its new right edge. */
  frameMaxX?: number;
}

const MARGIN = 14;

/** The stretches of the heading's row that connectors run through, as x intervals. */
const blockedSpans = (y: number, height: number, paths: Point[][]): Array<[number, number]> => {
  const spans: Array<[number, number]> = [];
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (hi < y - 2 || lo > y + height + 2) continue;
      spans.push(Math.abs(a.x - b.x) < 0.5 ? [a.x, a.x] : [Math.min(a.x, b.x), Math.max(a.x, b.x)]);
    }
  }
  return spans;
};

/**
 * Where each group's heading goes along the top of its frame. It starts at the left; if a connector runs
 * through that spot (an arrow entering the group right under the heading), the nearest spot to its right
 * that every connector misses is used. When there is none inside the frame, the frame grows to the right
 * to make room, as long as `canGrow` allows it (it must not swallow a node that is not a member).
 */
export const placeGroupHeadings = (
  requests: HeadingRequest[],
  paths: Point[][],
  canGrow: (id: string, grown: Box) => boolean = () => true,
): Map<string, HeadingSpot> => {
  const placed = new Map<string, HeadingSpot>();
  for (const { id, frame, width, height, top, inset } of requests) {
    const y = frame.minY + top;
    const left = frame.minX + inset;
    const spans = blockedSpans(y, height, paths);
    const clear = (x: number) => spans.every(([from, to]) => to <= x - MARGIN + 0.001 || from >= x + width + MARGIN - 0.001);

    // The left edge, then just past each connector: the places a heading can sit without touching one.
    const starts = [left, ...spans.map(([, to]) => to + MARGIN)].sort((a, b) => a - b).filter((x) => x >= left);
    const inside = starts.find((x) => x + width <= frame.maxX - inset && clear(x));
    if (inside !== undefined) {
      placed.set(id, { x: inside, y });
      continue;
    }
    const outside = starts.find((x) => clear(x));
    if (outside !== undefined) {
      const grown = { ...frame, maxX: outside + width + inset };
      if (canGrow(id, grown)) {
        placed.set(id, { x: outside, y, frameMaxX: grown.maxX });
        continue;
      }
    }
    placed.set(id, { x: left, y });
  }
  return placed;
};
