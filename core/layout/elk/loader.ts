/**
 * The only place elkjs is imported, and only dynamically, so it is a separate chunk loaded the first time an ELK
 * algorithm runs, never part of the editor's first load. A load failure is reported to the caller, which falls
 * back to the native algorithm of the same engine.
 */
export interface ElkLike {
  layout(graph: unknown, options?: unknown): Promise<unknown>;
}

let pending: Promise<ElkLike> | null = null;

export const loadElk = (): Promise<ElkLike> => {
  pending ??= import("elkjs/lib/elk.bundled.js")
    .then((module) => {
      const ELK = (module as unknown as { default: new () => ElkLike }).default;
      return new ELK();
    })
    .catch((error) => {
      pending = null; // a later call may try again
      throw error;
    });
  return pending;
};
