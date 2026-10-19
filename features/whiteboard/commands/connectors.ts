import { buildAnchorId } from "@/core/anchors/anchor-geometry";
import { ArrowElement, getArrowHeadVisibility, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { getShapeAnchors, getShapeDefinition } from "@/core/shapes/shape-runtime";
import { EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT, placeEdgeLabels } from "@/features/ai/server/layout/edge-labels";
import type { Box } from "@/features/ai/server/layout/geometry";
import { buildConnectorArrow, type ConnectorEnd } from "@/features/whiteboard/hooks/interaction/connector-arrow";
import type {
  AnchorSide,
  ArrowRoutePreference,
  ArrowRoutingMode,
  ArrowType,
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import type { DocPatch } from "@/core/groups/patch";
import { editableIds } from "./editable";
import type { CommandContext } from "./context";

/** What a person changes on a selected connector, and what the AI's connector tools change. */
export interface ArrowChange {
  type?: ArrowType;
  routingMode?: ArrowRoutingMode;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  isManuallyRouted?: boolean;
  routePreference?: ArrowRoutePreference;
  color?: string;
  strokeWidth?: number;
}

/**
 * The connector after `change`. Switching type sets the heads that type implies, `straight` collapses the
 * path to its two ends, and `orthogonal` asks the router for a path between the attached shapes. This is
 * the one definition: the arrow panel and the AI's `update_connector` both call it.
 */
export const applyArrowChange = (arrow: ArrowElement, change: ArrowChange, route: (arrow: ArrowElement) => ArrowElement): ArrowElement => {
  let next: ArrowElement = { ...arrow, ...change } as ArrowElement;

  if (change.type === "arrow-bidirectional") {
    next.arrowHeadStart = change.arrowHeadStart ?? true;
    next.arrowHeadEnd = change.arrowHeadEnd ?? true;
  }
  if (change.type === "arrow") {
    next.arrowHeadStart = change.arrowHeadStart ?? false;
    next.arrowHeadEnd = change.arrowHeadEnd ?? true;
  }

  if (change.routingMode === "straight") {
    const endIndex = Math.max(1, next.points.length - 1);
    next.points = [next.points[0], next.points[endIndex]];
    next.isManuallyRouted = false;
  } else if (change.routingMode === "orthogonal") {
    next = route(next);
  }
  return next;
};

const isConnectable = (shape: DrawingElement) => getShapeDefinition(shape.type)?.capabilities?.includes("connectable") === true;

export const connectorsOf = (ctx: CommandContext): ArrowElement[] => ctx.shapes.filter(isArrowElement);

/** The side of `a` that faces `b` (the longer axis between their centres decides), and the side of `b` that faces back. */
export const facingSides = (a: Bounds, b: Bounds): { from: AnchorSide; to: AnchorSide } => {
  const dx = (b.minX + b.maxX) / 2 - (a.minX + a.maxX) / 2;
  const dy = (b.minY + b.maxY) / 2 - (a.minY + a.maxY) / 2;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
  return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
};

export type EndpointResult = { ok: true; end: ConnectorEnd } | { ok: false; reason: "missing" | "not_connectable" | "no_anchor" };

/** The connection point on `shapeId` at `side` (the element's own anchor, rotation included). */
export const connectorEnd = (ctx: CommandContext, shapeId: string, side: AnchorSide): EndpointResult => {
  const shape = ctx.index.shapes.get(shapeId);
  if (!shape) return { ok: false, reason: "missing" };
  if (!isConnectable(shape)) return { ok: false, reason: "not_connectable" };
  const anchor = getShapeAnchors(shape, ctx.getBounds(shape)).find((candidate) => candidate.side === side);
  if (!anchor) return { ok: false, reason: "no_anchor" };
  return { ok: true, end: { elementId: shapeId, anchorId: anchor.id || buildAnchorId(shapeId, side), x: anchor.x, y: anchor.y, side: anchor.side } };
};

export interface NewConnector {
  id?: string;
  from: { id: string; side?: AnchorSide };
  to: { id: string; side?: AnchorSide };
  change?: ArrowChange;
  label?: string;
}

export type ConnectorFailure = { reason: "missing" | "not_connectable" | "no_anchor" | "same_element" | "no_bounds"; id: string };

export interface ConnectorPlan {
  patch: DocPatch;
  connectorId: string;
  labelId?: string;
  from: { id: string; side: AnchorSide };
  to: { id: string; side: AnchorSide };
}

/**
 * A connector between two existing shapes, built and routed exactly as when a person drops a connector
 * handle on a shape: attached at anchors (the sides that face each other unless given), routed around the
 * other shapes by the editor's router.
 */
export const planCreateConnector = (ctx: CommandContext, input: NewConnector): ConnectorPlan | ConnectorFailure => {
  if (input.from.id === input.to.id) return { reason: "same_element", id: input.from.id };
  const a = ctx.index.shapes.get(input.from.id);
  const b = ctx.index.shapes.get(input.to.id);
  if (!a) return { reason: "missing", id: input.from.id };
  if (!b) return { reason: "missing", id: input.to.id };
  // What an element is decides first, before whether it can be measured: text has no connection points at all.
  if (!isConnectable(a)) return { reason: "not_connectable", id: a.id };
  if (!isConnectable(b)) return { reason: "not_connectable", id: b.id };
  const boundsA = ctx.getBounds(a);
  const boundsB = ctx.getBounds(b);
  if (!boundsA || !boundsB) return { reason: "no_bounds", id: !boundsA ? a.id : b.id };
  const facing = facingSides(boundsA, boundsB);
  const fromSide = input.from.side ?? facing.from;
  const toSide = input.to.side ?? facing.to;
  const from = connectorEnd(ctx, a.id, fromSide);
  if (!from.ok) return { reason: from.reason, id: a.id };
  const to = connectorEnd(ctx, b.id, toSide);
  if (!to.ok) return { reason: to.reason, id: b.id };

  const id = input.id ?? ctx.newId();
  const arrow = buildConnectorArrow({ id, from: from.end, to: to.end, route: (candidate) => ctx.routeArrow(candidate as ArrowElement) });
  if (!arrow) return { reason: "missing", id };
  const styled = input.change ? applyArrowChange(arrow, input.change, ctx.routeArrow) : arrow;
  const add: DrawingElement[] = [styled];
  const plan: ConnectorPlan = { patch: { add, update: [], remove: [] }, connectorId: id, from: { id: a.id, side: fromSide }, to: { id: b.id, side: toSide } };
  if (input.label?.trim()) {
    const label = labelElementFor(ctx, styled, input.label.trim(), [styled]);
    add.push(label);
    plan.labelId = label.id;
  }
  return plan;
};

// ── connector labels ────────────────────────────────────────────────────────────────────────────

/** The key an arrow's label is linked by: diagram arrows use their `semanticId`, hand-made ones their id. */
export const labelKeyOf = (arrow: DrawingElement) => `${arrow.ai?.semanticId ?? arrow.id}-label`;

/** The text element that labels `arrow`, if it has one. */
export const labelOf = (ctx: Pick<CommandContext, "shapes">, arrow: DrawingElement): DrawingElement | undefined =>
  ctx.shapes.find((shape) => shape.ai?.role === "edge-label" && shape.ai.semanticId === labelKeyOf(arrow));

const isNodeLike = (shape: DrawingElement) => !shape.isGuide && !isArrowElement(shape) && shape.type !== "line" && shape.type !== "freehand" && shape.points.length >= 2;

const boxOf = (bounds: Bounds): Box => ({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY });

const placeLabel = (ctx: CommandContext, arrow: ArrowElement, text: string, extraArrows: readonly ArrowElement[]): Point => {
  const obstacles = ctx.shapes.filter(isNodeLike).flatMap((shape) => {
    const bounds = ctx.getBounds(shape);
    return bounds ? [boxOf(bounds)] : [];
  });
  const paths = new Map<string, Point[]>();
  for (const other of [...connectorsOf(ctx), ...extraArrows]) if (other.id !== arrow.id) paths.set(other.id, other.points);
  paths.set(arrow.id, arrow.points);
  const [placed] = placeEdgeLabels([{ id: arrow.id, text, points: arrow.points }], obstacles, paths);
  return placed.position;
};

const labelElementFor = (ctx: CommandContext, arrow: ArrowElement, text: string, extraArrows: readonly ArrowElement[], existing?: DrawingElement): DrawingElement =>
  ({
    ...(existing ?? {}),
    id: existing?.id ?? `${arrow.id}-label`,
    type: "text",
    points: [placeLabel(ctx, arrow, text, extraArrows)],
    color: existing?.color ?? "#000000",
    strokeWidth: 1,
    text,
    fontSize: EDGE_LABEL_FONT_SIZE,
    fontWeight: EDGE_LABEL_FONT_WEIGHT,
    fontStyle: "normal",
    isGuide: true,
    ai: { ...(existing?.ai ?? {}), semanticId: labelKeyOf(arrow), role: "edge-label" },
  }) as DrawingElement;

/**
 * Set, change or remove (empty text) a connector's label. The label is the same kind of element AI
 * diagrams draw (a guide text linked by `ai.semanticId`), placed clear of the shapes and the other labels.
 */
export const planConnectorLabel = (ctx: CommandContext, arrowId: string, text: string | null): { patch: DocPatch; labelId: string | null } | null => {
  const arrow = ctx.index.shapes.get(arrowId);
  if (!arrow || !isArrowElement(arrow)) return null;
  const existing = labelOf(ctx, arrow);
  const clean = text?.trim() ?? "";
  if (!clean) return existing ? { patch: { add: [], update: [], remove: [existing.id] }, labelId: null } : { patch: { add: [], update: [], remove: [] }, labelId: null };
  const label = labelElementFor(ctx, arrow, clean, [], existing);
  return existing ? { patch: { add: [], update: [label], remove: [] }, labelId: label.id } : { patch: { add: [label], update: [], remove: [] }, labelId: label.id };
};

/**
 * The labels that must move because their connector was re-routed. A label follows its connector, so a
 * connector that is moved, resized or re-routed (by a person or by the AI) never leaves its label behind.
 */
export const labelFollowers = (ctx: CommandContext, rerouted: readonly DrawingElement[]): DrawingElement[] => {
  const arrows = rerouted.filter(isArrowElement);
  if (arrows.length === 0) return [];
  const labels = new Map<string, DrawingElement>();
  for (const shape of ctx.shapes) if (shape.ai?.role === "edge-label" && shape.ai.semanticId) labels.set(shape.ai.semanticId, shape);
  if (labels.size === 0) return [];
  const out: DrawingElement[] = [];
  for (const arrow of arrows) {
    const label = labels.get(labelKeyOf(arrow));
    if (!label || typeof label.text !== "string") continue;
    out.push(labelElementFor(ctx, arrow, label.text, arrows, label));
  }
  return out;
};

/**
 * `reroute` extended so labels follow their connectors: the connectors the router changed, plus the
 * labels linked to them placed against the shapes as they are after the change.
 */
export const rerouteWithLabels =
  (ctx: () => CommandContext, reroute: (changed: DrawingElement[]) => DrawingElement[]) =>
  (changed: DrawingElement[]): DrawingElement[] => {
    const arrows = reroute(changed);
    if (arrows.length === 0) return arrows;
    const latest = new Map<string, DrawingElement>([...changed, ...arrows].map((element) => [element.id, element]));
    const base = ctx();
    const world: CommandContext = { ...base, shapes: base.shapes.map((shape) => latest.get(shape.id) ?? shape) };
    return [...arrows, ...labelFollowers(world, arrows)];
  };

// ── editing and removing connectors ───────────────────────────────────────────────────────────────

export interface ConnectorEdit {
  change?: ArrowChange;
  /** Re-attach an end to another shape (and side). */
  from?: { id: string; side?: AnchorSide };
  to?: { id: string; side?: AnchorSide };
}

export type ConnectorEditResult = { patch: DocPatch; connectorId: string } | ConnectorFailure | { reason: "not_a_connector" | "locked"; id: string };

/** Change a connector's look, routing or ends, as one patch; the connector is re-routed when its path can change. */
export const planUpdateConnector = (ctx: CommandContext, arrowId: string, edit: ConnectorEdit): ConnectorEditResult => {
  const arrow = ctx.index.shapes.get(arrowId);
  if (!arrow || !isArrowElement(arrow)) return { reason: "not_a_connector", id: arrowId };
  if (editableIds(ctx, [arrowId]).length === 0) return { reason: "locked", id: arrowId };
  let next: ArrowElement = arrow;

  for (const [key, target] of [["start", edit.from], ["end", edit.to]] as const) {
    if (!target) continue;
    const shape = ctx.index.shapes.get(target.id);
    if (!shape) return { reason: "missing", id: target.id };
    const otherConnection = key === "start" ? arrow.endConnection : arrow.startConnection;
    const other = otherConnection ? ctx.index.shapes.get(otherConnection.elementId) : undefined;
    const bounds = ctx.getBounds(shape);
    const otherBounds = other ? ctx.getBounds(other) : null;
    const facing = bounds && otherBounds ? (key === "start" ? facingSides(bounds, otherBounds).from : facingSides(otherBounds, bounds).to) : "right";
    const end = connectorEnd(ctx, target.id, target.side ?? facing);
    if (!end.ok) return { reason: end.reason, id: target.id };
    const points = [...next.points];
    points[key === "start" ? 0 : points.length - 1] = { x: end.end.x, y: end.end.y };
    next = { ...next, points, [key === "start" ? "startConnection" : "endConnection"]: { elementId: end.end.elementId, anchorId: end.end.anchorId }, isManuallyRouted: false } as ArrowElement;
  }
  const endsChanged = next !== arrow;
  next = applyArrowChange(next, edit.change ?? {}, ctx.routeArrow);
  if (endsChanged && edit.change?.routingMode !== "straight" && (next.routingMode ?? "orthogonal") === "orthogonal") next = ctx.routeArrow(next);
  const label = labelOf(ctx, arrow);
  const follower = label && endsChanged ? labelFollowers({ ...ctx, shapes: ctx.shapes.map((s) => (s.id === next.id ? next : s)) } as CommandContext, [next]) : [];
  return { patch: { add: [], update: [next, ...follower], remove: [] }, connectorId: arrowId };
};

/** Re-route connectors through the router from their attachments (clears manual bends only when `forget` is set). */
export const planReroute = (ctx: CommandContext, arrowIds: readonly string[], { forgetManual }: { forgetManual: boolean }): { patch: DocPatch | null; changed: string[] } => {
  const arrows = arrowIds.flatMap((id) => {
    const shape = ctx.index.shapes.get(id);
    return shape && isArrowElement(shape) ? [shape] : [];
  });
  const update: DrawingElement[] = [];
  for (const arrow of arrows) {
    const start: ArrowElement = forgetManual ? { ...arrow, isManuallyRouted: false } : arrow;
    const routed = (arrow.routingMode ?? "orthogonal") === "straight" ? start : ctx.routeArrow(start);
    if (JSON.stringify(routed.points) !== JSON.stringify(arrow.points) || routed.isManuallyRouted !== arrow.isManuallyRouted) update.push(routed);
  }
  const followers = labelFollowers(ctx, update);
  const all = [...update, ...followers];
  return { patch: all.length === 0 ? null : { add: [], update: all, remove: [] }, changed: update.map((u) => u.id) };
};

/** The connectors that join `a` and `b` (either direction unless `directed`). */
export const connectorsBetween = (ctx: CommandContext, a: string, b: string, directed: boolean): ArrowElement[] =>
  connectorsOf(ctx).filter((arrow) => {
    const s = arrow.startConnection?.elementId;
    const e = arrow.endConnection?.elementId;
    return (s === a && e === b) || (!directed && s === b && e === a);
  });

/** Take a connector's ends off the shapes without touching the shapes: the arrow stays where it is, free. */
export const planDetach = (ctx: CommandContext, arrowIds: readonly string[]): DocPatch | null => {
  const update = arrowIds.flatMap((id) => {
    const shape = ctx.index.shapes.get(id);
    if (!shape || !isArrowElement(shape)) return [];
    return [{ ...shape, startConnection: undefined, endConnection: undefined, isManuallyRouted: true } as DrawingElement];
  });
  return update.length === 0 ? null : { add: [], update, remove: [] };
};

export { getArrowHeadVisibility };
