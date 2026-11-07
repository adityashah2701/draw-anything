import type { DrawingElement, Point, StoredElement } from "@/core/model";

/**
 * Who placed an element, as data. One rule, implemented once, applied where the document is written (the
 * storage boundary), never by a caller: a caller that moves something cannot forget to say so.
 *
 *   locked  the existing `locked` flag (or a locked group); never moves, for any layout operation
 *   user    a person placed it (drag, resize, inspector, keyboard, paste, an AI edit made for them, explicit
 *           x and y in diagram code); an automatic layout leaves it exactly where it is
 *   auto    a layout engine placed it and nothing has touched it since; an automatic layout may move it
 *
 * An element with no stamp reads as `user`: boards and shapes that predate this are never moved by an
 * automatic layout, and nothing needs migrating.
 */
export type PlacementState = "auto" | "user" | "locked";

/** Where a write comes from. Everything is `user` unless a layout is applying its own result. */
export type PlacementOrigin = "user" | "layout";

/** Connectors are placed by the router and annotations (group frames, headings) by the diagram's own geometry; neither carries a stamp. */
export const isPlaceable = (element: { type?: unknown; isGuide?: unknown }): boolean =>
  typeof element.type === "string" &&
  element.type !== "arrow" &&
  element.type !== "arrow-bidirectional" &&
  element.type !== "group" &&
  element.type !== "layout" &&
  element.isGuide !== true;

const samePoints = (a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  return true;
};

/**
 * The stamp an update should carry, or undefined when it carries none (the element is not placeable, or its
 * geometry did not change, so whatever stamp it has stays). `current` is the element as stored, `change` the
 * keys being written (a whole element or a partial merge). An explicit `override` always wins.
 */
export const stampForUpdate = (
  current: Pick<DrawingElement, "points" | "type" | "isGuide"> | undefined,
  change: { points?: readonly Point[]; type?: unknown; isGuide?: unknown },
  origin: PlacementOrigin,
  override?: "auto" | "user",
): "auto" | "user" | undefined => {
  const type = change.type ?? current?.type;
  if (!isPlaceable({ type, isGuide: change.isGuide ?? current?.isGuide })) return undefined;
  if (override) return override;
  if (!current) return origin === "layout" ? "auto" : "user";
  if (change.points === undefined || samePoints(current.points, change.points)) return undefined;
  return origin === "layout" ? "auto" : "user";
};

/** The stamp a new element gets. */
export const stampForAdd = (element: { type?: unknown; isGuide?: unknown }, origin: PlacementOrigin, override?: "auto" | "user"): "auto" | "user" | undefined =>
  isPlaceable(element) ? (override ?? (origin === "layout" ? "auto" : "user")) : undefined;

/** A new element with the stamp it should carry (an element that is not placeable is returned as it is). */
export const withStamp = <T extends object>(element: T, stamp: "auto" | "user" | undefined): T => (stamp === undefined ? element : ({ ...element, placement: stamp } as T));

/**
 * An update with the stamp it should carry. When there is none (the geometry did not change), whatever
 * `placement` the caller's copy has is dropped, so a stale copy of an element can never overwrite the stored stamp.
 */
export const withUpdateStamp = <T extends object>(change: T, stamp: "auto" | "user" | undefined): T => {
  if (stamp !== undefined) return { ...change, placement: stamp } as T;
  if (!("placement" in change)) return change;
  const { placement: _stale, ...rest } = change as T & { placement?: unknown };
  void _stale;
  return rest as T;
};

/** How an automatic layout must treat an element: locked (by flag or because `isLocked` says so), `user` (including no stamp), or `auto`. */
export const placementOf = (element: Pick<DrawingElement, "placement" | "locked">, isLocked = false): PlacementState =>
  isLocked || element.locked === true ? "locked" : element.placement === "auto" ? "auto" : "user";

/** True when an automatic operation may move this element. */
export const isMovableByLayout = (element: Pick<DrawingElement, "placement" | "locked">, isLocked = false): boolean => placementOf(element, isLocked) === "auto";

/** A stored item's own placement, for records and shapes alike (records never move). */
export const stampOf = (item: StoredElement): "auto" | "user" | undefined => ("placement" in item ? (item as DrawingElement).placement : undefined);
