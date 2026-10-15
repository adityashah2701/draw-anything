import { FRAME_NEST_STEP, FRAME_PADDING, FRAME_TITLE_HEIGHT } from "./frame-constants";
import type { Placement, PlacementInput } from "./types";

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const MAX_PASSES = 4;

/**
 * Moves nodes that are not in a group out of that group's frame.
 *
 * Layered ordering keeps a group's members adjacent within each row, but a group that spans rows
 * covers the x-range of all of its members, so an unrelated node in one row can end up inside the
 * frame. Such a node is slid sideways to the nearer outside edge and the rest of its row is re-spaced
 * (order kept), which leaves the layered structure intact. A few passes at most; a frame that still
 * cannot be made clean is dropped later by the compiler, as before.
 */
export const separateGroups = (placement: Placement, input: PlacementInput): Placement => {
  const out: Placement = new Map([...placement.entries()].map(([id, p]) => [id, { ...p }]));
  const size = new Map(input.nodes.map((n) => [n.id, n]));
  const gap = input.gaps.horizontal;

  const sets = input.groups.filter((g) => g.nodeIds.length >= 2).map((g) => ({ id: g.id, ids: new Set(g.nodeIds) }));
  sets.sort((a, b) => b.ids.size - a.ids.size || a.id.localeCompare(b.id));
  /** Levels of groups nested inside `set` (0 for a group with none): outer frames are padded more. */
  const depthOf = (set: (typeof sets)[number]): number => {
    const inner = sets.filter((o) => o !== set && o.ids.size < set.ids.size && [...o.ids].every((id) => set.ids.has(id)));
    return inner.length ? 1 + Math.max(...inner.map(depthOf)) : 0;
  };

  const rect = (id: string): Rect => {
    const p = out.get(id)!;
    const n = size.get(id)!;
    return { minX: p.x, maxX: p.x + n.width, minY: p.y, maxY: p.y + n.height };
  };
  const frameOf = (set: (typeof sets)[number]): Rect => {
    const members = [...set.ids].filter((id) => out.has(id)).map(rect);
    const pad = FRAME_PADDING + depthOf(set) * FRAME_NEST_STEP;
    return {
      minX: Math.min(...members.map((r) => r.minX)) - pad,
      maxX: Math.max(...members.map((r) => r.maxX)) + pad,
      minY: Math.min(...members.map((r) => r.minY)) - pad - FRAME_TITLE_HEIGHT,
      maxY: Math.max(...members.map((r) => r.maxY)) + pad,
    };
  };
  const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

  /** Nodes whose vertical extent overlaps `id`'s are its row-mates. */
  const rowMates = (id: string) => {
    const r = rect(id);
    return input.nodes.map((n) => n.id).filter((other) => other !== id && out.has(other) && overlaps(rect(other), { ...r, minX: -1e9, maxX: 1e9 }));
  };

  /** Re-space a row left to right after `moved` changed position, never reordering and never overlapping. */
  const respace = (moved: string, direction: -1 | 1) => {
    const row = [moved, ...rowMates(moved)].sort((a, b) => rect(a).minX - rect(b).minX);
    const at = row.indexOf(moved);
    if (direction > 0) {
      for (let i = at + 1; i < row.length; i += 1) {
        const need = rect(row[i - 1]).maxX + gap;
        if (rect(row[i]).minX < need) out.get(row[i])!.x += need - rect(row[i]).minX;
      }
    } else {
      for (let i = at - 1; i >= 0; i -= 1) {
        const need = rect(row[i + 1]).minX - gap;
        if (rect(row[i]).maxX > need) out.get(row[i])!.x -= rect(row[i]).maxX - need;
      }
    }
  };

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let moved = false;
    for (const set of sets) {
      const frame = frameOf(set);
      const strangers = input.nodes
        .map((n) => n.id)
        .filter((id) => out.has(id) && !set.ids.has(id) && overlaps(rect(id), frame))
        .sort((a, b) => rect(a).minX - rect(b).minX);
      for (const id of strangers) {
        const r = rect(id);
        const toLeft = r.maxX - (frame.minX - gap / 2);
        const toRight = frame.maxX + gap / 2 - r.minX;
        // Prefer the side that keeps this node's own connectors short; the distance moved breaks ties.
        const centre = (other: string) => (rect(other).minX + rect(other).maxX) / 2;
        const neighbours = input.edges
          .filter((e) => e.from === id || e.to === id)
          .map((e) => (e.from === id ? e.to : e.from))
          .filter((other) => out.has(other));
        const myCentre = (r.minX + r.maxX) / 2;
        const reach = (shift: number) =>
          neighbours.reduce((sum, other) => sum + Math.abs(centre(other) - (myCentre + shift)), 0) + Math.abs(shift) * 0.5;
        if (reach(-toLeft) <= reach(toRight)) {
          out.get(id)!.x -= toLeft;
          respace(id, -1);
        } else {
          out.get(id)!.x += toRight;
          respace(id, 1);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
};
