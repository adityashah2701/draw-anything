import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";
export type ZMove = "front" | "forward" | "backward" | "back";
export interface Offset {
  dx: number;
  dy: number;
}
export interface Boxed {
  id: string;
  bounds: Bounds;
}

const union = (items: Boxed[]) => ({
  minX: Math.min(...items.map((i) => i.bounds.minX)),
  maxX: Math.max(...items.map((i) => i.bounds.maxX)),
  minY: Math.min(...items.map((i) => i.bounds.minY)),
  maxY: Math.max(...items.map((i) => i.bounds.maxY)),
});

/** How far each element moves to line up with the selection's edge or centre. Needs two or more. */
export const alignOffsets = (items: Boxed[], mode: AlignMode): Map<string, Offset> => {
  const out = new Map<string, Offset>();
  if (items.length < 2) return out;
  const box = union(items);
  for (const { id, bounds: b } of items) {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const offset: Offset =
      mode === "left" ? { dx: box.minX - b.minX, dy: 0 }
      : mode === "right" ? { dx: box.maxX - b.maxX, dy: 0 }
      : mode === "center" ? { dx: (box.minX + box.maxX) / 2 - cx, dy: 0 }
      : mode === "top" ? { dx: 0, dy: box.minY - b.minY }
      : mode === "bottom" ? { dx: 0, dy: box.maxY - b.maxY }
      : { dx: 0, dy: (box.minY + box.maxY) / 2 - cy };
    out.set(id, offset);
  }
  return out;
};

/**
 * Equal gaps between elements along an axis; the two outermost stay where they are. Needs three or
 * more. Gaps (edge to edge) are equalised, not centres, so differently sized shapes read as even.
 */
export const distributeOffsets = (items: Boxed[], axis: DistributeAxis): Map<string, Offset> => {
  const out = new Map<string, Offset>();
  if (items.length < 3) return out;
  const horizontal = axis === "horizontal";
  const lo = (b: Bounds) => (horizontal ? b.minX : b.minY);
  const hi = (b: Bounds) => (horizontal ? b.maxX : b.maxY);
  const sorted = [...items].sort((a, b) => lo(a.bounds) - lo(b.bounds) || a.id.localeCompare(b.id));
  const span = Math.max(...sorted.map((i) => hi(i.bounds))) - lo(sorted[0].bounds);
  const total = sorted.reduce((sum, i) => sum + (hi(i.bounds) - lo(i.bounds)), 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = lo(sorted[0].bounds);
  for (const { id, bounds } of sorted) {
    const shift = cursor - lo(bounds);
    out.set(id, horizontal ? { dx: shift, dy: 0 } : { dx: 0, dy: shift });
    cursor += hi(bounds) - lo(bounds) + gap;
  }
  return out;
};

/** New stacking order (array order is z-order, last = on top). Selected ids keep their relative order. */
export const reorder = (order: string[], selected: ReadonlySet<string>, move: ZMove): string[] => {
  const pick = order.filter((id) => selected.has(id));
  const rest = order.filter((id) => !selected.has(id));
  if (move === "front") return [...rest, ...pick];
  if (move === "back") return [...pick, ...rest];
  const next = [...order];
  if (move === "forward") {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (selected.has(next[i]) && !selected.has(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
  } else {
    for (let i = 1; i < next.length; i += 1) {
      if (selected.has(next[i]) && !selected.has(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
    }
  }
  return next;
};

type WithConnections = DrawingElement & {
  startConnection?: { elementId: string };
  endConnection?: { elementId: string };
};

/**
 * What copying `selected` should include: the selection, plus connectors with both ends inside it
 * (and their text labels), so a copied flow keeps its arrows. Returned in stacking order.
 */
export const collectCopySet = (elements: DrawingElement[], selected: ReadonlySet<string>): DrawingElement[] => {
  const ids = new Set(selected);
  const connectors = elements.filter((el) => {
    const c = el as WithConnections;
    return c.startConnection && c.endConnection && ids.has(c.startConnection.elementId) && ids.has(c.endConnection.elementId);
  });
  const labelOf = new Set(connectors.map((c) => (c.ai?.semanticId ? `${c.ai.semanticId}-label` : null)).filter(Boolean));
  return elements.filter(
    (el) =>
      selected.has(el.id) ||
      connectors.includes(el) ||
      (el.ai?.role === "edge-label" && el.ai.semanticId !== undefined && labelOf.has(el.ai.semanticId)),
  );
};

/**
 * Copies `source` as new, ordinary elements: fresh ids, moved by `offset`, connectors re-pointed at
 * the copies of the elements they joined (a connection to something not copied is dropped, leaving a
 * free arrow). Generation identity (`semanticId`, `frameId`, `generationId`) is removed so a copy can
 * never collide with, or be replaced together with, the AI-generated original; kind and icon stay.
 */
export const cloneElements = (source: DrawingElement[], offset: Offset, newId: () => string): DrawingElement[] => {
  const idMap = new Map(source.map((el) => [el.id, newId()]));
  return source.map((el) => {
    const copy = {
      ...structuredClone(el),
      id: idMap.get(el.id)!,
      points: el.points.map((p) => ({ x: p.x + offset.dx, y: p.y + offset.dy })),
    } as WithConnections & DrawingElement;
    for (const key of ["startConnection", "endConnection"] as const) {
      const connection = copy[key];
      if (!connection) continue;
      const mapped = idMap.get(connection.elementId);
      if (mapped) connection.elementId = mapped;
      else delete copy[key];
    }
    if (copy.ai) {
      const { semanticId: _s, frameId: _f, generationId: _g, ...kept } = copy.ai;
      void _s; void _f; void _g;
      copy.ai = kept;
    }
    return copy;
  });
};
