import { sizeDiamondNode, sizeIconNode, sizePillNode, sizeSemanticNode, type NodeSize } from "@/core/text/node-size";
import type { ViewportInfo } from "./types";
import { fitZoomFor, MIN_READABLE_PX } from "./review";

export const NODE_KINDS = ["process", "decision", "terminal", "icon", "note"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export interface PlanNode {
  label: string;
  kind?: NodeKind;
}

export interface PlannedSlot {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPlan {
  direction: "down" | "right";
  /** Nodes side by side across one rank. */
  lanes: number;
  ranks: number;
  /** One size per kind, so nodes of a role match. Text-fitted: the label fits at its font size. */
  sizes: Partial<Record<NodeKind, { width: number; height: number }>>;
  gaps: { rank: number; lane: number };
  /** Top-left of every node in the order given, centred in a shared cell. Pass them as x, y, width, height. */
  slots: PlannedSlot[];
  bounds: { width: number; height: number };
  view: {
    /** The whole diagram fits the visible canvas at 100%. */
    fitsAt100: boolean;
    /** The zoom at which it fits (never above 100%). */
    fitZoom: number;
    smallestTextPx: number;
    readable: boolean;
  };
  notes: string[];
}

const FONT = 16;
const WEIGHT = "600";
const RANK_GAP = 80;
const LANE_GAP = 56;
const TIGHT_RANK_GAP = 56;
const TIGHT_LANE_GAP = 40;
/** What the visible canvas is taken to be when the host reports none (a headless run). */
const DEFAULT_VIEW: ViewportInfo = { zoom: 1, pan: { x: 0, y: 0 }, width: 1200, height: 800 };
const MAX_LANES = 8;
/** A diagram needs room around it in the view (matches the editor's fit padding). */
const VIEW_PADDING = 80;

const sizeOf = (kind: NodeKind, label: string): NodeSize => {
  const base = { label, fontSize: FONT, fontWeight: WEIGHT };
  switch (kind) {
    case "decision":
      return sizeDiamondNode({ ...base, minWidth: 160, maxWidth: 280, minHeight: 100 });
    case "terminal":
      return sizePillNode({ ...base, minWidth: 140, maxWidth: 260, minHeight: 56 });
    case "icon":
      return sizeIconNode({ label, fontSize: 14, fontWeight: WEIGHT });
    case "note":
      return sizeSemanticNode({ ...base, minWidth: 140, maxWidth: 320, minHeight: 64 });
    default: {
      let fit = sizeSemanticNode({ ...base, minWidth: 168, maxWidth: 280, minHeight: 78 });
      for (let width = 360; !fit.fits && width <= 520; width += 80) fit = sizeSemanticNode({ ...base, minWidth: 168, maxWidth: width, minHeight: 78 });
      return fit;
    }
  }
};

/**
 * Geometry for a diagram before any of it is drawn: a size per role that fits its text, one shared cell and gap,
 * a grid of positions, and whether the result can be seen and read in the current view. The agent chooses what
 * is in the diagram and how it flows; this is the arithmetic it should not have to guess.
 */
export const planLayout = (
  input: { nodes: readonly PlanNode[]; direction?: "down" | "right"; lanes?: number },
  origin: { x: number; y: number },
  view: ViewportInfo | null,
): LayoutPlan => {
  const direction = input.direction ?? "down";
  const kinds = input.nodes.map((node) => node.kind ?? "process");
  const measured = input.nodes.map((node, i) => sizeOf(kinds[i], node.label));

  // One size per kind: the largest any node of that kind needs, so equal roles look equal.
  const sizes: LayoutPlan["sizes"] = {};
  measured.forEach((size, i) => {
    const current = sizes[kinds[i]];
    sizes[kinds[i]] = { width: Math.max(current?.width ?? 0, Math.round(size.width)), height: Math.max(current?.height ?? 0, Math.round(size.height)) };
  });
  const boxes = kinds.map((kind) => sizes[kind]!);
  const cell = { width: Math.max(...boxes.map((b) => b.width)), height: Math.max(...boxes.map((b) => b.height)) };

  const n = input.nodes.length;
  const canvas = view ?? DEFAULT_VIEW;
  const frame = (lanes: number, rankGap: number, laneGap: number) => {
    const ranks = Math.ceil(n / lanes);
    const across = lanes * (direction === "down" ? cell.width : cell.height) + (lanes - 1) * laneGap;
    const along = ranks * (direction === "down" ? cell.height : cell.width) + (ranks - 1) * rankGap;
    return { ranks, width: direction === "down" ? across : along, height: direction === "down" ? along : across };
  };
  const zoomFor = (width: number, height: number) => fitZoomFor({ minX: 0, minY: 0, maxX: width, maxY: height }, canvas);

  const notes: string[] = [];
  let rankGap = RANK_GAP;
  let laneGap = LANE_GAP;
  let lanes = Math.min(MAX_LANES, Math.max(1, input.lanes ?? 0), n);
  if (!input.lanes) {
    // Fewest lanes that are within 10% of the best fit: a chain stays a chain unless it would shrink to nothing.
    const options = Array.from({ length: Math.min(MAX_LANES, n) }, (_, i) => {
      const f = frame(i + 1, rankGap, laneGap);
      return { lanes: i + 1, zoom: zoomFor(f.width, f.height) };
    });
    const best = Math.max(...options.map((o) => o.zoom));
    lanes = options.find((o) => o.zoom >= best * 0.9)!.lanes;
    if (lanes > 1) notes.push(`Folded into ${lanes} parallel lanes so the diagram stays readable in one view.`);
  }
  let shape = frame(lanes, rankGap, laneGap);
  if (zoomFor(shape.width, shape.height) < 0.6) {
    rankGap = TIGHT_RANK_GAP;
    laneGap = TIGHT_LANE_GAP;
    shape = frame(lanes, rankGap, laneGap);
    notes.push("Gaps tightened to the minimum that still leaves room for arrowheads and labels.");
  }

  const slots: PlannedSlot[] = input.nodes.map((_, i) => {
    const rank = Math.floor(i / lanes);
    const lane = i % lanes;
    const cellX = direction === "down" ? lane * (cell.width + laneGap) : rank * (cell.width + rankGap);
    const cellY = direction === "down" ? rank * (cell.height + rankGap) : lane * (cell.height + laneGap);
    const box = boxes[i];
    return { index: i, x: Math.round(origin.x + cellX + (cell.width - box.width) / 2), y: Math.round(origin.y + cellY + (cell.height - box.height) / 2), width: box.width, height: box.height };
  });

  const fitZoom = zoomFor(shape.width, shape.height);
  const smallestFont = kinds.includes("icon") ? 14 : FONT;
  const smallestTextPx = Math.round(smallestFont * fitZoom * 10) / 10;
  const fitsAt100 = shape.width + VIEW_PADDING * 2 <= canvas.width - (canvas.coveredRight ?? 0) && shape.height + VIEW_PADDING * 2 <= canvas.height;
  const readable = smallestTextPx >= MIN_READABLE_PX;
  if (!readable) notes.push(`At the zoom that fits everything (${Math.round(fitZoom * 100)}%) the text is about ${smallestTextPx}px: split the diagram into titled frames or fewer nodes per view.`);
  else if (!fitsAt100) notes.push(`It does not fit at 100% but stays readable at ${Math.round(fitZoom * 100)}%; the view will be fitted after you draw it.`);

  return {
    direction,
    lanes,
    ranks: shape.ranks,
    sizes,
    gaps: { rank: rankGap, lane: laneGap },
    slots,
    bounds: { width: Math.round(shape.width), height: Math.round(shape.height) },
    view: { fitsAt100, fitZoom: Math.round(fitZoom * 100) / 100, smallestTextPx, readable },
    notes,
  };
};
