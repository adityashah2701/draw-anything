import type { DrawingElement, LayoutRecord, StoredElement } from "@/core/model";

/**
 * The one place layout configuration lives. A record says which engine and algorithm lay out a scope (the
 * whole board, one diagram, or one frame) and what an edit may do about it. A board with no record is valid and
 * means freeform: the elements stay where they are.
 */

export type LayoutScope = LayoutRecord["scope"];

export const isLayoutRecord = (value: unknown): value is LayoutRecord =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "layout" &&
  typeof (value as { id?: unknown }).id === "string" &&
  typeof (value as { scope?: { kind?: unknown } }).scope === "object" &&
  (value as { scope?: unknown }).scope !== null;

export const layoutRecordId = (scope: LayoutScope): string => (scope.kind === "board" ? "layout:board" : `layout:${scope.kind}:${scope.id}`);

/** A new record for `scope`. Absent options mean the safest settings: adjust only what a layout placed. */
export const buildLayoutRecord = (
  scope: LayoutScope,
  engine: string,
  algorithm: string,
  options: { params?: Record<string, unknown>; incremental?: LayoutRecord["incremental"] } = {},
): LayoutRecord => ({
  id: layoutRecordId(scope),
  type: "layout",
  points: [],
  color: "#000000",
  strokeWidth: 0,
  scope,
  engine,
  algorithm,
  ...(options.params ? { params: options.params } : {}),
  incremental: options.incremental ?? "adjust",
  version: 1,
});

const ENGINES_SEEN = /^[a-z][a-z0-9-]{0,40}$/;

/**
 * A stored record read defensively: the engine and algorithm names must look like names, `incremental` is one
 * of its two values (anything else reads as `preserve`, the choice that moves nothing), the scope is a known
 * kind. Null for anything that is not a usable record, never a throw.
 */
export const normalizeLayoutRecord = (value: unknown): LayoutRecord | null => {
  if (!isLayoutRecord(value)) return null;
  const scope = value.scope as { kind?: unknown; id?: unknown };
  const validScope: LayoutScope | null =
    scope.kind === "board" ? { kind: "board" } : (scope.kind === "diagram" || scope.kind === "frame") && typeof scope.id === "string" && scope.id !== "" ? ({ kind: scope.kind, id: scope.id } as LayoutScope) : null;
  if (!validScope) return null;
  if (typeof value.engine !== "string" || !ENGINES_SEEN.test(value.engine)) return null;
  if (typeof value.algorithm !== "string" || !ENGINES_SEEN.test(value.algorithm)) return null;
  return {
    ...value,
    scope: validScope,
    incremental: value.incremental === "adjust" ? "adjust" : "preserve",
    params: value.params && typeof value.params === "object" && !Array.isArray(value.params) ? value.params : undefined,
  };
};

/** What `layoutFor` needs to know about an element and its surroundings. */
export interface LayoutLookup {
  /** Records by id, already normalised. */
  records: ReadonlyMap<string, LayoutRecord>;
  /** The owner frame of an element id, if any (the element's `frameId`, repaired by the frame index). */
  frameOf(id: string): string | undefined;
}

/**
 * The record that governs an element: the nearest enclosing frame's, else its diagram's (`ai.generationId`),
 * else the board's, else none, which means freeform. One function, used everywhere.
 */
export const layoutFor = (lookup: LayoutLookup, element: Pick<DrawingElement, "id" | "ai">): LayoutRecord | undefined => {
  const seen = new Set<string>();
  for (let frame = lookup.frameOf(element.id); frame && !seen.has(frame); frame = lookup.frameOf(frame)) {
    seen.add(frame);
    const record = lookup.records.get(layoutRecordId({ kind: "frame", id: frame }));
    if (record) return record;
  }
  const generation = element.ai?.generationId;
  if (generation) {
    const record = lookup.records.get(layoutRecordId({ kind: "diagram", id: generation }));
    if (record) return record;
  }
  return lookup.records.get(layoutRecordId({ kind: "board" }));
};

export const layoutRecordsOf = (stored: readonly StoredElement[]): Map<string, LayoutRecord> => {
  const out = new Map<string, LayoutRecord>();
  for (const item of stored) {
    const record = normalizeLayoutRecord(item);
    if (record && !out.has(record.id)) out.set(record.id, record);
  }
  return out;
};

/** Whether any layout record names a family engine (not architecture or freeform): such a diagram is laid out by it on update too. */
export const hasFamilyLayout = (stored: readonly StoredElement[]): boolean => [...layoutRecordsOf(stored).values()].some((r) => r.engine !== "architecture" && r.engine !== "freeform");
