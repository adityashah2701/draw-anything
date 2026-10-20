import type { AnchorSide } from "@/features/whiteboard/types/whiteboard.types";
import { KAPPA, type OutlinePath } from "@/core/shapes/outline/path";

/**
 * The outline variants: the one place that knows which outline shapes exist. The renderer, hit-testing,
 * anchors, resize, the picker, the language (`shape:` values, diagnostics, round trip), the AI compiler and
 * the agent all read this table. A new outline is one more entry in `OUTLINE_VARIANTS`.
 *
 * Every geometry function takes the shape's size in world units and answers in world units measured from
 * its top-left corner, so a variant never knows about zoom, pan or rotation.
 */

export interface OutlineRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutlineVariant {
  /** Stored in `variant` and written as `shape: <id>` in diagram code. Lower-case, no spaces. */
  id: string;
  label: string;
  /** One line for the picker tooltip, the language docs and the agent. */
  description: string;
  defaultSize: { width: number; height: number };
  /** The closed outline: filled, stroked, hit-tested and exported. */
  path: (width: number, height: number) => OutlinePath;
  /** Extra strokes drawn over the outline and never filled (the cylinder's front rim). */
  details?: (width: number, height: number) => OutlinePath;
  /** Where the label may sit. */
  textRegion: (width: number, height: number) => OutlineRect;
  /** Connector points per side; a side not listed sits at the middle of the bounding box's edge. */
  anchors?: (width: number, height: number) => Partial<Record<AnchorSide, { x: number; y: number }>>;
}

const MIN_TEXT = 8;
const rect = (x: number, y: number, width: number, height: number): OutlineRect => ({
  x,
  y,
  width: Math.max(MIN_TEXT, width),
  height: Math.max(MIN_TEXT, height),
});

/** Polygon through the given points, closed. */
const polygon = (points: ReadonlyArray<readonly [number, number]>): OutlinePath => [
  ["M", points[0][0], points[0][1]],
  ...points.slice(1).map(([x, y]) => ["L", x, y] as const),
  ["Z"],
];

/** Height of a cylinder's rim ellipse (half of it is above the lid line). */
const cylinderRim = (w: number, h: number) => Math.min(h * 0.2, w * 0.25);

const cylinder: OutlineVariant = {
  id: "cylinder",
  label: "Cylinder",
  description: "A can: databases and storage.",
  defaultSize: { width: 120, height: 150 },
  path: (w, h) => {
    const e = cylinderRim(w, h);
    const hw = w / 2;
    return [
      ["M", 0, e],
      ["C", 0, e - KAPPA * e, hw - KAPPA * hw, 0, hw, 0],
      ["C", hw + KAPPA * hw, 0, w, e - KAPPA * e, w, e],
      ["L", w, h - e],
      ["C", w, h - e + KAPPA * e, hw + KAPPA * hw, h, hw, h],
      ["C", hw - KAPPA * hw, h, 0, h - e + KAPPA * e, 0, h - e],
      ["Z"],
    ];
  },
  details: (w, h) => {
    const e = cylinderRim(w, h);
    const hw = w / 2;
    return [
      ["M", 0, e],
      ["C", 0, e + KAPPA * e, hw - KAPPA * hw, 2 * e, hw, 2 * e],
      ["C", hw + KAPPA * hw, 2 * e, w, e + KAPPA * e, w, e],
    ];
  },
  textRegion: (w, h) => {
    const e = cylinderRim(w, h);
    return rect(w * 0.08, 2 * e, w * 0.84, h - 3 * e);
  },
};

const CLOUD_UNIT: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0.05, 0.85, 0.0, 0.62, 0.13, 0.52],
  [0.05, 0.38, 0.18, 0.18, 0.33, 0.25],
  [0.38, 0.05, 0.62, 0.03, 0.7, 0.2],
  [0.85, 0.12, 1.0, 0.3, 0.9, 0.47],
  [1.0, 0.62, 0.92, 0.85, 0.78, 0.82],
  [0.74, 0.95, 0.5, 1.0, 0.42, 0.88],
  [0.35, 0.97, 0.22, 0.95, 0.2, 0.85],
];

const cloud: OutlineVariant = {
  id: "cloud",
  label: "Cloud",
  description: "A cloud: the internet, a provider or anything outside your control.",
  defaultSize: { width: 160, height: 100 },
  path: (w, h) => [
    ["M", 0.2 * w, 0.85 * h],
    ...CLOUD_UNIT.map(([a, b, c, d, x, y]) => ["C", a * w, b * h, c * w, d * h, x * w, y * h] as const),
    ["Z"],
  ],
  textRegion: (w, h) => rect(w * 0.16, h * 0.3, w * 0.68, h * 0.5),
  // The outline's own points: the top bump's crest, the vertices where the side bumps meet.
  anchors: (w, h) => ({ top: { x: w * 0.5, y: h * 0.1075 }, right: { x: w * 0.9, y: h * 0.47 }, bottom: { x: w * 0.42, y: h * 0.88 }, left: { x: w * 0.13, y: h * 0.52 } }),
};

const documentWave = (h: number) => Math.min(h * 0.12, 18);

const document: OutlineVariant = {
  id: "document",
  label: "Document",
  description: "A page with a wavy bottom edge: files, reports and artifacts.",
  defaultSize: { width: 130, height: 100 },
  path: (w, h) => {
    const a = documentWave(h);
    return [
      ["M", 0, 0],
      ["L", w, 0],
      ["L", w, h - a],
      ["C", w * 0.82, h - 2 * a, w * 0.66, h - 2 * a, w * 0.5, h - a],
      ["C", w * 0.34, h, w * 0.16, h, 0, h - a],
      ["Z"],
    ];
  },
  textRegion: (w, h) => rect(w * 0.06, h * 0.08, w * 0.88, h - documentWave(h) * 2.4 - h * 0.08),
  anchors: (w, h) => ({ bottom: { x: w * 0.5, y: h - documentWave(h) } }),
};

const hexagonInset = (w: number, h: number) => Math.min(w * 0.25, h * 0.5);

const hexagon: OutlineVariant = {
  id: "hexagon",
  label: "Hexagon",
  description: "A hexagon: preparation steps, services and modules.",
  defaultSize: { width: 140, height: 100 },
  path: (w, h) => {
    const i = hexagonInset(w, h);
    return polygon([[i, 0], [w - i, 0], [w, h / 2], [w - i, h], [i, h], [0, h / 2]]);
  },
  textRegion: (w, h) => rect(hexagonInset(w, h) * 0.8, h * 0.1, w - hexagonInset(w, h) * 1.6, h * 0.8),
};

const skew = (w: number, h: number) => Math.min(w * 0.22, h * 0.6);

const parallelogram: OutlineVariant = {
  id: "parallelogram",
  label: "Parallelogram",
  description: "A slanted box: input and output in flowcharts.",
  defaultSize: { width: 150, height: 90 },
  path: (w, h) => {
    const s = skew(w, h);
    return polygon([[s, 0], [w, 0], [w - s, h], [0, h]]);
  },
  textRegion: (w, h) => rect(skew(w, h) * 0.9, h * 0.08, w - skew(w, h) * 1.8, h * 0.84),
  anchors: (w, h) => {
    const s = skew(w, h);
    return {
      top: { x: (s + w) / 2, y: 0 },
      right: { x: w - s / 2, y: h / 2 },
      bottom: { x: (w - s) / 2, y: h },
      left: { x: s / 2, y: h / 2 },
    };
  },
};

export const OUTLINE_VARIANTS: readonly OutlineVariant[] = [cylinder, cloud, document, hexagon, parallelogram];

/** The plain rectangle an unknown variant degrades to. Not listed: nobody can pick it. */
const RECTANGLE_FALLBACK: OutlineVariant = {
  id: "rectangle",
  label: "Rectangle",
  description: "Fallback outline.",
  defaultSize: { width: 140, height: 90 },
  path: (w, h) => polygon([[0, 0], [w, 0], [w, h], [0, h]]),
  textRegion: (w, h) => rect(0, 0, w, h),
};

const BY_ID = new Map(OUTLINE_VARIANTS.map((variant) => [variant.id, variant]));

/** Ids of every outline variant, in picker order. */
export const outlineVariantIds = (): string[] => OUTLINE_VARIANTS.map((variant) => variant.id);

export const listOutlineVariants = (): readonly OutlineVariant[] => OUTLINE_VARIANTS;

export const isOutlineVariantId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

export const getOutlineVariant = (id: unknown): OutlineVariant | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);

/** The variant for `id`, or a plain rectangle outline when it is unknown (newer data, a typo). Never throws. */
export const resolveOutlineVariant = (id: unknown): OutlineVariant => {
  const known = getOutlineVariant(id);
  if (known) return known;
  warnUnknownVariant(id);
  return RECTANGLE_FALLBACK;
};

const warned = new Set<string>();
/** One console warning per unknown id, however often it is drawn. */
const warnUnknownVariant = (id: unknown) => {
  const key = String(id);
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`Unknown outline variant "${key}": drawing a plain rectangle outline instead.`);
};

/** Forget which unknown ids were already reported (tests). */
export const resetUnknownVariantWarnings = () => warned.clear();

/**
 * What the agent thread reads to discover outlines: plain data, no functions.
 */
export interface OutlineVariantInfo {
  id: string;
  label: string;
  description: string;
  defaultSize: { width: number; height: number };
}

export const describeOutlineVariants = (): OutlineVariantInfo[] =>
  OUTLINE_VARIANTS.map(({ id, label, description, defaultSize }) => ({ id, label, description, defaultSize: { ...defaultSize } }));

/** Tool name of the draw tool for a variant, and back. */
export const OUTLINE_TOOL_PREFIX = "outline:";
export const outlineToolName = (variantId: string) => `${OUTLINE_TOOL_PREFIX}${variantId}`;
export const outlineVariantOfTool = (tool: string): string | null => (tool.startsWith(OUTLINE_TOOL_PREFIX) ? tool.slice(OUTLINE_TOOL_PREFIX.length) : null);
