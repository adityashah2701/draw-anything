import { lintDiagram } from "../tools/lint";
import { collinearOverlap, inset, pathLength, segmentHitsBox, segmentsCross, type Box } from "@/features/ai/server/layout/geometry";
import { isNodeElement, measureLayout } from "@/features/ai/server/layout/metrics";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { BuiltCanvas } from "./canvas";
import type { BuilderState } from "./state";

export interface CanvasReport {
  /** Specific things to fix, each naming the connections or nodes involved. Empty when the picture is clean. */
  problems: string[];
  /** One line of counts. */
  summary: string;
  /** Where every node is and which sides every connection uses (for the `view` tool). */
  detail: string;
  /** For comparing two versions of the picture: fewer problems first, then shorter connectors. */
  score: { problems: number; connectorLength: number };
}

const MAX_PROBLEMS = 8;
const MAX_DETAIL_CHARS = 2_200;
const MAX_BENDS = 3;
/** A connector longer than this (px) reads as the diagram being spread out. */
const LONG_CONNECTOR = 600;

const isArrow = (e: DrawingElement) => e.type === "arrow" || e.type === "arrow-bidirectional";

const sideOf = (box: Box, p: Point): string => {
  const d = { left: Math.abs(p.x - box.minX), right: Math.abs(p.x - box.maxX), top: Math.abs(p.y - box.minY), bottom: Math.abs(p.y - box.maxY) };
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]);
};

/** Reads the drawn canvas the way a person looks at it: what overlaps, crosses, detours or shares a line, by name. */
export const reportCanvas = (built: BuiltCanvas, state: BuilderState): CanvasReport => {
  const { elements, document } = built;
  const nodes = elements.filter(isNodeElement);
  const arrows = elements.filter(isArrow);
  const boxOf = new Map<string, Box>(nodes.map((n) => [n.id, { minX: Math.min(n.points[0].x, n.points[1].x), minY: Math.min(n.points[0].y, n.points[1].y), maxX: Math.max(n.points[0].x, n.points[1].x), maxY: Math.max(n.points[0].y, n.points[1].y) }]));
  const nameOf = new Map(nodes.map((n) => [n.id, n.label ?? n.ai?.semanticId ?? n.id]));
  const arrowName = (a: DrawingElement & { startConnection?: { elementId: string }; endConnection?: { elementId: string } }) =>
    `${nameOf.get(a.startConnection?.elementId ?? "") ?? "?"} > ${nameOf.get(a.endConnection?.elementId ?? "") ?? "?"}`;
  type Arrow = DrawingElement & { startConnection?: { elementId: string }; endConnection?: { elementId: string } };
  const list = arrows as Arrow[];

  const overlapsNodes: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = boxOf.get(nodes[i].id)!;
      const b = boxOf.get(nodes[j].id)!;
      if (Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1 && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 1) {
        overlapsNodes.push(`${nameOf.get(nodes[i].id)} overlaps ${nameOf.get(nodes[j].id)}`);
      }
    }
  }

  const through: string[] = [];
  const bendy: string[] = [];
  const detours: string[] = [];
  const longEdges: string[] = [];
  for (const arrow of list) {
    const ends = new Set([arrow.startConnection?.elementId, arrow.endConnection?.elementId]);
    const segments = arrow.points.slice(0, -1).map((p, i) => [p, arrow.points[i + 1]] as const);
    for (const node of nodes) {
      if (ends.has(node.id)) continue;
      if (segments.some(([p, q]) => segmentHitsBox(p, q, inset(boxOf.get(node.id)!, 1)))) through.push(`${arrowName(arrow)} passes through ${nameOf.get(node.id)}`);
    }
    const bends = Math.max(0, arrow.points.length - 2);
    if (bends > MAX_BENDS) bendy.push(`${arrowName(arrow)} has ${bends} bends`);
    const first = arrow.points[0];
    const last = arrow.points[arrow.points.length - 1];
    const manhattan = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
    const length = pathLength(arrow.points);
    if (length > LONG_CONNECTOR) longEdges.push(`${arrowName(arrow)} is very long (${Math.round(length)}px): bring the two closer, or reset moves that pulled them apart`);
    if (manhattan > 0 && length > 3 * manhattan) detours.push(`${arrowName(arrow)} takes a long detour (${Math.round(length)}px for ${Math.round(manhattan)}px apart)`);
  }

  const crossings: string[] = [];
  const shared: string[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const sameEnd =
        list[i].startConnection?.elementId === list[j].startConnection?.elementId ||
        list[i].endConnection?.elementId === list[j].endConnection?.elementId;
      let crosses = false;
      let overlapping = false;
      const pa = list[i].points;
      const pb = list[j].points;
      for (let s = 0; s < pa.length - 1; s += 1) {
        for (let t = 0; t < pb.length - 1; t += 1) {
          if (segmentsCross(pa[s], pa[s + 1], pb[t], pb[t + 1])) crosses = true;
          if (collinearOverlap(pa[s], pa[s + 1], pb[t], pb[t + 1]) > 2) overlapping = true;
        }
      }
      if (crosses) crossings.push(`${arrowName(list[i])} crosses ${arrowName(list[j])}`);
      if (overlapping && !sameEnd) shared.push(`${arrowName(list[i])} runs along the same line as ${arrowName(list[j])}`);
    }
  }

  const metrics = measureLayout(elements, document.groups);
  const problems = [
    ...overlapsNodes,
    ...through,
    ...shared,
    ...crossings,
    ...detours,
    ...longEdges,
    ...bendy,
    ...(metrics.labelsColliding > 0 ? [`${metrics.labelsColliding} connection label(s) overlap a node, a line or another label`] : []),
    ...(metrics.groupViolations > 0 || metrics.groupsDropped > 0 ? [`${metrics.groupViolations + metrics.groupsDropped} group frame problem(s): a frame is missing, or covers a node that is not in it`] : []),
    ...lintDiagram(state.parsed, metrics).filter((f) => f.rule === "generic-icons" || f.rule === "long-label").map((f) => f.advice),
  ];

  const rows = [...nodes].sort((a, b) => a.points[0].y - b.points[0].y || a.points[0].x - b.points[0].x);
  const nodeLines = rows.map((n) => {
    const box = boxOf.get(n.id)!;
    return `${nameOf.get(n.id)} (${Math.round((box.minX + box.maxX) / 2)}, ${Math.round((box.minY + box.maxY) / 2)})`;
  });
  const edgeLines = list.map((a) => {
    const start = boxOf.get(a.startConnection?.elementId ?? "");
    const end = boxOf.get(a.endConnection?.elementId ?? "");
    const from = start ? sideOf(start, a.points[0]) : "?";
    const to = end ? sideOf(end, a.points[a.points.length - 1]) : "?";
    return `${arrowName(a)}: ${from} -> ${to}, ${Math.max(0, a.points.length - 2)} bends`;
  });
  let detail = [`Nodes (centre x, y; y grows downward):`, nodeLines.join("; "), `Connections (side it leaves -> side it enters):`, ...edgeLines].join("\n");
  if (detail.length > MAX_DETAIL_CHARS) detail = `${detail.slice(0, MAX_DETAIL_CHARS - 1)}…`;

  return {
    problems: problems.slice(0, MAX_PROBLEMS),
    summary: `${nodes.length} nodes, ${list.length} connections, ${metrics.edgeCrossings} crossings, longest connector ${Math.round(metrics.longestEdge)}px`,
    detail,
    score: { problems: problems.length, connectorLength: metrics.totalEdgeLength },
  };
};
