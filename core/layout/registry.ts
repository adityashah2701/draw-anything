import type { DiagramFamily, EngineId, LayoutEngine } from "./types";

/** Engines by id. Registration is explicit (an engine's module registers itself where the app starts), so core never imports a feature. */
const engines = new Map<EngineId, LayoutEngine>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registerLayoutEngine = (engine: LayoutEngine<any>): void => {
  engines.set(engine.id, engine as LayoutEngine);
};

export const getLayoutEngine = (id: EngineId): LayoutEngine | undefined => engines.get(id);

export const listLayoutEngines = (): LayoutEngine[] => [...engines.values()];

/** The engine registered for a family, if one is; the first registered wins. */
export const engineForFamily = (family: DiagramFamily): LayoutEngine | undefined => listLayoutEngines().find((engine) => engine.family === family);

/** The freeform engine, which exists for every board. */
export const FREEFORM_ID: EngineId = "freeform";

export const algorithmOf = (engine: LayoutEngine, id: string | undefined) => engine.algorithms.find((a) => a.id === id) ?? engine.algorithms[0];

/** Test seam: forget every registration. */
export const clearLayoutEngines = (): void => engines.clear();
