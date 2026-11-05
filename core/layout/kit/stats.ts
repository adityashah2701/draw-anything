import { overlapsWithin, rectAt } from "./rect";
import { fixedIds } from "./fixed";
import type { LayoutRequest, LayoutResult, LayoutStats } from "../types";

const MAX_PAIRS_NODES = 400;

/** The numbers a preview shows and the benchmark asserts, from a request and the result an engine gave for it. */
export const computeStats = (request: Pick<LayoutRequest, "graph" | "positions" | "mode">, result: Pick<LayoutResult, "positions">): LayoutStats => {
  const { graph, positions } = request;
  const fixed = fixedIds(request);
  const before = new Map<string, { x: number; y: number }>();
  const after = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    const was = positions.get(node.id);
    const moved = result.positions.get(node.id);
    if (was) before.set(node.id, { x: was.x, y: was.y });
    const at = moved ?? (was ? { x: was.x, y: was.y } : undefined);
    if (at) after.set(node.id, at);
  }

  const displacements: number[] = [];
  for (const [id, to] of after) {
    const from = before.get(id);
    if (from) displacements.push(Math.hypot(to.x - from.x, to.y - from.y));
  }
  const movedCount = displacements.filter((d) => d > 0).length;

  // Share of node pairs whose relative x order and y order survive (Misue et al.'s orthogonal ordering).
  const shared = graph.nodes.filter((n) => before.has(n.id) && after.has(n.id)).slice(0, MAX_PAIRS_NODES);
  let pairs = 0;
  let kept = 0;
  for (let i = 0; i < shared.length; i += 1) {
    for (let j = i + 1; j < shared.length; j += 1) {
      const [a, b] = [shared[i].id, shared[j].id];
      pairs += 1;
      if (Math.sign(before.get(a)!.x - before.get(b)!.x) === Math.sign(after.get(a)!.x - after.get(b)!.x) && Math.sign(before.get(a)!.y - before.get(b)!.y) === Math.sign(after.get(a)!.y - after.get(b)!.y)) kept += 1;
    }
  }

  const rects = graph.nodes.filter((n) => after.has(n.id)).slice(0, MAX_PAIRS_NODES).map((n) => rectAt(after.get(n.id)!.x, after.get(n.id)!.y, n));
  let overlaps = 0;
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) if (overlapsWithin(rects[i], rects[j])) overlaps += 1;

  return {
    nodes: graph.nodes.length,
    moved: movedCount,
    heldFixed: graph.nodes.filter((n) => fixed.has(n.id)).length,
    maxDisplacement: displacements.length ? Math.max(...displacements) : 0,
    meanDisplacement: displacements.length ? displacements.reduce((s, d) => s + d, 0) / displacements.length : 0,
    orderPreserved: pairs === 0 ? 1 : kept / pairs,
    overlaps,
  };
};
