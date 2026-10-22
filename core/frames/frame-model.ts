import { estimateTextWidth } from "@/core/text/estimate";
import { CORNER_RADIUS } from "@/core/shapes/base/geometry-tokens";
import { makeBounds } from "@/core/geometry/box";
import type { Bounds, DrawingElement, FramePreset, FrameShape, FrameTitlePlacement } from "@/features/whiteboard/types/whiteboard.types";

/** Design defaults, in world units. An absent field on a stored frame means one of these. */
export const FRAME_DEFAULTS = {
  title: "Frame",
  padding: 24,
  /** Height of the title band of an `inside` header. */
  headerHeight: 32,
  /** Height of the title tab of an `above` header. */
  tabHeight: 24,
  cornerRadius: CORNER_RADIUS.frame,
  minWidth: 80,
  minHeight: 60,
  strokeWidth: 1,
} as const;

/** Deepest nesting of frames the engine honours; a deeper link is read as top level. */
export const MAX_FRAME_DEPTH = 8;
export const MAX_FRAME_TITLE_LENGTH = 200;
const MAX_PADDING = 400;
const MAX_RADIUS = 200;
const MAX_MIN_SIZE = 10_000;
/** Horizontal room around the title text inside an `above` tab. */
const TAB_PADDING_X = 10;
const TAB_FONT_SIZE = 13;

export const isFrameShape = (value: unknown): value is FrameShape =>
  typeof value === "object" && value !== null && (value as { type?: unknown }).type === "frame" && typeof (value as { id?: unknown }).id === "string";

export const isFrameElement = (element: DrawingElement): element is FrameShape => element.type === "frame";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamped = (value: unknown, min: number, max: number, fallback: number) => (finite(value) ? Math.min(max, Math.max(min, value)) : fallback);

const PLACEMENTS: readonly FrameTitlePlacement[] = ["inside", "above"];
export const FRAME_PRESETS: readonly FramePreset[] = ["section", "container", "feature-group", "swimlane", "device"];

/** A frame with every field concrete: the migration defaults applied and out-of-range values clamped. Never written back. */
export interface ResolvedFrame {
  title: string;
  padding: number;
  cornerRadius: number;
  titlePlacement: FrameTitlePlacement;
  headerVisible: boolean;
  autoFit: boolean;
  minWidth: number;
  minHeight: number;
  preset: FramePreset | undefined;
  opacity: number;
}

/**
 * Reads a stored frame as the engine sees it. Total: boards written by an older build (no optional
 * field at all) and hand-edited or corrupt values both give a usable frame.
 */
export const resolveFrame = (frame: FrameShape): ResolvedFrame => {
  const title = typeof frame.title === "string" && frame.title.trim() ? frame.title.trim().slice(0, MAX_FRAME_TITLE_LENGTH) : FRAME_DEFAULTS.title;
  return {
    title,
    padding: clamped(frame.padding, 0, MAX_PADDING, FRAME_DEFAULTS.padding),
    cornerRadius: clamped(frame.cornerRadius, 0, MAX_RADIUS, FRAME_DEFAULTS.cornerRadius),
    titlePlacement: PLACEMENTS.includes(frame.titlePlacement as FrameTitlePlacement) ? (frame.titlePlacement as FrameTitlePlacement) : "inside",
    headerVisible: frame.headerVisible !== false,
    autoFit: frame.autoFit === true,
    minWidth: clamped(frame.minWidth, 1, MAX_MIN_SIZE, FRAME_DEFAULTS.minWidth),
    minHeight: clamped(frame.minHeight, 1, MAX_MIN_SIZE, FRAME_DEFAULTS.minHeight),
    preset: FRAME_PRESETS.includes(frame.preset as FramePreset) ? frame.preset : undefined,
    opacity: clamped(frame.opacity, 0, 1, 1),
  };
};

/** The frame's box (its two corners, normalised), or null when the points are not two finite points. */
export const frameBox = (frame: FrameShape): Bounds | null => {
  const [a, b] = frame.points ?? [];
  if (!a || !b || !finite(a.x) || !finite(a.y) || !finite(b.x) || !finite(b.y)) return null;
  return makeBounds(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
};

export interface FrameRegions {
  /** The frame's box: what selection, snapping and resizing see. */
  box: Bounds;
  /** Where the title sits; null when the header is hidden. For an `above` header this lies outside `box`. */
  header: Bounds | null;
  /** Where contents belong: `box` below an inside header, or all of `box`. */
  content: Bounds;
}

/** Header and content regions of a frame; null when the frame has no valid box. */
export const frameRegions = (frame: FrameShape): FrameRegions | null => {
  const box = frameBox(frame);
  if (!box) return null;
  const resolved = resolveFrame(frame);
  if (!resolved.headerVisible) return { box, header: null, content: box };
  if (resolved.titlePlacement === "inside") {
    const bandBottom = Math.min(box.maxY, box.minY + FRAME_DEFAULTS.headerHeight);
    return { box, header: makeBounds(box.minX, box.minY, box.maxX, bandBottom), content: makeBounds(box.minX, bandBottom, box.maxX, box.maxY) };
  }
  const tabWidth = Math.min(box.width, Math.ceil(estimateTextWidth(resolved.title, TAB_FONT_SIZE, "600")) + TAB_PADDING_X * 2);
  return { box, header: makeBounds(box.minX, box.minY - FRAME_DEFAULTS.tabHeight, box.minX + tabWidth, box.minY), content: box };
};

/** Height the header takes from the box: what a fit must add above the contents. */
export const headerAllowance = (frame: FrameShape): number => {
  const resolved = resolveFrame(frame);
  return resolved.headerVisible && resolved.titlePlacement === "inside" ? FRAME_DEFAULTS.headerHeight : 0;
};

/** True when the frame can be used: a finite box with positive area. */
export const hasValidBox = (frame: FrameShape): boolean => {
  const box = frameBox(frame);
  return box !== null && box.width > 0 && box.height > 0;
};

/** `box` grown to at least the frame's minimum size, keeping its top-left corner. */
export const enforceMinimumSize = (frame: FrameShape, box: Bounds): Bounds => {
  const { minWidth, minHeight } = resolveFrame(frame);
  return makeBounds(box.minX, box.minY, box.minX + Math.max(box.width, minWidth), box.minY + Math.max(box.height, minHeight));
};

export const withBox = <T extends FrameShape>(frame: T, box: Bounds): T => ({
  ...frame,
  points: [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.maxY },
  ],
});
