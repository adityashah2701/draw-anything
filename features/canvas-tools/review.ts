import { unionBounds } from "@/core/geometry/box";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { createEstimateContext } from "@/core/text/estimate";
import { layoutShapeLabel } from "@/core/text/label-layout";
import { getShapeLabelRegion } from "@/core/text/label-region";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { isLayoutNode } from "@/features/whiteboard/commands/layout";
import { fitView } from "@/features/whiteboard/utils/viewport-math";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { ViewportInfo } from "./types";
import { validateBoard } from "./validate";

/** Text smaller than this on screen is hard to read; a diagram that needs it to fit is too big for one view. */
export const MIN_READABLE_PX = 11;
/** Reviews of one run after which the loop stops: whatever is left is reported, not chased. */
export const MAX_REVIEWS = 3;

/** The part of the board the person can see, in board units. The agent panel covers `coveredRight` px of the canvas. */
export interface VisibleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const visibleRect = (view: ViewportInfo): VisibleRect => ({
  x: -view.pan.x / view.zoom,
  y: -view.pan.y / view.zoom,
  width: Math.max(0, view.width - (view.coveredRight ?? 0)) / view.zoom,
  height: view.height / view.zoom,
});

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Whether `box` lies inside the visible part of the canvas, with `margin` screen px to spare. */
export const isVisible = (box: Box, view: ViewportInfo, margin = 8): boolean => {
  const v = visibleRect(view);
  const m = margin / view.zoom;
  return box.minX >= v.x + m && box.minY >= v.y + m && box.maxX <= v.x + v.width - m && box.maxY <= v.y + v.height - m;
};

/** The zoom the editor's fit-to-view would pick for `box` here (never above 100%). */
export const fitZoomFor = (box: Box, view: ViewportInfo): number => fitView(box, { width: view.width, height: view.height }, { rightInset: view.coveredRight ?? 0 })?.zoom ?? view.zoom;

export type ReviewCode = "label_clipped" | "label_shrunk" | "inconsistent_size" | "connector_crossing" | "off_screen" | "too_small_to_read" | "needs_structure" | ReviewValidateCode;
type ReviewValidateCode = "overlap" | "connector_through_node" | "connector_through_frame" | "connector_through_heading" | "stale_connector" | "dangling_connector" | "misaligned_connection" | "uneven_spacing" | "free_connector_end";

export interface Finding {
  code: ReviewCode;
  severity: "error" | "warning" | "info";
  message: string;
  ids: string[];
  /** The narrowest tool call that addresses it. */
  fix: string;
}

export interface LayoutReview {
  /** `good` when nothing above `info` is left. */
  verdict: "good" | "needs_work";
  counts: { nodes: number; connectors: number; frames: number };
  bounds: { x: number; y: number; width: number; height: number } | null;
  view?: {
    zoom: number;
    visible: { x: number; y: number; width: number; height: number };
    allVisible: boolean;
    /** The zoom at which everything fits, and how large the smallest text then is on screen. */
    fitZoom: number;
    smallestTextPx: number;
  };
  findings: Finding[];
}

const round = (n: number) => Math.round(n);

/** Findings the board validator already computes that matter for how a diagram looks, with the repair for each. */
const FROM_VALIDATE: Record<ReviewValidateCode, { severity: Finding["severity"]; fix: string }> = {
  overlap: { severity: "warning", fix: "move_elements the overlapping shapes apart (or tidy_diagram on them)" },
  connector_through_node: { severity: "warning", fix: "reroute_connector, or update_connector {routing: \"orthogonal\"} if it is straight" },
  connector_through_frame: { severity: "warning", fix: "move the nodes, or reroute_connector" },
  connector_through_heading: { severity: "warning", fix: "fit_frame {frame, ids} moves a heading to a clear spot" },
  stale_connector: { severity: "warning", fix: "reroute_connector" },
  dangling_connector: { severity: "error", fix: "delete_connector, or connect it to an element" },
  misaligned_connection: { severity: "warning", fix: "tidy_diagram {ids}" },
  uneven_spacing: { severity: "warning", fix: "set_element_spacing or tidy_diagram {ids}" },
  free_connector_end: { severity: "info", fix: "connect_elements, or leave it if the end is meant to float" },
};

const labelFontOf = (shape: DrawingElement) => (typeof shape.fontSize === "number" ? shape.fontSize : 16);

/** Where a shape's label may sit and how many lines it gets: the same region the renderer uses. */
const regionOf = (shape: DrawingElement, b: NonNullable<ReturnType<CommandContext["getBounds"]>>) => getShapeLabelRegion(shape.type, b, (shape as { nodeStyle?: unknown }).nodeStyle);

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Proper crossing of two segments: they intersect at a point interior to both. */
const crosses = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

const pathsCross = (a: readonly Point[], b: readonly Point[]) => {
  for (let i = 0; i + 1 < a.length; i += 1) for (let j = 0; j + 1 < b.length; j += 1) if (crosses(a[i], a[i + 1], b[j], b[j + 1])) return true;
  return false;
};

const MAX_CROSSING_CHECK = 150;

/**
 * Looks at the board the way a careful reviewer would, from geometry alone: nothing here reads pixels, and
 * the result says so. Everything it names is found by measuring the stored elements with the editor's own
 * text layout, so a "clipped label" is one the renderer would really shrink or cut.
 */
export const reviewLayout = (ctx: CommandContext, view: ViewportInfo | null): LayoutReview => {
  const findings: Finding[] = [];
  const shapes = ctx.shapes.filter((shape) => !shape.isGuide && !isHiddenByFlag(ctx.index, shape.id));
  const connectors = shapes.filter(isArrowElement);
  const nodes = shapes.filter((shape) => isLayoutNode(shape));
  const frames = shapes.filter((shape) => shape.type === "frame");

  const content = unionBounds(shapes.flatMap((shape) => ctx.getBounds(shape) ?? []));
  const measure = createEstimateContext();

  // Labels the renderer would cut or shrink, and the smallest text the person will see.
  const clipped: string[] = [];
  const shrunk: string[] = [];
  let smallestFont = Infinity;
  for (const shape of nodes) {
    const b = ctx.getBounds(shape);
    const label = typeof shape.label === "string" ? shape.label : shape.type === "text" ? shape.text : undefined;
    if (!b) continue;
    smallestFont = Math.min(smallestFont, labelFontOf(shape));
    if (!label || shape.type === "text") continue;
    const region = regionOf(shape, b);
    const layout = layoutShapeLabel(measure, { label, boxWidth: region.width, boxHeight: region.height, fontSize: shape.fontSize, fontWeight: shape.fontWeight, maxLines: region.maxLines });
    if (!layout || !layout.fits || layout.brokenWord) clipped.push(shape.id);
    else if (layout.fontSize < labelFontOf(shape)) {
      shrunk.push(shape.id);
      smallestFont = Math.min(smallestFont, layout.fontSize);
    }
  }
  for (const shape of shapes) if (shape.type === "text" && ctx.getBounds(shape)) smallestFont = Math.min(smallestFont, labelFontOf(shape));
  if (clipped.length > 0) findings.push({ code: "label_clipped", severity: "warning", message: "These labels do not fit their shape even at the smallest text size, so words are cut or broken.", ids: clipped.slice(0, 30), fix: "resize_element wider/taller (plan_layout gives text-fitting sizes), or shorten the label" });
  if (shrunk.length > 0) findings.push({ code: "label_shrunk", severity: "info", message: "These labels are drawn smaller than their font size to fit, which makes text uneven across the diagram.", ids: shrunk.slice(0, 30), fix: "resize_element so the label fits at its own size" });

  // One kind of node should come in few sizes: nodes of the same shape that differ widely look accidental.
  const bySize = new Map<string, DrawingElement[]>();
  for (const shape of nodes) {
    if (shape.type === "text" || shape.type === "icon" || shape.type === "frame") continue;
    const list = bySize.get(shape.type) ?? [];
    list.push(shape);
    bySize.set(shape.type, list);
  }
  const uneven: string[] = [];
  for (const list of bySize.values()) {
    if (list.length < 3) continue;
    const widths = list.map((shape) => ctx.getBounds(shape)?.width ?? 0).sort((a, c) => a - c);
    const heights = list.map((shape) => ctx.getBounds(shape)?.height ?? 0).sort((a, c) => a - c);
    const spread = (values: number[]) => (values[values.length - 1] - values[0]) / Math.max(1, values[Math.floor(values.length / 2)]);
    const distinct = new Set(widths.map((w) => Math.round(w / 8))).size;
    if (distinct > 3 && (spread(widths) > 0.4 || spread(heights) > 0.4)) {
      const medianW = widths[Math.floor(widths.length / 2)];
      uneven.push(...list.filter((shape) => Math.abs((ctx.getBounds(shape)?.width ?? 0) - medianW) / medianW > 0.3).map((shape) => shape.id));
    }
  }
  if (uneven.length > 0) findings.push({ code: "inconsistent_size", severity: "info", message: "Shapes of the same kind differ a lot in size (more than three widths), which reads as accidental.", ids: uneven.slice(0, 30), fix: "resize_element to the size of the others, or one size per role" });

  // Connectors crossing each other (ones that meet at a shared node do not count).
  if (connectors.length >= 2 && connectors.length <= MAX_CROSSING_CHECK) {
    const crossing = new Set<string>();
    for (let i = 0; i < connectors.length; i += 1) {
      for (let j = i + 1; j < connectors.length; j += 1) {
        const a = connectors[i];
        const c = connectors[j];
        const shares = [a.startConnection?.elementId, a.endConnection?.elementId].some((id) => id && (id === c.startConnection?.elementId || id === c.endConnection?.elementId));
        if (shares || !pathsCross(a.points, c.points)) continue;
        crossing.add(a.id);
        crossing.add(c.id);
      }
    }
    if (crossing.size > 0) findings.push({ code: "connector_crossing", severity: crossing.size > 6 ? "warning" : "info", message: `${crossing.size} connectors cross each other; fewer crossings read better.`, ids: [...crossing].slice(0, 30), fix: "move_elements to reorder nodes so links do not cross, or choose another route with update_connector" });
  }

  // Problems the board validator measures, in the form this review reports.
  for (const issue of validateBoard(ctx)) {
    const mapped = FROM_VALIDATE[issue.code as ReviewValidateCode];
    if (mapped) findings.push({ code: issue.code as ReviewValidateCode, severity: mapped.severity, message: issue.message, ids: issue.ids.slice(0, 30), fix: mapped.fix });
  }

  if (nodes.length >= 9 && frames.length === 0 && nodes.length > 4) {
    findings.push({ code: "needs_structure", severity: "info", message: `${nodes.length} parts and no frames: related parts read better in titled sections.`, ids: [], fix: "create_frame_or_section {title, ids} around each cluster" });
  }

  let viewInfo: LayoutReview["view"];
  if (view && view.zoom > 0 && content) {
    const visible = visibleRect(view);
    const allVisible = isVisible(content, view, 0);
    const fitZoom = fitZoomFor(content, view);
    const smallest = Number.isFinite(smallestFont) ? smallestFont : 16;
    const smallestTextPx = Math.round(smallest * fitZoom * 10) / 10;
    viewInfo = { zoom: Math.round(view.zoom * 100) / 100, visible: { x: round(visible.x), y: round(visible.y), width: round(visible.width), height: round(visible.height) }, allVisible, fitZoom: Math.round(fitZoom * 100) / 100, smallestTextPx };
    if (!allVisible) findings.push({ code: "off_screen", severity: "info", message: "Part of the diagram is outside the visible canvas.", ids: [], fix: "zoom_to_fit" });
    if (smallestTextPx < MIN_READABLE_PX) findings.push({ code: "too_small_to_read", severity: "warning", message: `To see everything at once the view has to zoom to ${round(fitZoom * 100)}%, where the smallest text is about ${smallestTextPx}px. The diagram is too spread out or too large for one view.`, ids: [], fix: "tighten gaps with set_element_spacing, fold a long chain into rows (apply_layout_preset), or split it into titled frames the person can zoom between" });
  }

  const verdict = findings.some((finding) => finding.severity !== "info") ? "needs_work" : "good";
  return {
    verdict,
    counts: { nodes: nodes.length, connectors: connectors.length, frames: frames.length },
    bounds: content ? { x: round(content.minX), y: round(content.minY), width: round(content.width), height: round(content.height) } : null,
    ...(viewInfo ? { view: viewInfo } : {}),
    findings,
  };
};
