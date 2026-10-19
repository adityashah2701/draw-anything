import { unionBounds } from "@/core/geometry/box";
import type { DocPatch } from "@/core/groups/patch";
import { expandOffsets, unitBoxes, type Offset, type UnitBox } from "@/core/groups/units";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { planMoveByOffsets } from "./arrange";
import type { CommandContext } from "./context";

export type LayoutAlgorithm = "layered" | "row" | "column" | "grid" | "circle";

export interface LayoutOptions {
  algorithm: LayoutAlgorithm;
  /** `layered` only: ranks run downwards or to the right. */
  direction?: "down" | "right";
  /** Clear space between neighbouring shapes. */
  gap?: number;
  /** `grid` only; defaults to about a square. */
  columns?: number;
}

export interface LayoutPlan {
  patch: DocPatch | null;
  /** Shapes that were moved (connectors that followed are not counted). */
  moved: string[];
  notes: string[];
  /** The units that were arranged. */
  units: number;
}

export const DEFAULT_GAP = 48;

/** Shapes a layout arranges: things that can be connected to (boxes, nodes, icons), not text, lines, connectors or frames. */
export const isLayoutNode = (shape: DrawingElement) =>
  !shape.isGuide && !isArrowElement(shape) && shape.points.length >= 2 && getShapeDefinition(shape.type)?.capabilities?.includes("connectable") === true;

/** The units a command works on: the given shape ids (groups as one box), or every node on the board. */
const unitsFor = (ctx: CommandContext, ids: readonly string[] | null): UnitBox[] => {
  const candidates = ids === null ? ctx.shapes.filter(isLayoutNode).map((shape) => shape.id) : [...ids];
  const selected = candidates.filter((id) => {
    const shape = ctx.index.shapes.get(id);
    // Connectors follow what they join; guides (frames, titles, edge labels) are annotations, not nodes.
    return shape !== undefined && !shape.isGuide && !isArrowElement(shape);
  });
  return unitBoxes(ctx.index, selected, (id) => {
    const shape = ctx.index.shapes.get(id);
    return shape ? ctx.getBounds(shape) : null;
  });
};

const round = (n: number) => Math.round(n * 2) / 2;

/** Offsets that put each unit's top-left at `target`, as moves; locked units keep their place. */
const toOffsets = (units: readonly UnitBox[], target: ReadonlyMap<string, { x: number; y: number }>): Map<string, Offset> => {
  const out = new Map<string, Offset>();
  for (const unit of units) {
    const at = target.get(unit.id);
    if (!at || unit.locked) continue;
    const dx = round(at.x - unit.bounds.minX);
    const dy = round(at.y - unit.bounds.minY);
    if (dx !== 0 || dy !== 0) out.set(unit.id, { dx, dy });
  }
  return out;
};

const sizeOf = (unit: UnitBox) => ({ w: unit.bounds.width, h: unit.bounds.height });

const byReading = (a: UnitBox, b: UnitBox) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX || a.id.localeCompare(b.id);

type Placement = Map<string, { x: number; y: number }>;

const rowOrColumn = (units: readonly UnitBox[], axis: "x" | "y", gap: number): Placement => {
  const sorted = [...units].sort((a, b) => (axis === "x" ? a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY : a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX) || a.id.localeCompare(b.id));
  const placement: Placement = new Map();
  const cross = sorted.reduce((sum, unit) => sum + (axis === "x" ? unit.bounds.minY + unit.bounds.height / 2 : unit.bounds.minX + unit.bounds.width / 2), 0) / sorted.length;
  let cursor = 0;
  for (const unit of sorted) {
    const { w, h } = sizeOf(unit);
    placement.set(unit.id, axis === "x" ? { x: cursor, y: cross - h / 2 } : { x: cross - w / 2, y: cursor });
    cursor += (axis === "x" ? w : h) + gap;
  }
  return placement;
};

const grid = (units: readonly UnitBox[], columns: number | undefined, gap: number): Placement => {
  const sorted = [...units].sort(byReading);
  const cols = Math.max(1, Math.min(sorted.length, columns ?? Math.ceil(Math.sqrt(sorted.length))));
  const cellW = Math.max(...sorted.map((u) => u.bounds.width));
  const cellH = Math.max(...sorted.map((u) => u.bounds.height));
  const placement: Placement = new Map();
  sorted.forEach((unit, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const { w, h } = sizeOf(unit);
    placement.set(unit.id, { x: col * (cellW + gap) + (cellW - w) / 2, y: row * (cellH + gap) + (cellH - h) / 2 });
  });
  return placement;
};

const circle = (units: readonly UnitBox[], gap: number): Placement => {
  const centre = { x: units.reduce((s, u) => s + u.bounds.minX + u.bounds.width / 2, 0) / units.length, y: units.reduce((s, u) => s + u.bounds.minY + u.bounds.height / 2, 0) / units.length };
  // Keep the order people already see: by angle around the middle, starting at the top.
  const angle = (u: UnitBox) => (Math.atan2(u.bounds.minY + u.bounds.height / 2 - centre.y, u.bounds.minX + u.bounds.width / 2 - centre.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  const sorted = [...units].sort((a, b) => angle(a) - angle(b) || a.id.localeCompare(b.id));
  const widest = Math.max(...sorted.map((u) => Math.max(u.bounds.width, u.bounds.height)));
  const radius = Math.max(widest, (sorted.length * (widest + gap)) / (2 * Math.PI));
  const placement: Placement = new Map();
  sorted.forEach((unit, i) => {
    const theta = -Math.PI / 2 + (2 * Math.PI * i) / sorted.length;
    const { w, h } = sizeOf(unit);
    placement.set(unit.id, { x: radius * Math.cos(theta) - w / 2, y: radius * Math.sin(theta) - h / 2 });
  });
  return placement;
};

/** Connections between units (by unit id), each once, in the connectors' own direction. Cycles are cut so ranks exist. */
const unitEdges = (ctx: CommandContext, units: readonly UnitBox[]): Array<[string, string]> => {
  const unitOf = new Map<string, string>();
  for (const unit of units) for (const leaf of unit.leaves) unitOf.set(leaf, unit.id);
  const seen = new Set<string>();
  const edges: Array<[string, string]> = [];
  for (const shape of ctx.shapes) {
    if (!isArrowElement(shape)) continue;
    const a = shape.startConnection?.elementId && unitOf.get(shape.startConnection.elementId);
    const b = shape.endConnection?.elementId && unitOf.get(shape.endConnection.elementId);
    if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    edges.push([a, b]);
  }
  return edges;
};

const layered = (ctx: CommandContext, units: readonly UnitBox[], direction: "down" | "right", gap: number): Placement | null => {
  const edges = unitEdges(ctx, units);
  if (edges.length === 0) return null;
  const ids = [...units].sort(byReading).map((u) => u.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inc = new Map<string, string[]>(ids.map((id) => [id, []]));

  // Cut cycles: a depth-first walk drops the edge that closes a loop.
  const state = new Map<string, 0 | 1 | 2>();
  const kept: Array<[string, string]> = [];
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of edges) adjacency.get(a)!.push(b);
  const visit = (id: string) => {
    state.set(id, 1);
    for (const next of adjacency.get(id)!) {
      if (state.get(next) === 1) continue; // back edge
      kept.push([id, next]);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  for (const [a, b] of kept) {
    out.get(a)!.push(b);
    inc.get(b)!.push(a);
  }

  const rank = new Map<string, number>();
  const rankOf = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    rank.set(id, 0);
    const r = Math.max(-1, ...inc.get(id)!.map(rankOf)) + 1;
    rank.set(id, r);
    return r;
  };
  for (const id of ids) rankOf(id);

  const layers: string[][] = [];
  for (const id of ids) (layers[rank.get(id)!] ??= []).push(id);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const along = (id: string) => {
    const b = unitById.get(id)!.bounds;
    return direction === "down" ? b.minX + b.width / 2 : b.minY + b.height / 2;
  };
  layers.forEach((layer) => layer.sort((a, b) => along(a) - along(b) || a.localeCompare(b)));

  const position = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer.forEach((id, i) => position.set(id, i)));
  index();
  const barycentre = (id: string, neighbours: string[]) => (neighbours.length === 0 ? position.get(id)! : neighbours.reduce((s, n) => s + position.get(n)!, 0) / neighbours.length);
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1).map((_, i) => i + 1) : layers.slice(0, -1).map((_, i) => layers.length - 2 - i);
    for (const l of order) {
      layers[l].sort((a, b) => barycentre(a, down ? inc.get(a)! : out.get(a)!) - barycentre(b, down ? inc.get(b)! : out.get(b)!) || a.localeCompare(b));
      layers[l].forEach((id, i) => position.set(id, i));
    }
  }

  const extent = (id: string) => (direction === "down" ? unitById.get(id)!.bounds.width : unitById.get(id)!.bounds.height);
  const thickness = (id: string) => (direction === "down" ? unitById.get(id)!.bounds.height : unitById.get(id)!.bounds.width);
  const layerExtent = layers.map((layer) => layer.reduce((s, id) => s + extent(id), 0) + gap * (layer.length - 1));
  const widest = Math.max(...layerExtent);
  const placement: Placement = new Map();
  let cursor = 0;
  layers.forEach((layer, l) => {
    let along2 = (widest - layerExtent[l]) / 2;
    for (const id of layer) {
      const thick = Math.max(...layer.map(thickness));
      const across = cursor + (thick - thickness(id)) / 2;
      placement.set(id, direction === "down" ? { x: along2, y: across } : { x: across, y: along2 });
      along2 += extent(id) + gap;
    }
    cursor += Math.max(...layer.map(thickness)) + gap;
  });
  return placement;
};

/**
 * Arrange existing shapes with one of a few algorithms. Shapes keep their size, ids, labels, connections
 * and groups; only positions change, connectors are re-routed, and the arrangement stays where the shapes
 * were (its top-left corner is the old union's). Locked shapes stay and the rest lays out around nothing:
 * lock what must not move. `ids` null = every node on the board.
 */
export const planAutoLayout = (ctx: CommandContext, ids: readonly string[] | null, options: LayoutOptions): LayoutPlan => {
  const units = unitsFor(ctx, ids);
  const notes: string[] = [];
  const movable = units.filter((unit) => !unit.locked);
  if (movable.length < 2) return { patch: null, moved: [], notes: ["Nothing to arrange: a layout needs two or more unlocked shapes."], units: units.length };
  const gap = options.gap ?? DEFAULT_GAP;

  let placement: Placement | null;
  let algorithm = options.algorithm;
  if (algorithm === "layered") {
    placement = layered(ctx, movable, options.direction ?? "down", gap);
    if (!placement) {
      notes.push("No connectors join these shapes, so a layered layout has no ranks; a grid was used instead.");
      algorithm = "grid";
      placement = grid(movable, options.columns, gap);
    }
  } else if (algorithm === "row") placement = rowOrColumn(movable, "x", gap);
  else if (algorithm === "column") placement = rowOrColumn(movable, "y", gap);
  else if (algorithm === "grid") placement = grid(movable, options.columns, gap);
  else placement = circle(movable, gap);

  // Keep the arrangement where the shapes were: its top-left stays the old union's.
  const before = unionBounds(movable.map((u) => u.bounds))!;
  const afterBox = unionBounds([...placement].map(([id, at]) => {
    const unit = movable.find((u) => u.id === id)!;
    return { minX: at.x, minY: at.y, maxX: at.x + unit.bounds.width, maxY: at.y + unit.bounds.height, width: unit.bounds.width, height: unit.bounds.height } satisfies Bounds;
  }))!;
  const shift = { x: before.minX - afterBox.minX, y: before.minY - afterBox.minY };
  const target: Placement = new Map([...placement].map(([id, at]) => [id, { x: at.x + shift.x, y: at.y + shift.y }]));

  const offsets = expandOffsets(movable, toOffsets(movable, target));
  const patch = planMoveByOffsets(ctx, offsets);
  const frames = ctx.shapes.some((shape) => shape.isGuide && shape.ai?.role === "group");
  if (frames && patch) notes.push("Group frames and their titles are not moved by a layout; check they still wrap their members.");
  return { patch, moved: [...offsets.keys()], notes, units: units.length };
};

// ── tidy ────────────────────────────────────────────────────────────────────────────────────────

export interface TidyOptions {
  /** Centres closer than this (world units) count as one row or column. */
  tolerance?: number;
  /** Clear space kept between shapes when overlaps are pulled apart. */
  minGap?: number;
}

interface Live {
  unit: UnitBox;
  minX: number;
  minY: number;
}

const rightOf = (l: Live) => l.minX + l.unit.bounds.width;
const bottomOf = (l: Live) => l.minY + l.unit.bounds.height;
const centreX = (l: Live) => l.minX + l.unit.bounds.width / 2;
const centreY = (l: Live) => l.minY + l.unit.bounds.height / 2;

const cluster = (items: Live[], centre: (l: Live) => number, tolerance: number): Live[][] => {
  const sorted = [...items].sort((a, b) => centre(a) - centre(b) || a.unit.id.localeCompare(b.unit.id));
  const groups: Live[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const mean = last ? last.reduce((s, l) => s + centre(l), 0) / last.length : 0;
    if (last && Math.abs(centre(item) - mean) <= tolerance) last.push(item);
    else groups.push([item]);
  }
  return groups.filter((g) => g.length >= 2);
};

/**
 * Make an untidy diagram readable without changing what it says: shapes whose centres almost line up are
 * lined up, evenly spaced rows and columns get equal gaps, and shapes that touch or overlap are pulled
 * apart. Only positions change (ids, labels, connections, groups and stacking are untouched); connectors
 * are re-routed; locked shapes stay and others move around them. `ids` null = every node on the board.
 */
export const planTidy = (ctx: CommandContext, ids: readonly string[] | null, options: TidyOptions = {}): LayoutPlan => {
  const units = unitsFor(ctx, ids);
  const tolerance = options.tolerance ?? 24;
  const minGap = options.minGap ?? 24;
  const live: Live[] = units.map((unit) => ({ unit, minX: unit.bounds.minX, minY: unit.bounds.minY }));
  const movable = (l: Live) => !l.unit.locked;
  const notes: string[] = [];
  if (live.filter(movable).length === 0) return { patch: null, moved: [], notes: ["Everything selected is locked."], units: units.length };

  // 1. Rows, then columns: centres that almost agree are made to agree (a locked shape fixes its row or column).
  for (const row of cluster(live, centreY, tolerance)) {
    const fixed = row.find((l) => !movable(l));
    const target = fixed ? centreY(fixed) : row.reduce((s, l) => s + centreY(l), 0) / row.length;
    for (const l of row) if (movable(l)) l.minY += target - centreY(l);
  }
  for (const col of cluster(live, centreX, tolerance)) {
    const fixed = col.find((l) => !movable(l));
    const target = fixed ? centreX(fixed) : col.reduce((s, l) => s + centreX(l), 0) / col.length;
    for (const l of col) if (movable(l)) l.minX += target - centreX(l);
  }

  // 2. Equal gaps along rows and columns of three or more that do not overlap.
  const equalise = (group: Live[], axis: "x" | "y") => {
    const sorted = [...group].sort((a, b) => (axis === "x" ? a.minX - b.minX : a.minY - b.minY));
    if (sorted.length < 3 || sorted.some((l) => !movable(l))) return;
    const start = (l: Live) => (axis === "x" ? l.minX : l.minY);
    const end = (l: Live) => (axis === "x" ? rightOf(l) : bottomOf(l));
    const gaps = sorted.slice(1).map((l, i) => start(l) - end(sorted[i]));
    if (gaps.some((g) => g < 0)) return;
    const middle = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const span = end(sorted[sorted.length - 1]) - start(sorted[0]);
    const total = sorted.reduce((s, l) => s + (end(l) - start(l)), 0) + middle * (sorted.length - 1);
    let cursor = start(sorted[0]) + (span - total) / 2;
    for (const l of sorted) {
      if (axis === "x") l.minX = cursor;
      else l.minY = cursor;
      cursor += end(l) - start(l) + middle;
    }
  };
  for (const row of cluster(live, centreY, tolerance)) equalise(row, "x");
  for (const col of cluster(live, centreX, tolerance)) equalise(col, "y");

  // 3. Pull overlapping or touching shapes apart along the axis that needs the smaller move.
  let unresolved = 0;
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    const order = [...live].sort((a, b) => a.minY - b.minY || a.minX - b.minX || a.unit.id.localeCompare(b.unit.id));
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const a = order[i];
        const b = order[j];
        const overlapX = Math.min(rightOf(a), rightOf(b)) - Math.max(a.minX, b.minX) + minGap;
        const overlapY = Math.min(bottomOf(a), bottomOf(b)) - Math.max(a.minY, b.minY) + minGap;
        if (overlapX <= 0 || overlapY <= 0) continue;
        const mover = movable(b) ? b : movable(a) ? a : null;
        if (!mover) continue;
        const anchor = mover === b ? a : b;
        if (overlapX < overlapY) mover.minX += (centreX(mover) >= centreX(anchor) ? 1 : -1) * overlapX;
        else mover.minY += (centreY(mover) >= centreY(anchor) ? 1 : -1) * overlapY;
        moved = true;
      }
    }
    if (!moved) break;
    if (pass === 39) unresolved += 1;
  }
  if (unresolved > 0) notes.push("Some shapes still overlap after the maximum number of passes.");

  const target: Placement = new Map(live.map((l) => [l.unit.id, { x: l.minX, y: l.minY }]));
  const offsets = expandOffsets(units, toOffsets(units, target));
  const patch = planMoveByOffsets(ctx, offsets);
  return { patch, moved: [...offsets.keys()], notes, units: units.length };
};

