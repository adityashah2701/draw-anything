import { affectedSet } from "./diff";
import { fixedIds } from "./fixed";
import { resolveOverlaps } from "./overlap";
import type { AlgorithmDef, DiagramFamily, EngineId, LayoutDiagnostic, LayoutEngine, LayoutGraph, LayoutRequest, LayoutResult } from "../types";

/** What an engine computes: where every node would go with nothing held, top-left corners in its own coordinates. */
export type NaturalLayout<P> = (graph: LayoutGraph, params: P, seed: number) => Map<string, { x: number; y: number }>;

const EPSILON = 0.5;
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export interface NaturalEngineDef<P> {
  id: EngineId;
  family: DiagramFamily;
  label: string;
  algorithms: readonly AlgorithmDef<P>[];
  /** One natural layout per algorithm id. */
  natural: Record<string, NaturalLayout<P>>;
  validate?: (graph: LayoutGraph) => LayoutDiagnostic[];
  /** Clear space kept between nodes when overlaps are resolved. */
  gap?: number;
}

/**
 * Turns "where everything would go" into a full engine with the shared incremental behaviour: the diagram stays
 * where it is (median shift), nodes a mode holds are never given a position, nodes outside the affected set of an
 * incremental update stay, and nodes that do move are pushed apart from whatever is held by the smallest move.
 * An engine writes only the natural layout; preservation lives here once.
 */
export const defineNaturalEngine = <P extends Record<string, unknown>>(def: NaturalEngineDef<P>): LayoutEngine<P> => {
  const run = (request: LayoutRequest<P>, incremental: boolean): LayoutResult => {
    const { graph, positions } = request;
    const fn = def.natural[request.algorithm] ?? def.natural[def.algorithms[0].id];
    const natural = fn(graph, request.params, request.seed);
    const shifts = graph.nodes.flatMap((n) => {
      const was = positions.get(n.id);
      const at = natural.get(n.id);
      return was && at ? [{ dx: was.x - at.x, dy: was.y - at.y }] : [];
    });
    const shift = { dx: median(shifts.map((s) => s.dx)), dy: median(shifts.map((s) => s.dy)) };

    const held = fixedIds(request);
    if (incremental && request.delta) {
      const affected = affectedSet(request.delta, graph);
      for (const n of graph.nodes) if (positions.has(n.id) && !affected.has(n.id)) held.add(n.id);
    }
    const size = new Map(graph.nodes.map((n) => [n.id, { width: n.width, height: n.height }]));
    const heldAt = new Map([...held].flatMap((id) => (positions.has(id) ? [[id, { x: positions.get(id)!.x, y: positions.get(id)!.y }] as const] : [])));
    // Unplaced nodes that are not held are free; a held node with no position cannot exist.
    const targets = new Map<string, { x: number; y: number }>();
    for (const n of graph.nodes) {
      if (held.has(n.id)) continue;
      const at = natural.get(n.id);
      if (at) targets.set(n.id, { x: at.x + shift.dx, y: at.y + shift.dy });
    }
    const placed = resolveOverlaps(targets, size, heldAt, def.gap ?? 40);
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, at] of placed) {
      const x = round(at.x);
      const y = round(at.y);
      const was = positions.get(id);
      if (was && Math.abs(was.x - x) <= EPSILON && Math.abs(was.y - y) <= EPSILON) continue;
      out.set(id, { x, y });
    }
    return { positions: out, moved: [...out.keys()], unplaced: graph.nodes.filter((n) => !held.has(n.id) && !natural.has(n.id)).map((n) => ({ id: n.id, reason: "The layout did not place it." })), diagnostics: [] };
  };
  return {
    id: def.id,
    family: def.family,
    label: def.label,
    algorithms: def.algorithms,
    validate: def.validate ?? (() => []),
    layout: (request) => run(request, false),
    update: (request) => run(request, true),
  };
};
