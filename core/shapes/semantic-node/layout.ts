import { CORNER_RADIUS } from "@/core/shapes/base/geometry-tokens";
import { LABEL_PADDING } from "@/core/text/label-layout";
import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import { normalizeNodeStyle } from "./style";

/*
 * The single source of truth for where things sit inside a semantic node. The canvas renderer, the
 * inline label editor, the AI node sizing and the hit-test for "double-click the icon" all read this,
 * so they cannot drift apart. Pure and total: any size and any stored style gives a usable layout.
 *
 * All lengths are world units (they scale with zoom, so a node looks the same at every zoom).
 *
 *   left      +-----------------------------+      top     +---------------+
 *             |  [icon]  Label text,        |              |    [icon]     |
 *             |          wraps here         |              |  Label text   |
 *             +-----------------------------+              +---------------+
 *
 * One rhythm: 12 around the content (the same unit the label layout pads by), 10 between icon and
 * text (6 when stacked). The icon is vertically centred beside the text, the text is left-aligned
 * next to it, so a column of nodes lines its icons and labels up. With no icon the label is centred.
 */

/** Space between the border and the content, and the label layout's own padding. */
export const SEMANTIC_PADDING = LABEL_PADDING;
export const SEMANTIC_ICON_GAP = 10;
export const SEMANTIC_STACK_GAP = 6;
/** Largest icon the layout picks by itself; the user can choose bigger in the panel. */
export const SEMANTIC_AUTO_ICON_MAX = 40;
/** An icon that would be drawn smaller than this is dropped instead (a speck says nothing). */
export const SEMANTIC_MIN_ICON = 16;
/** The icon yields space until the text box is at least this wide; below that it is dropped. */
export const SEMANTIC_MIN_TEXT_WIDTH = 48;
/** Room kept for one line of text under a stacked icon. */
const STACK_MIN_TEXT_HEIGHT = 20;
/** A node narrower than this (and tall enough) stacks its icon above the label unless told otherwise. */
export const SEMANTIC_STACK_BELOW_WIDTH = 120;
export const SEMANTIC_STACK_MIN_HEIGHT = 72;
/** Lines a semantic node may show; node sizing grows the height to fit them (see node-size.ts). */
export const SEMANTIC_MAX_LINES = 4;
/** The corner radius token (core/shapes/base/geometry-tokens.ts); a node's own `cornerRadius` overrides it. */
export const SEMANTIC_DEFAULT_RADIUS = CORNER_RADIUS.semanticNode;

/**
 * Width a default node spends on everything but its text box: the largest automatic icon and its gap.
 * `sizeSemanticNode` (the AI compiler) uses it, and it is exact for any node at least 64 tall, which
 * is every node the compiler makes.
 */
export const SEMANTIC_INSET_WIDTH = SEMANTIC_AUTO_ICON_MAX + SEMANTIC_ICON_GAP;

export interface SemanticBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export type ResolvedPlacement = "left" | "right" | "top" | "none";

export interface SemanticLayout {
  /** Where the icon ended up; "none" when it is hidden or the node is too small to show it. */
  placement: ResolvedPlacement;
  icon: { cx: number; cy: number; size: number } | null;
  /** Where label text is drawn. */
  text: { x: number; y: number; width: number; height: number };
  align: "left" | "center";
  /**
   * The text box grown by the label layout's own padding: the box `layoutShapeLabel` and the inline
   * editor are given (they subtract the padding again, landing exactly on `text`).
   */
  region: { centerX: number; centerY: number; width: number; height: number; maxLines: number; align: "left" | "center" };
  /** Corner radius, already limited to what the box allows. */
  radius: number;
}

const positive = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export const layoutSemanticNode = (box: SemanticBox, styleInput?: unknown): SemanticLayout => {
  const style = normalizeNodeStyle(styleInput);
  const width = positive(box.width);
  const height = positive(box.height);
  const minX = Number.isFinite(box.minX) ? box.minX : 0;
  const minY = Number.isFinite(box.minY) ? box.minY : 0;
  const pad = SEMANTIC_PADDING;
  const innerW = Math.max(0, width - 2 * pad);
  const innerH = Math.max(0, height - 2 * pad);
  const radius = Math.min(style.cornerRadius ?? SEMANTIC_DEFAULT_RADIUS, width / 2, height / 2);

  type Plan = { placement: Exclude<ResolvedPlacement, "none">; size: number };
  const plans: Plan[] = [];
  if (!style.iconHidden) {
    const wanted = style.iconPlacement ?? (width < SEMANTIC_STACK_BELOW_WIDTH && height >= SEMANTIC_STACK_MIN_HEIGHT ? "top" : "left");
    const sideBySide = (placement: "left" | "right"): Plan => ({
      placement,
      size: Math.min(style.iconSize ?? SEMANTIC_AUTO_ICON_MAX, innerH, innerW - SEMANTIC_ICON_GAP - SEMANTIC_MIN_TEXT_WIDTH),
    });
    const stacked = (): Plan => ({
      placement: "top",
      size: Math.min(style.iconSize ?? SEMANTIC_AUTO_ICON_MAX, innerW, innerH - SEMANTIC_STACK_GAP - STACK_MIN_TEXT_HEIGHT),
    });
    if (wanted === "top") plans.push(stacked(), sideBySide("left"));
    else plans.push(sideBySide(wanted));
  }
  const plan = plans.find((candidate) => candidate.size >= SEMANTIC_MIN_ICON);

  let placement: ResolvedPlacement = "none";
  let icon: SemanticLayout["icon"] = null;
  let text = { x: minX + pad, y: minY + pad, width: innerW, height: innerH };
  if (plan) {
    const size = plan.size;
    placement = plan.placement;
    if (plan.placement === "left") {
      icon = { cx: minX + pad + size / 2, cy: minY + height / 2, size };
      const x = minX + pad + size + SEMANTIC_ICON_GAP;
      text = { x, y: minY + pad, width: Math.max(0, minX + width - pad - x), height: innerH };
    } else if (plan.placement === "right") {
      icon = { cx: minX + width - pad - size / 2, cy: minY + height / 2, size };
      text = { x: minX + pad, y: minY + pad, width: Math.max(0, innerW - size - SEMANTIC_ICON_GAP), height: innerH };
    } else {
      icon = { cx: minX + width / 2, cy: minY + pad + size / 2, size };
      const y = minY + pad + size + SEMANTIC_STACK_GAP;
      text = { x: minX + pad, y, width: innerW, height: Math.max(0, minY + height - pad - y) };
    }
  }

  // Text sits beside a side icon (left-aligned, so a column of nodes lines up) and is centred otherwise.
  const align = placement === "left" || placement === "right" ? "left" : "center";
  return {
    placement,
    icon,
    text,
    align,
    region: {
      centerX: text.x + text.width / 2,
      centerY: text.y + text.height / 2,
      width: text.width + 2 * LABEL_PADDING,
      height: text.height + 2 * LABEL_PADDING,
      maxLines: SEMANTIC_MAX_LINES,
      align,
    },
    radius,
  };
};

/**
 * Smallest box a user can resize a node to. It follows what the node shows: a node with an icon needs
 * room for icon + a few characters, a stacked one needs height, a node without an icon can be small.
 * A node already smaller than this (older boards) still lays out; the limit only applies to resizing.
 */
export const semanticMinSize = (styleInput?: unknown): { width: number; height: number } => {
  const style = normalizeNodeStyle(styleInput);
  if (style.iconHidden) return { width: 72, height: 40 };
  if (style.iconPlacement === "top") return { width: 88, height: 80 };
  return { width: 112, height: 56 };
};

/** What a double-click on the node means: on the icon it replaces the icon, anywhere else it edits the label. */
export type SemanticZone = "icon" | "label";

const ICON_HIT_SLOP = 4;

/** `point` is in the node's own (unrotated) frame, world units. */
export const semanticZoneAt = (box: SemanticBox, styleInput: unknown, point: Point): SemanticZone => {
  const layout = layoutSemanticNode(box, styleInput);
  const { icon } = layout;
  if (icon) {
    const half = icon.size / 2 + ICON_HIT_SLOP;
    if (Math.abs(point.x - icon.cx) <= half && Math.abs(point.y - icon.cy) <= half) return "icon";
  }
  return "label";
};
