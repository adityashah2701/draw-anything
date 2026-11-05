import type { LayoutDiagnostic, LayoutMode, LayoutRequest, LayoutResult, PositionSource } from "../types";

/**
 * Which nodes an operation may not move. `locked` never moves, in any mode. `preserve` moves nothing that exists.
 * `adjust` moves only `auto`. `overwrite` moves everything but `locked`. A node with no position is new and free.
 */
export const isFixedIn = (mode: LayoutMode, source: PositionSource): boolean => {
  if (source === "locked") return true;
  if (mode === "preserve") return true;
  if (mode === "adjust") return source !== "auto";
  return false;
};

/** The ids of the nodes of `request` that `mode` may not move. */
export const fixedIds = (request: Pick<LayoutRequest, "positions" | "mode">): Set<string> => {
  const out = new Set<string>();
  for (const [id, placed] of request.positions) if (isFixedIn(request.mode, placed.source)) out.add(id);
  return out;
};

export interface EnforceReport {
  result: LayoutResult;
  /** Fixed nodes the engine tried to move. Never expected: it names a bug in the engine. */
  violations: string[];
}

/**
 * The guard after every engine. A position the engine returned for a fixed node is discarded and named, so an
 * engine bug cannot move something the user placed; tests fail on a violation, the editor drops the move and says so.
 */
export const enforceFixed = (request: Pick<LayoutRequest, "positions" | "mode">, result: LayoutResult): EnforceReport => {
  const fixed = fixedIds(request);
  const violations: string[] = [];
  const positions = new Map(result.positions);
  for (const id of result.positions.keys()) {
    if (!fixed.has(id)) continue;
    violations.push(id);
    positions.delete(id);
  }
  if (violations.length === 0) return { result, violations };
  const diagnostics: LayoutDiagnostic[] = [
    ...result.diagnostics,
    { severity: "error", code: "layout/fixed-moved", message: `The engine tried to move ${violations.length} element(s) it must not move; the moves were discarded.`, ids: violations },
  ];
  return { result: { ...result, positions, moved: result.moved.filter((id) => !fixed.has(id)), diagnostics }, violations };
};
