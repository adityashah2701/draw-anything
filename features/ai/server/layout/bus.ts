import type { ConnectionHandle, Point } from "@/features/whiteboard/types/whiteboard.types";
import { expand, pathHitsBox, type Box } from "./geometry";

export interface BusEdge {
  id: string;
  points: Point[];
  sourceId: string;
  targetId: string;
  fromHandle: ConnectionHandle;
  toHandle: ConnectionHandle;
}

const CLEARANCE = 6;
const MIN_RUN = 24; // room for the stub at each end

const isVertical = (h: ConnectionHandle) => h === "top" || h === "bottom";

/**
 * Edges that leave one node side together (fan-out) or arrive at one side together (fan-in) share
 * a single "bus" level for their middle run, instead of each getting its own slightly different
 * level (which makes one edge's drop cut through its sibling's run). Only edges whose bus path is
 * clear of every other node are changed; the rest keep the route the router found.
 *
 * Handles are paired opposite each other (bottom to top, right to left, ...), the only case where a
 * single shared level makes sense.
 */
export const bundleFans = (edges: BusEdge[], boxes: Array<{ id: string; box: Box }>): Map<string, Point[]> => {
  const result = new Map(edges.map((e) => [e.id, e.points]));
  const done = new Set<string>();

  /** The 3-segment path through level `level` (a y for vertical handles, an x for horizontal ones). */
  const busPath = (edge: BusEdge, level: number): Point[] => {
    const a = edge.points[0];
    const b = edge.points[edge.points.length - 1];
    return isVertical(edge.fromHandle)
      ? [a, { x: a.x, y: level }, { x: b.x, y: level }, b]
      : [a, { x: level, y: a.y }, { x: level, y: b.y }, b];
  };

  const clear = (edge: BusEdge, path: Point[]) =>
    boxes.every(({ id, box }) => id === edge.sourceId || id === edge.targetId || !pathHitsBox(path, expand(box, CLEARANCE)));

  const apply = (members: BusEdge[], chooseLevel: (m: BusEdge[]) => number) => {
    let live = members;
    for (let attempt = 0; attempt < 2 && live.length >= 2; attempt += 1) {
      const level = Math.round(chooseLevel(live));
      const paths = new Map(live.map((e) => [e.id, busPath(e, level)]));
      const failing = live.filter((e) => !clear(e, paths.get(e.id)!));
      if (failing.length === 0) {
        live.forEach((e) => {
          result.set(e.id, paths.get(e.id)!);
          done.add(e.id);
        });
        return;
      }
      live = live.filter((e) => !failing.includes(e)); // retry without the ones that would hit a node
    }
  };

  const along = (edge: BusEdge, which: "start" | "end") => {
    const p = which === "start" ? edge.points[0] : edge.points[edge.points.length - 1];
    return isVertical(edge.fromHandle) ? p.y : p.x;
  };
  const opposite = (e: BusEdge) =>
    (e.fromHandle === "bottom" && e.toHandle === "top") ||
    (e.fromHandle === "top" && e.toHandle === "bottom") ||
    (e.fromHandle === "right" && e.toHandle === "left") ||
    (e.fromHandle === "left" && e.toHandle === "right");
  /** +1 when the edge travels toward larger coordinates along its main axis, -1 otherwise, 0 if too short. */
  const direction = (e: BusEdge) => {
    const d = along(e, "end") - along(e, "start");
    return Math.abs(d) < 2 * MIN_RUN ? 0 : Math.sign(d);
  };

  const groups = (key: (e: BusEdge) => string) => {
    const map = new Map<string, BusEdge[]>();
    for (const e of edges) {
      if (done.has(e.id) || !opposite(e) || direction(e) === 0) continue;
      const k = key(e);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.values()].filter((m) => m.length >= 2);
  };

  // Fan-out: the level sits halfway to the nearest target.
  for (const members of groups((e) => `out|${e.sourceId}|${e.fromHandle}`)) {
    apply(members, (m) => {
      const start = along(m[0], "start");
      const sign = direction(m[0]);
      const nearest = sign > 0 ? Math.min(...m.map((e) => along(e, "end"))) : Math.max(...m.map((e) => along(e, "end")));
      return start + (nearest - start) / 2;
    });
  }
  // Fan-in: halfway from the nearest source.
  for (const members of groups((e) => `in|${e.targetId}|${e.toHandle}`)) {
    apply(members, (m) => {
      const end = along(m[0], "end");
      const sign = direction(m[0]);
      const nearest = sign > 0 ? Math.max(...m.map((e) => along(e, "start"))) : Math.min(...m.map((e) => along(e, "start")));
      return end - (end - nearest) / 2;
    });
  }
  return result;
};
