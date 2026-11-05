import { findFreeSlot } from "../../kit/free-slot";
import { rectAt, unionOf } from "../../kit/rect";
import type { LayoutEngine, LayoutRequest, LayoutResult, Rect } from "../../types";

export type FreeformParams = {
  /** Clear space kept around a node that is placed. */
  gap: number;
};

const DEFAULT_GAP = 48;

/**
 * Freeform: the identity layout. Every element that already has a position stays exactly where it is, whatever
 * the mode; a node that has none (a new one) is put in the nearest free place beside the nodes it connects to,
 * or below the drawing when it connects to nothing. Nothing existing is pushed, aligned or tidied.
 */
const placeNew = (request: LayoutRequest<FreeformParams>): LayoutResult => {
  const gap = request.params.gap ?? DEFAULT_GAP;
  const sizeOf = new Map(request.graph.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, Rect>();
  for (const [id, at] of request.positions) {
    const node = sizeOf.get(id);
    if (node) placed.set(id, rectAt(at.x, at.y, node));
  }
  const forbidden = (request.constraints ?? []).flatMap((c) => (c.kind === "region" ? [c.rect] : []));
  const positions = new Map<string, { x: number; y: number }>();
  const unplaced: LayoutResult["unplaced"] = [];

  for (const node of request.graph.nodes) {
    if (placed.has(node.id)) continue;
    const neighbours = request.graph.edges.flatMap((e) => (e.from === node.id ? [e.to] : e.to === node.id ? [e.from] : [])).flatMap((id) => placed.get(id) ?? []);
    const near = unionOf(neighbours);
    const all = unionOf([...placed.values()]);
    const ideal = near
      ? { x: near.maxX + gap * 2, y: (near.minY + near.maxY) / 2 - node.height / 2 }
      : all
        ? { x: all.minX, y: all.maxY + gap * 2 }
        : { x: 0, y: 0 };
    const slot = findFreeSlot(ideal, node, [...placed.values()], gap, Math.max(8, gap / 2), forbidden);
    if (!slot) {
      unplaced.push({ id: node.id, reason: "No free place was found near its neighbours." });
      continue;
    }
    positions.set(node.id, slot);
    placed.set(node.id, rectAt(slot.x, slot.y, node));
  }
  return { positions, moved: [...positions.keys()], unplaced, diagnostics: [] };
};

export const freeformEngine: LayoutEngine<FreeformParams> = {
  id: "freeform",
  family: "general",
  label: "Freeform",
  algorithms: [
    { id: "keep", label: "Keep as is", description: "Nothing moves. A new element is put in a free place beside the elements it connects to.", defaults: { gap: DEFAULT_GAP }, backend: "native" },
  ],
  validate: () => [],
  layout: placeNew,
  update: placeNew,
};
