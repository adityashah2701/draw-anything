import type { Placement, PlacementEngine } from "./types";

/**
 * Last-resort layout: nodes in the order given, in rows of equal width. Ugly but total: it cannot
 * fail on any graph, never overlaps, and is deterministic. Used only when an engine throws, so a
 * layout bug costs a diagram its tidiness instead of the whole generation.
 */
export const placeGrid: PlacementEngine = ({ nodes, gaps }) => {
  const placement: Placement = new Map();
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const cellWidth = Math.max(0, ...nodes.map((n) => n.width)) + gaps.horizontal;
  let top = 150;
  for (let start = 0; start < nodes.length; start += columns) {
    const row = nodes.slice(start, start + columns);
    const rowHeight = Math.max(...row.map((n) => n.height));
    row.forEach((n, i) => placement.set(n.id, { x: 960 - (columns * cellWidth) / 2 + i * cellWidth, y: top + (rowHeight - n.height) / 2 }));
    top += rowHeight + gaps.vertical;
  }
  return placement;
};
