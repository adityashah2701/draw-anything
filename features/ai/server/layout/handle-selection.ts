import type { Bounds, ConnectionHandle } from "@/features/whiteboard/types/whiteboard.types";

/** The part of a placed node that decides which sides its edges use. */
export interface HandleNode {
  node: { id: string };
  element: { type: string };
  bounds: Bounds;
}

/** Leave from the side that faces the target: below/above when it is in another row, else left/right. */
export const chooseHandles = (
  source: HandleNode,
  target: HandleNode,
): { from: ConnectionHandle; to: ConnectionHandle } => {
  if (target.bounds.minY >= source.bounds.maxY - 1) return { from: "bottom", to: "top" };
  if (target.bounds.maxY <= source.bounds.minY + 1) return { from: "top", to: "bottom" };
  if (target.bounds.minX >= source.bounds.minX) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
};

/**
 * Two edges between the same pair of nodes (a request and its response, or two labelled calls) would
 * leave the same handles and be drawn on top of each other. The second uses the nodes' right sides
 * and the third their left sides (bottom/top sides when the pair sits side by side), which routes it
 * around as a visible loop instead of hiding it behind the first.
 */
export const spreadParallelEdges = (
  handles: { from: ConnectionHandle; to: ConnectionHandle },
  source: HandleNode,
  target: HandleNode,
  used: Map<string, number>,
): { from: ConnectionHandle; to: ConnectionHandle } => {
  const ends = [`${source.node.id}.${handles.from}`, `${target.node.id}.${handles.to}`].sort().join("|");
  const seen = used.get(ends) ?? 0;
  used.set(ends, seen + 1);
  if (seen === 0) return handles;
  const vertical = handles.from === "top" || handles.from === "bottom";
  const side: ConnectionHandle = vertical ? (seen === 1 ? "right" : "left") : seen === 1 ? "bottom" : "top";
  return { from: side, to: side };
};

/**
 * A decision's branches leave from different corners (the straight-ahead one below, the others to the
 * side they lie on) instead of sharing one stub. `used` holds the `nodeId.handle` pairs already taken.
 */
export const decisionExitHandle = (
  source: HandleNode,
  target: HandleNode,
  base: { from: ConnectionHandle; to: ConnectionHandle },
  outDegree: number,
  used: Set<string>,
): { from: ConnectionHandle; to: ConnectionHandle } => {
  if (source.element.type !== "diamond" || outDegree < 2 || base.from !== "bottom") return base;
  const dx = (target.bounds.minX + target.bounds.maxX - source.bounds.minX - source.bounds.maxX) / 2;
  const side: ConnectionHandle | null = dx > 1 ? "right" : dx < -1 ? "left" : null;
  return side && !used.has(`${source.node.id}.${side}`) ? { ...base, from: side } : base;
};
