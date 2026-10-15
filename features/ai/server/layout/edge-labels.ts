import { estimateTextWidth } from "@/core/text/estimate";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import { expand, inset, overlaps, pathHitsBox, type Box } from "./geometry";

export const EDGE_LABEL_FONT_SIZE = 13;
export const EDGE_LABEL_FONT_WEIGHT = "500";

export interface LabelRequest {
  id: string;
  text: string;
  /** The routed path of the edge this label belongs to. */
  points: Point[];
}

export interface PlacedLabel {
  id: string;
  /** Top-left of the text element. */
  position: Point;
  box: Box;
  /** True when no candidate position was clear of nodes, other labels and other connectors. */
  collides: boolean;
}

// A hit on a node or another label is never acceptable; a connector crossing is just expensive.
const HARD = 1_000_000;
const CONNECTOR = 20_000;
const CLEARANCE = 6;

/**
 * Chooses a position for every edge label: on or beside its own connector, clear of nodes, of the
 * other labels and, where possible, of the other connectors. Greedy and deterministic (labels are
 * handled in the order given). A label that cannot be placed cleanly is still placed at its
 * cheapest candidate and reported with `collides`, never silently overlapped.
 */
export const placeEdgeLabels = (
  requests: LabelRequest[],
  obstacles: Box[],
  allPaths: Map<string, Point[]>,
): PlacedLabel[] => {
  const placed: PlacedLabel[] = [];
  const height = EDGE_LABEL_FONT_SIZE * LINE_HEIGHT_RATIO;

  for (const request of requests) {
    const width = Math.ceil(estimateTextWidth(request.text, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT));
    const candidates: Array<{ box: Box; penalty: number }> = [];

    request.points.slice(0, -1).forEach((from, index) => {
      const to = request.points[index + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length < 1) return;
      const horizontal = Math.abs(to.y - from.y) < Math.abs(to.x - from.x);
      const shortPenalty = (1 - Math.min(length, 160) / 160) * 40;
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const px = from.x + (to.x - from.x) * t;
        const py = from.y + (to.y - from.y) * t;
        const tPenalty = Math.abs(t - 0.5) * 30;
        // The last offsets clear a row of nodes, so a label squeezed between two close nodes can
        // float above or below them rather than overlap one.
        for (const gap of [4, 14, 26, 46, 64]) {
          const spots: Array<[number, number]> = horizontal
            ? [
                [px - width / 2, py - height - gap],
                [px - width / 2, py + gap],
              ]
            : [
                [px + gap, py - height / 2],
                [px - gap - width, py - height / 2],
              ];
          for (const [x, y] of spots) {
            candidates.push({
              box: { minX: x, minY: y, maxX: x + width, maxY: y + height },
              penalty: tPenalty + shortPenalty + gap * 0.6,
            });
          }
        }
      }
    });

    let best: { box: Box; cost: number } | null = null;
    for (const candidate of candidates) {
      const padded = expand(candidate.box, CLEARANCE);
      let cost = candidate.penalty;
      for (const obstacle of obstacles) if (overlaps(padded, obstacle)) cost += HARD;
      for (const other of placed) if (overlaps(padded, other.box)) cost += HARD;
      const core = inset(candidate.box, 0.5);
      for (const [id, path] of allPaths) {
        if (pathHitsBox(path, core)) cost += id === request.id ? CONNECTOR * 2 : CONNECTOR;
      }
      if (!best || cost < best.cost) best = { box: candidate.box, cost };
    }

    // An edge with no usable segment (zero length) has nowhere to hang a label.
    const box = best?.box ?? { minX: request.points[0].x, minY: request.points[0].y, maxX: request.points[0].x + width, maxY: request.points[0].y + height };
    placed.push({
      id: request.id,
      position: { x: box.minX, y: box.minY },
      box,
      collides: !best || best.cost >= HARD,
    });
  }
  return placed;
};
