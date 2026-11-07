/**
 * The typed API for frames. Every function is pure: it reads the stored list and returns a
 * `DocPatch` (never writes), so a caller applies it as ONE storage mutation = one undo step.
 *
 * Facade aggregating frame-common, frame-lifecycle, frame-geometry, frame-hierarchy, and frame-lanes.
 */

export * from "./frame-common";
export * from "./frame-hierarchy";
export * from "./frame-geometry";
export * from "./frame-lifecycle";
export * from "./frame-lanes";
