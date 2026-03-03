/**
 * Port Resolver – Intelligent port selection for arrow connections.
 *
 * Determines the optimal exit/entry ports on shapes based on:
 * - Relative spatial position (source above/below/left/right of target)
 * - Layer hierarchy (vertical transitions use bottom→top)
 * - Same-layer routing (prefers left/right)
 * - Port slot congestion (spreads connections across available ports)
 * - Deterministic ordering (stable across renders)
 */

import {
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { Aabb } from "@/core/collision/aabb";

// ─────────────────── Types ───────────────────

export interface PortResolverShape {
  id: string;
  bounds: Aabb;
  /** Layer index (0 = top layer). Undefined means no layer info. */
  layerIndex?: number;
  /** Cluster ID this shape belongs to. */
  clusterId?: string;
}

export interface PortResolutionContext {
  /** All shapes on the canvas for congestion tracking. */
  allShapes: PortResolverShape[];
  /** Already-assigned port usages: shapeId → handle → count. */
  portUsage: PortUsageMap;
  /** Maximum connections per port side before overflow. */
  maxPortSlots: number;
}

export interface PortPair {
  startHandle: ConnectionHandle;
  endHandle: ConnectionHandle;
  startPoint: Point;
  endPoint: Point;
}

/** Tracks how many connections each port side of each shape has. */
export type PortUsageMap = Map<string, Map<ConnectionHandle, number>>;

// ─────────────────── Constants ───────────────────

const PORT_SIDES: readonly ConnectionHandle[] = [
  "top",
  "right",
  "bottom",
  "left",
] as const;
const DEFAULT_MAX_PORT_SLOTS = 6;

// ─────────────────── Port Usage Tracking ───────────────────

export const createPortUsageMap = (): PortUsageMap => new Map();

export const recordPortUsage = (
  usage: PortUsageMap,
  shapeId: string,
  handle: ConnectionHandle,
): void => {
  if (!usage.has(shapeId)) {
    usage.set(shapeId, new Map<ConnectionHandle, number>());
  }
  const shapeUsage = usage.get(shapeId)!;
  shapeUsage.set(handle, (shapeUsage.get(handle) ?? 0) + 1);
};

export const getPortUsageCount = (
  usage: PortUsageMap,
  shapeId: string,
  handle: ConnectionHandle,
): number => {
  return usage.get(shapeId)?.get(handle) ?? 0;
};

// ─────────────────── Port Point Calculation ───────────────────

/**
 * Get the connection point for a given port on a shape.
 * Uses slot-based spacing when multiple arrows share the same port side.
 */
export const getPortPoint = (
  bounds: Aabb,
  handle: ConnectionHandle,
  slotIndex: number = 0,
  totalSlots: number = 1,
): Point => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Distribute slots evenly along the port side.
  // slot fraction: 0.5 for single, spread for multiple.
  const fraction = totalSlots <= 1 ? 0.5 : (slotIndex + 1) / (totalSlots + 1);

  switch (handle) {
    case "top":
      return { x: bounds.minX + width * fraction, y: bounds.minY };
    case "bottom":
      return { x: bounds.minX + width * fraction, y: bounds.maxY };
    case "left":
      return { x: bounds.minX, y: bounds.minY + height * fraction };
    case "right":
      return { x: bounds.maxX, y: bounds.minY + height * fraction };
  }
};

// ─────────────────── Direction Analysis ───────────────────

interface DirectionVector {
  dx: number;
  dy: number;
  angle: number;
  /** Primary compass direction. */
  primary: "up" | "down" | "left" | "right";
}

const analyzeDirection = (source: Aabb, target: Aabb): DirectionVector => {
  const scx = (source.minX + source.maxX) / 2;
  const scy = (source.minY + source.maxY) / 2;
  const tcx = (target.minX + target.maxX) / 2;
  const tcy = (target.minY + target.maxY) / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  const angle = Math.atan2(dy, dx);

  let primary: DirectionVector["primary"];
  if (Math.abs(dx) > Math.abs(dy)) {
    primary = dx > 0 ? "right" : "left";
  } else {
    primary = dy > 0 ? "down" : "up";
  }

  return { dx, dy, angle, primary };
};

// ─────────────────── Port Selection Logic ───────────────────

/**
 * Determines the ideal exit port for the source shape.
 */
const selectExitPort = (
  source: PortResolverShape,
  target: PortResolverShape,
  direction: DirectionVector,
): ConnectionHandle => {
  const sameLayer =
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex === target.layerIndex;

  const sourceAboveTarget =
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex < target.layerIndex;

  // Layer-aware: vertical transitions use bottom exit
  if (sourceAboveTarget) return "bottom";

  // Layer-aware: upward transitions use top exit
  if (
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex > target.layerIndex
  ) {
    return "top";
  }

  // Same layer: prefer left/right based on horizontal direction
  if (sameLayer) {
    return direction.dx >= 0 ? "right" : "left";
  }

  // No layer info: use spatial direction
  switch (direction.primary) {
    case "down":
      return "bottom";
    case "up":
      return "top";
    case "right":
      return "right";
    case "left":
      return "left";
  }
};

/**
 * Determines the ideal entry port for the target shape.
 */
const selectEntryPort = (
  source: PortResolverShape,
  target: PortResolverShape,
  direction: DirectionVector,
): ConnectionHandle => {
  const sameLayer =
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex === target.layerIndex;

  const sourceAboveTarget =
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex < target.layerIndex;

  // Layer-aware: downward flow enters from top
  if (sourceAboveTarget) return "top";

  // Layer-aware: upward flow enters from bottom
  if (
    source.layerIndex !== undefined &&
    target.layerIndex !== undefined &&
    source.layerIndex > target.layerIndex
  ) {
    return "bottom";
  }

  // Same layer: enter from opposite side of exit
  if (sameLayer) {
    return direction.dx >= 0 ? "left" : "right";
  }

  // No layer info: enter from opposite of primary direction
  switch (direction.primary) {
    case "down":
      return "top";
    case "up":
      return "bottom";
    case "right":
      return "left";
    case "left":
      return "right";
  }
};

/**
 * Apply congestion-aware adjustment: if the ideal port is overloaded,
 * try adjacent ports. Deterministic: always evaluates in the same order.
 */
const adjustForCongestion = (
  preferred: ConnectionHandle,
  shapeId: string,
  usage: PortUsageMap,
  maxSlots: number,
): ConnectionHandle => {
  const currentUsage = getPortUsageCount(usage, shapeId, preferred);
  if (currentUsage < maxSlots) return preferred;

  // Try adjacent ports in clockwise order from preferred
  const idx = PORT_SIDES.indexOf(preferred);
  const candidates: ConnectionHandle[] = [
    PORT_SIDES[(idx + 1) % 4],
    PORT_SIDES[(idx + 3) % 4], // counter-clockwise
    PORT_SIDES[(idx + 2) % 4], // opposite
  ];

  for (const candidate of candidates) {
    const candidateUsage = getPortUsageCount(usage, shapeId, candidate);
    if (candidateUsage < maxSlots) return candidate;
  }

  // All ports congested, stick with preferred
  return preferred;
};

// ─────────────────── Public API ───────────────────

/**
 * Resolve the optimal port pair for a connection between two shapes.
 *
 * Pure and deterministic: same inputs always produce same outputs.
 * Considers layer hierarchy, spatial direction, and port congestion.
 */
export const resolvePortPair = (
  source: PortResolverShape,
  target: PortResolverShape,
  context: PortResolutionContext,
): PortPair => {
  const maxSlots = context.maxPortSlots || DEFAULT_MAX_PORT_SLOTS;
  const direction = analyzeDirection(source.bounds, target.bounds);

  // Select ideal ports
  let startHandle = selectExitPort(source, target, direction);
  let endHandle = selectEntryPort(source, target, direction);

  // Adjust for congestion
  startHandle = adjustForCongestion(
    startHandle,
    source.id,
    context.portUsage,
    maxSlots,
  );
  endHandle = adjustForCongestion(
    endHandle,
    target.id,
    context.portUsage,
    maxSlots,
  );

  // Calculate slot-aware connection points
  const startSlot = getPortUsageCount(
    context.portUsage,
    source.id,
    startHandle,
  );
  const endSlot = getPortUsageCount(context.portUsage, target.id, endHandle);

  // Record usage for subsequent calls
  recordPortUsage(context.portUsage, source.id, startHandle);
  recordPortUsage(context.portUsage, target.id, endHandle);

  // Estimate total slots for spacing (current + 1 for this connection)
  const startTotalSlots = startSlot + 1;
  const endTotalSlots = endSlot + 1;

  const startPoint = getPortPoint(
    source.bounds,
    startHandle,
    startSlot,
    startTotalSlots,
  );
  const endPoint = getPortPoint(
    target.bounds,
    endHandle,
    endSlot,
    endTotalSlots,
  );

  return { startHandle, endHandle, startPoint, endPoint };
};

/**
 * Batch port resolution for multiple edges.
 * Processes edges in deterministic order (sorted by arrowId)
 * and tracks port usage across all resolutions.
 */
export const resolvePortPairsBatch = (
  edges: Array<{
    arrowId: string;
    sourceId: string;
    targetId: string;
  }>,
  shapes: Map<string, PortResolverShape>,
  maxPortSlots: number = DEFAULT_MAX_PORT_SLOTS,
): Map<string, PortPair> => {
  const portUsage = createPortUsageMap();
  const context: PortResolutionContext = {
    allShapes: Array.from(shapes.values()),
    portUsage,
    maxPortSlots,
  };

  const results = new Map<string, PortPair>();

  // Sort for determinism
  const sorted = [...edges].sort((a, b) => a.arrowId.localeCompare(b.arrowId));

  for (const edge of sorted) {
    const source = shapes.get(edge.sourceId);
    const target = shapes.get(edge.targetId);
    if (!source || !target) continue;

    const pair = resolvePortPair(source, target, context);
    results.set(edge.arrowId, pair);
  }

  return results;
};
