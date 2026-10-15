import { createEstimateContext, estimateTextWidth } from "@/core/text/estimate";
import { layoutShapeLabel } from "@/core/text/label-layout";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  collinearOverlap,
  inset,
  overlapArea,
  overlaps,
  pathHitsBox,
  pathLength,
  segmentHitsBox,
  segmentsCross,
  type Box,
} from "./geometry";

/**
 * Geometry-only quality measures for a compiled diagram. Nothing here looks at pixels: it reads
 * the elements the compiler emits, so the same numbers can judge any layout engine.
 */

export interface LayoutMetrics {
  nodes: number;
  edges: number;
  /** Pairs of node boxes that overlap. */
  nodeOverlaps: number;
  /** Edge labels that overlap a node. */
  labelNodeOverlaps: number;
  labelLabelOverlaps: number;
  /** Edge labels crossed by another edge's segment. */
  labelEdgeOverlaps: number;
  /** Edge labels whose box is not clear of everything (any of the three above). */
  labelsColliding: number;
  /** Pairs of edges whose segments cross properly (not at a shared end). */
  edgeCrossings: number;
  /** Pairs of edges running along the same line for more than a couple of pixels. */
  edgeOverlaps: number;
  /** (edge, node) pairs where the edge passes through a node that is not one of its ends. */
  edgeThroughNodes: number;
  bends: number;
  totalEdgeLength: number;
  /** Edges whose path is more than 3x the Manhattan distance between their ends. */
  detouredEdges: number;
  /** Frames (groups) that also cover a non-member, plus members left outside their frame. */
  groupViolations: number;
  /** Groups declared but not drawn as a frame. */
  groupsDropped: number;
  /** Node labels drawn smaller than requested / cut off, judged with the estimator. */
  labelsShrunk: number;
  labelsCut: number;
  area: number;
}

const EDGE_LABEL_FONT_SIZE = 13;

export const nodeBox = (element: DrawingElement): Box => {
  const [a, b] = element.points;
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
};

export const edgeLabelBox = (element: DrawingElement): Box => {
  const { x, y } = element.points[0];
  const width = estimateTextWidth(element.text ?? "", element.fontSize ?? EDGE_LABEL_FONT_SIZE, element.fontWeight ?? "500");
  return { minX: x, minY: y, maxX: x + width, maxY: y + (element.fontSize ?? EDGE_LABEL_FONT_SIZE) * LINE_HEIGHT_RATIO };
};

export const measureLayout = (
  elements: DrawingElement[],
  groups: Array<{ id: string; nodeIds: string[] }> = [],
): LayoutMetrics => {
  const nodes = elements.filter((e) => e.type === "semantic-node");
  const arrows = elements.filter((e) => e.type === "arrow" || e.type === "arrow-bidirectional");
  const labels = elements.filter((e) => e.ai?.role === "edge-label");
  const frames = elements.filter((e) => e.ai?.role === "group");
  const nodeBoxes = new Map(nodes.map((n) => [n.id, nodeBox(n)]));
  const arrowById = new Map(arrows.map((a) => [a.id, a]));

  let nodeOverlaps = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlaps(nodeBoxes.get(nodes[i].id)!, nodeBoxes.get(nodes[j].id)!)) nodeOverlaps += 1;
    }
  }

  // Edge crossings, shared-line overlaps, pass-through-node.
  let edgeCrossings = 0;
  let edgeOverlaps = 0;
  for (let i = 0; i < arrows.length; i += 1) {
    for (let j = i + 1; j < arrows.length; j += 1) {
      let shared = false;
      // Edges leaving or entering the same node deliberately share their first/last segment.
      const sameEnd =
        arrows[i].startConnection?.elementId === arrows[j].startConnection?.elementId ||
        arrows[i].endConnection?.elementId === arrows[j].endConnection?.elementId;
      const pa = arrows[i].points;
      const pb = arrows[j].points;
      for (let s = 0; s < pa.length - 1; s += 1) {
        for (let t = 0; t < pb.length - 1; t += 1) {
          if (segmentsCross(pa[s], pa[s + 1], pb[t], pb[t + 1])) edgeCrossings += 1;
          if (collinearOverlap(pa[s], pa[s + 1], pb[t], pb[t + 1]) > 2) shared = true;
        }
      }
      if (shared && !sameEnd) edgeOverlaps += 1;
    }
  }

  let edgeThroughNodes = 0;
  let bends = 0;
  let totalEdgeLength = 0;
  let detouredEdges = 0;
  for (const arrow of arrows) {
    const ends = new Set([arrow.startConnection?.elementId, arrow.endConnection?.elementId]);
    const segments = arrow.points.slice(0, -1).map((p, i) => [p, arrow.points[i + 1]] as const);
    for (const node of nodes) {
      if (ends.has(node.id)) continue;
      const box = inset(nodeBoxes.get(node.id)!, 1);
      if (segments.some(([p, q]) => segmentHitsBox(p, q, box))) edgeThroughNodes += 1;
    }
    bends += Math.max(0, arrow.points.length - 2);
    const length = pathLength(arrow.points);
    totalEdgeLength += length;
    const first = arrow.points[0];
    const last = arrow.points[arrow.points.length - 1];
    const manhattan = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
    if (manhattan > 0 && length > 3 * manhattan) detouredEdges += 1;
  }

  // Edge labels.
  const labelBoxes = labels.map((l) => ({ label: l, box: edgeLabelBox(l) }));
  let labelNodeOverlaps = 0;
  let labelLabelOverlaps = 0;
  let labelEdgeOverlaps = 0;
  const colliding = new Set<string>();
  labelBoxes.forEach(({ label, box }, i) => {
    for (const node of nodes) {
      if (overlaps(box, nodeBoxes.get(node.id)!)) {
        labelNodeOverlaps += 1;
        colliding.add(label.id);
      }
    }
    for (let j = i + 1; j < labelBoxes.length; j += 1) {
      if (overlaps(box, labelBoxes[j].box)) {
        labelLabelOverlaps += 1;
        colliding.add(label.id);
        colliding.add(labelBoxes[j].label.id);
      }
    }
    const ownEdge = arrowById.get(label.id.replace(/-label$/, ""));
    for (const arrow of arrows) {
      if (arrow === ownEdge) continue;
      const hit = arrow.points.slice(0, -1).some((p, k) => segmentHitsBox(p, arrow.points[k + 1], inset(box, 0.5)));
      if (hit) {
        labelEdgeOverlaps += 1;
        colliding.add(label.id);
      }
    }
  });

  // Groups: every declared group needs a frame that holds its members and nobody else.
  let groupViolations = 0;
  let groupsDropped = 0;
  const frameBySemanticId = new Map(frames.map((f) => [f.ai?.semanticId ?? f.id, nodeBox(f)]));
  const nodeIdBySemantic = new Map(nodes.map((n) => [n.ai?.semanticId ?? n.id, n.id]));
  const within = (outer: Box, inner: Box) =>
    outer.minX <= inner.minX && outer.maxX >= inner.maxX && outer.minY <= inner.minY && outer.maxY >= inner.maxY;
  for (const group of groups) {
    const frame = frameBySemanticId.get(group.id);
    const memberIds = new Set(group.nodeIds.map((id) => nodeIdBySemantic.get(id)).filter((id): id is string => !!id));
    if (memberIds.size < 2) continue; // never drawn as a frame
    if (!frame) {
      groupsDropped += 1;
      continue;
    }
    for (const node of nodes) {
      const box = nodeBoxes.get(node.id)!;
      if (memberIds.has(node.id)) {
        if (!within(frame, box)) groupViolations += 1; // member left outside its frame
      } else if (overlapArea(frame, box) > 1) {
        groupViolations += 1; // stranger inside the frame
      }
    }
  }

  // Label fit: node label vs its region, using the same layout the renderer runs.
  let labelsShrunk = 0;
  let labelsCut = 0;
  const ctx = createEstimateContext();
  for (const node of nodes) {
    const b = nodeBoxes.get(node.id)!;
    const region = getShapeLabelRegion("semantic-node", { ...b, width: b.maxX - b.minX, height: b.maxY - b.minY });
    const layout = layoutShapeLabel(ctx, {
      label: node.label ?? "",
      boxWidth: region.width,
      boxHeight: region.height,
      fontSize: node.fontSize,
      fontWeight: node.fontWeight,
      maxLines: region.maxLines,
    });
    if (!layout || !layout.fits || layout.brokenWord) labelsCut += 1;
    else if (layout.fontSize < (node.fontSize ?? 16)) labelsShrunk += 1;
  }

  const all = [...nodeBoxes.values()];
  const area = all.length
    ? (Math.max(...all.map((b) => b.maxX)) - Math.min(...all.map((b) => b.minX))) *
      (Math.max(...all.map((b) => b.maxY)) - Math.min(...all.map((b) => b.minY)))
    : 0;

  return {
    nodes: nodes.length,
    edges: arrows.length,
    nodeOverlaps,
    labelNodeOverlaps,
    labelLabelOverlaps,
    labelEdgeOverlaps,
    labelsColliding: colliding.size,
    edgeCrossings,
    edgeOverlaps,
    edgeThroughNodes,
    bends,
    totalEdgeLength: Math.round(totalEdgeLength),
    detouredEdges,
    groupViolations,
    groupsDropped,
    labelsShrunk,
    labelsCut,
    area: Math.round(area),
  };
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * How far apart two layouts of (nearly) the same graph are, by node. Both engines recentre the
 * drawing, so adding a node shifts everything by roughly the same amount; that common shift (the
 * median) is removed first so only genuine reshuffling counts as movement.
 */
export const compareLayouts = (before: DrawingElement[], after: DrawingElement[]) => {
  const prev = new Map(before.filter((e) => e.type === "semantic-node").map((e) => [e.id, nodeBox(e)]));
  const shifts: Array<{ dx: number; dy: number }> = [];
  for (const e of after.filter((n) => n.type === "semantic-node")) {
    const was = prev.get(e.id);
    if (!was) continue;
    const now = nodeBox(e);
    shifts.push({ dx: now.minX - was.minX, dy: now.minY - was.minY });
  }
  const mx = median(shifts.map((s) => s.dx));
  const my = median(shifts.map((s) => s.dy));
  const residual = shifts.map((s) => Math.hypot(s.dx - mx, s.dy - my));
  const moved = residual.filter((r) => r > 1).length;
  return {
    compared: shifts.length,
    moved,
    movedFraction: shifts.length ? moved / shifts.length : 0,
    meanShift: shifts.length ? residual.reduce((a, b) => a + b, 0) / shifts.length : 0,
  };
};
