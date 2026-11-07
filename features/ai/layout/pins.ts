import { GAP_BETWEEN_NODES } from "./frame-constants";
import type { Placement, PlacementEngine, PlacementInput } from "./types";

/** Where the user wants a node: its centre in world coordinates. */
export interface NodePin {
  x: number;
  y: number;
}

/** How far from its automatic place a node should sit. Unlike a pin it follows the layout when the diagram grows. */
export interface NodeOffset {
  dx: number;
  dy: number;
}

const MAX_NUDGES = 60;

/**
 * Wraps an engine so pinned nodes keep their centres. The engine lays out everything as usual;
 * pinned nodes are then put where the user left them and any other node that ends up on top of
 * something is slid sideways to the nearest free spot (reading order, so the result is
 * deterministic). Pins for nodes that no longer exist are ignored.
 */
export const withPins =
  (engine: PlacementEngine, pins: Map<string, NodePin>): PlacementEngine =>
  (input: PlacementInput) => {
    const base = engine(input);
    const size = new Map(input.nodes.map((n) => [n.id, n]));
    const live = [...pins.entries()].filter(([id]) => size.has(id));
    if (live.length === 0) return base;

    const placement: Placement = new Map(base);
    const fixed = new Set<string>();
    for (const [id, pin] of live) {
      const n = size.get(id)!;
      placement.set(id, { x: pin.x - n.width / 2, y: pin.y - n.height / 2 });
      fixed.add(id);
    }

    const rect = (id: string) => {
      const p = placement.get(id)!;
      const n = size.get(id)!;
      return { minX: p.x, maxX: p.x + n.width, minY: p.y, maxY: p.y + n.height };
    };
    const collides = (a: string, b: string) => {
      const r = rect(a);
      const o = rect(b);
      return r.minX < o.maxX + GAP_BETWEEN_NODES && r.maxX > o.minX - GAP_BETWEEN_NODES && r.minY < o.maxY && r.maxY > o.minY;
    };

    const settled = new Set(fixed);
    const order = [...placement.entries()]
      .filter(([id]) => !fixed.has(id))
      .sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
      .map(([id]) => id);
    for (const id of order) {
      for (let i = 0; i < MAX_NUDGES; i += 1) {
        const blocker = [...settled].find((other) => collides(id, other));
        if (!blocker) break;
        const r = rect(id);
        const b = rect(blocker);
        const right = b.maxX + GAP_BETWEEN_NODES - r.minX;
        const left = r.maxX - (b.minX - GAP_BETWEEN_NODES);
        placement.get(id)!.x += right <= left ? right : -left;
      }
      settled.add(id);
    }
    return placement;
  };

/**
 * Wraps an engine so listed nodes sit at a fixed offset from where the engine puts them. Built on
 * `withPins`, so overlaps the move causes are resolved the same way. Offsets for nodes that no
 * longer exist are ignored.
 */
export const withOffsets =
  (engine: PlacementEngine, offsets: Map<string, NodeOffset>): PlacementEngine =>
  (input: PlacementInput) => {
    const base = engine(input);
    const size = new Map(input.nodes.map((n) => [n.id, n]));
    const pins = new Map<string, NodePin>();
    for (const [id, offset] of offsets) {
      const node = size.get(id);
      const at = base.get(id);
      if (!node || !at) continue;
      pins.set(id, { x: at.x + node.width / 2 + offset.dx, y: at.y + node.height / 2 + offset.dy });
    }
    return pins.size > 0 ? withPins(() => base, pins)(input) : base;
  };
