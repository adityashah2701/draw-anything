import { layoutEnginesEnabled } from "@/core/layout/flags";
import { engineForFamily } from "@/core/layout/registry";
import type { LayoutEngine, LayoutGraph } from "@/core/layout/types";
import { PROFILES } from "@/features/ai/diagram-agent/profiles";
import { separateGroups } from "./group-separation";
import { ensureLayoutEngines } from "./register-engines";
import type { PlacementEngine } from "./types";

const ORIGIN_X = 960;
const ORIGIN_Y = 150;

/** A family engine as the compiler's placement step: the engine's natural layout of the whole diagram, kept clear of group frames. */
export const placementFromEngine =
  (engine: LayoutEngine, algorithm = engine.algorithms[0].id): PlacementEngine =>
  (input) => {
    const graph: LayoutGraph = {
      nodes: input.nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
      edges: input.edges.map((e, i) => ({ id: `e${i}`, from: e.from, to: e.to, ...(e.relation ? { relation: e.relation } : {}), ...(e.parent ? { parent: e.parent } : {}) })),
      containers: input.groups.map((g) => ({ id: g.id, kind: "group" as const, members: g.nodeIds })),
    };
    const defaults = engine.algorithms.find((a) => a.id === algorithm)?.defaults ?? {};
    const result = engine.layout({ graph, algorithm, params: defaults, mode: "overwrite", positions: new Map(), seed: 1, budget: { maxMs: 5000 } });
    const xs = [...result.positions.values()].map((p) => p.x);
    const maxX = Math.max(...[...result.positions].map(([id, p]) => p.x + (input.nodes.find((n) => n.id === id)?.width ?? 0)), 0);
    const shift = { x: ORIGIN_X - (Math.min(...xs, 0) + maxX) / 2, y: ORIGIN_Y };
    const placed = new Map([...result.positions].map(([id, p]) => [id, { x: p.x + shift.x, y: p.y + shift.y }]));
    return separateGroups(placed, input);
  };

/**
 * Compile options for a NEW diagram of this type: its family's engine places the nodes (routing, labels and frames
 * stay the compiler's). Architecture and unknown types keep the compiler's own layered layout, which is that engine.
 */
export const familyCompileOptions = (diagramType: string | undefined): { engine?: PlacementEngine } => {
  if (!layoutEnginesEnabled() || !diagramType) return {};
  const family = PROFILES[diagramType as keyof typeof PROFILES]?.family;
  if (!family || family === "architecture") return {};
  ensureLayoutEngines();
  const engine = engineForFamily(family);
  return engine ? { engine: placementFromEngine(engine) } : {};
};
