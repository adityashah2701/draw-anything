import type { AnchorSide } from "@/core/model";
import { KAPPA, type OutlinePath, type PathCommand } from "@/core/shapes/outline/path";

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
  /** A base shape only drawn through a vocabulary entry with border, marker or stack; not offered as a plain shape. */
  hidden?: boolean;
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

/** A flat-ended pill lying on its side: a cylinder rotated a quarter turn. */
const queueRim = (w: number, h: number) => Math.min(w * 0.2, h * 0.25);

const queue: OutlineVariant = {
  id: "queue",
  label: "Queue",
  description: "A can on its side: queues, streams and message channels.",
  defaultSize: { width: 160, height: 90 },
  path: (w, h) => {
    const e = queueRim(w, h);
    const hh = h / 2;
    return [
      ["M", e, 0],
      ["L", w - e, 0],
      ["C", w - e + KAPPA * e, 0, w, hh - KAPPA * hh, w, hh],
      ["C", w, hh + KAPPA * hh, w - e + KAPPA * e, h, w - e, h],
      ["L", e, h],
      ["C", e - KAPPA * e, h, 0, hh + KAPPA * hh, 0, hh],
      ["C", 0, hh - KAPPA * hh, e - KAPPA * e, 0, e, 0],
      ["Z"],
    ];
  },
  details: (w, h) => {
    const e = queueRim(w, h);
    const hh = h / 2;
    return [
      ["M", e, 0],
      ["C", e + KAPPA * e, 0, 2 * e, hh - KAPPA * hh, 2 * e, hh],
      ["C", 2 * e, hh + KAPPA * hh, e + KAPPA * e, h, e, h],
    ];
  },
  textRegion: (w, h) => rect(queueRim(w, h) * 2.2, h * 0.14, w - queueRim(w, h) * 3.4, h * 0.72),
};

const packageTab = (w: number, h: number) => ({ width: w * 0.4, height: Math.min(h * 0.18, 22) });

const packageOutline: OutlineVariant = {
  id: "package",
  label: "Package",
  description: "A folder with a tab: packages, namespaces and modules that hold other things.",
  defaultSize: { width: 150, height: 100 },
  path: (w, h) => {
    const tab = packageTab(w, h);
    return polygon([[0, 0], [tab.width, 0], [tab.width, tab.height], [w, tab.height], [w, h], [0, h]]);
  },
  textRegion: (w, h) => rect(w * 0.06, packageTab(w, h).height + h * 0.05, w * 0.88, h - packageTab(w, h).height - h * 0.1),
  anchors: (w, h) => ({ top: { x: w * 0.7, y: packageTab(w, h).height } }),
};

const componentTab = (w: number, h: number) => ({ depth: Math.min(w * 0.1, 14), height: Math.min(h * 0.16, 16) });

const component: OutlineVariant = {
  id: "component",
  label: "Component",
  description: "A box with two small tabs on its left edge: a UML component or module.",
  defaultSize: { width: 150, height: 100 },
  path: (w, h) => {
    const { depth: d, height: t } = componentTab(w, h);
    const a = h * 0.22;
    const b = h * 0.6;
    // The body starts at x = d; the two tabs poke out to the left across its edge.
    return polygon([[d, 0], [w, 0], [w, h], [d, h], [d, b + t], [0, b + t], [0, b], [d, b], [d, a + t], [0, a + t], [0, a], [d, a]]);
  },
  textRegion: (w, h) => rect(componentTab(w, h).depth + w * 0.05, h * 0.08, w - componentTab(w, h).depth - w * 0.1, h * 0.84),
  anchors: (w, h) => ({ left: { x: componentTab(w, h).depth, y: h / 2 } }),
};

const personShape = (w: number, h: number) => {
  const r = Math.min(w * 0.26, h * 0.26);
  const cx = w / 2;
  const cy = r + h * 0.03;
  const neck = r * 0.55;
  const neckY = cy + Math.sqrt(r * r - neck * neck);
  return { r, cx, cy, neck, neckY };
};

const person: OutlineVariant = {
  id: "person",
  label: "Person",
  description: "A head and shoulders: a user, an actor or a role.",
  defaultSize: { width: 80, height: 100 },
  path: (w, h) => {
    const { r, cx, cy, neck, neckY } = personShape(w, h);
    const a0 = Math.atan2(neckY - cy, -neck);
    const a1 = Math.atan2(neckY - cy, neck) + Math.PI * 2;
    const steps = 4;
    const arc: PathCommand[] = [];
    for (let i = 0; i < steps; i += 1) {
      const t0 = a0 + ((a1 - a0) * i) / steps;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
      const k = (4 / 3) * Math.tan((t1 - t0) / 4);
      arc.push([
        "C",
        cx + r * (Math.cos(t0) - k * Math.sin(t0)),
        cy + r * (Math.sin(t0) + k * Math.cos(t0)),
        cx + r * (Math.cos(t1) + k * Math.sin(t1)),
        cy + r * (Math.sin(t1) - k * Math.cos(t1)),
        cx + r * Math.cos(t1),
        cy + r * Math.sin(t1),
      ]);
    }
    return [
      ["M", w * 0.04, h],
      ["L", w * 0.04, h * 0.84],
      ["C", w * 0.04, h * 0.66, w * 0.24, h * 0.6, cx - neck, neckY + h * 0.03],
      ["L", cx - neck, neckY],
      ...arc,
      ["L", cx + neck, neckY + h * 0.03],
      ["C", w * 0.76, h * 0.6, w * 0.96, h * 0.66, w * 0.96, h * 0.84],
      ["L", w * 0.96, h],
      ["Z"],
    ];
  },
  textRegion: (w, h) => rect(w * 0.12, h * 0.66, w * 0.76, h * 0.3),
  anchors: (w, h) => ({
    top: { x: w / 2, y: personShape(w, h).cy - personShape(w, h).r },
    left: { x: w * 0.04, y: h * 0.92 },
    right: { x: w * 0.96, y: h * 0.92 },
  }),
};

const noteFold = (w: number, h: number) => Math.min(w * 0.22, h * 0.3, 28);

const note: OutlineVariant = {
  id: "note",
  label: "Note",
  description: "A page with a folded corner: notes, constraints and annotations.",
  defaultSize: { width: 140, height: 90 },
  path: (w, h) => {
    const f = noteFold(w, h);
    return polygon([[0, 0], [w - f, 0], [w, f], [w, h], [0, h]]);
  },
  details: (w, h) => {
    const f = noteFold(w, h);
    return [["M", w - f, 0], ["L", w - f, f], ["L", w, f]];
  },
  textRegion: (w, h) => rect(w * 0.06, noteFold(w, h) * 0.9, w * 0.88, h - noteFold(w, h) * 0.9 - h * 0.06),
};

const calloutBody = (h: number) => h * 0.8;
const calloutRadius = (w: number, h: number) => Math.min(w, h) * 0.14;

const callout: OutlineVariant = {
  id: "callout",
  label: "Callout",
  description: "A speech bubble: comments, quotes and ideas to point at.",
  defaultSize: { width: 150, height: 100 },
  path: (w, h) => {
    const r = calloutRadius(w, h);
    const b = calloutBody(h);
    const k = KAPPA * r;
    return [
      ["M", r, 0],
      ["L", w - r, 0],
      ["C", w - r + k, 0, w, r - k, w, r],
      ["L", w, b - r],
      ["C", w, b - r + k, w - r + k, b, w - r, b],
      ["L", w * 0.42, b],
      ["L", w * 0.2, h],
      ["L", w * 0.26, b],
      ["L", r, b],
      ["C", r - k, b, 0, b - r + k, 0, b - r],
      ["L", 0, r],
      ["C", 0, r - k, r - k, 0, r, 0],
      ["Z"],
    ];
  },
  textRegion: (w, h) => rect(w * 0.07, calloutBody(h) * 0.1, w * 0.86, calloutBody(h) * 0.8),
  anchors: (w, h) => ({ bottom: { x: w * 0.2, y: h }, left: { x: 0, y: calloutBody(h) / 2 }, right: { x: w, y: calloutBody(h) / 2 } }),
};

const stepNotch = (w: number, h: number) => Math.min(w * 0.22, h * 0.5);

const step: OutlineVariant = {
  id: "step",
  label: "Step",
  description: "A chevron: a stage in a pipeline or a phase in a process.",
  defaultSize: { width: 160, height: 80 },
  path: (w, h) => {
    const i = stepNotch(w, h);
    return polygon([[0, 0], [w - i, 0], [w, h / 2], [w - i, h], [0, h], [i, h / 2]]);
  },
  textRegion: (w, h) => rect(stepNotch(w, h) * 0.95, h * 0.08, w - stepNotch(w, h) * 1.9, h * 0.84),
  anchors: (w, h) => ({ left: { x: stepNotch(w, h), y: h / 2 } }),
};

const predefinedInset = (w: number) => Math.min(w * 0.1, 18);

const predefinedProcess: OutlineVariant = {
  id: "predefined-process",
  label: "Predefined process",
  description: "A box with double side bars: a step defined elsewhere, a subroutine.",
  defaultSize: { width: 150, height: 90 },
  path: (w, h) => polygon([[0, 0], [w, 0], [w, h], [0, h]]),
  details: (w, h) => {
    const s = predefinedInset(w);
    return [["M", s, 0], ["L", s, h], ["M", w - s, 0], ["L", w - s, h]];
  },
  textRegion: (w, h) => rect(predefinedInset(w) * 1.25, h * 0.08, w - predefinedInset(w) * 2.5, h * 0.84),
};

const documentsOffset = (w: number, h: number) => Math.min(w * 0.06, h * 0.1, 10);
const documentsWave = (h: number) => Math.min(h * 0.1, 14);

const documents: OutlineVariant = {
  id: "documents",
  label: "Documents",
  description: "A stack of pages: several documents or a bundle of records.",
  defaultSize: { width: 140, height: 110 },
  path: (w, h) => {
    const d = documentsOffset(w, h);
    const a = documentsWave(h);
    const front = w - 2 * d;
    return [
      ["M", 0, 2 * d],
      ["L", front, 2 * d],
      ["L", front, h - a],
      ["C", front * 0.82, h - 2 * a, front * 0.66, h - 2 * a, front * 0.5, h - a],
      ["C", front * 0.34, h, front * 0.16, h, 0, h - a],
      ["Z"],
    ];
  },
  details: (w, h) => {
    const d = documentsOffset(w, h);
    return [
      ["M", d, 2 * d], ["L", d, d], ["L", w - d, d], ["L", w - d, h - d * 2 - documentsWave(h)],
      ["M", 2 * d, d], ["L", 2 * d, 0], ["L", w, 0], ["L", w, h - d - documentsWave(h)],
    ];
  },
  textRegion: (w, h) => rect(w * 0.05, 2 * documentsOffset(w, h) + h * 0.05, w - 2 * documentsOffset(w, h) - w * 0.1, h - 2 * documentsOffset(w, h) - documentsWave(h) * 2.4 - h * 0.05),
  anchors: (w, h) => {
    const d = documentsOffset(w, h);
    const front = w - 2 * d;
    return { top: { x: front / 2, y: 2 * d }, right: { x: front, y: h / 2 }, bottom: { x: front / 2, y: h - documentsWave(h) } };
  },
};

const manualInputSlant = (h: number) => Math.min(h * 0.25, 24);

const manualInput: OutlineVariant = {
  id: "manual-input",
  label: "Manual input",
  description: "A box with a slanted top: data typed in by a person.",
  defaultSize: { width: 150, height: 90 },
  path: (w, h) => polygon([[0, manualInputSlant(h)], [w, 0], [w, h], [0, h]]),
  textRegion: (w, h) => rect(w * 0.05, manualInputSlant(h) + h * 0.04, w * 0.9, h - manualInputSlant(h) - h * 0.08),
  anchors: (w, h) => ({ top: { x: w / 2, y: manualInputSlant(h) / 2 } }),
};

const trapezoidInset = (w: number, h: number) => Math.min(w * 0.15, h * 0.4);

const manualOperation: OutlineVariant = {
  id: "manual-operation",
  label: "Manual operation",
  description: "An upside-down trapezoid: a step done by hand.",
  defaultSize: { width: 150, height: 90 },
  path: (w, h) => {
    const i = trapezoidInset(w, h);
    return polygon([[0, 0], [w, 0], [w - i, h], [i, h]]);
  },
  textRegion: (w, h) => rect(trapezoidInset(w, h) * 1.1, h * 0.08, w - trapezoidInset(w, h) * 2.2, h * 0.84),
  anchors: (w, h) => ({ left: { x: trapezoidInset(w, h) / 2, y: h / 2 }, right: { x: w - trapezoidInset(w, h) / 2, y: h / 2 } }),
};

const delayRadius = (w: number, h: number) => Math.min(h / 2, w * 0.5);

const delay: OutlineVariant = {
  id: "delay",
  label: "Delay",
  description: "A box with a rounded right side: waiting, a pause or a buffer.",
  defaultSize: { width: 140, height: 90 },
  path: (w, h) => {
    const r = delayRadius(w, h);
    const hh = h / 2;
    return [
      ["M", 0, 0],
      ["L", w - r, 0],
      ["C", w - r + KAPPA * r, 0, w, hh - KAPPA * hh, w, hh],
      ["C", w, hh + KAPPA * hh, w - r + KAPPA * r, h, w - r, h],
      ["L", 0, h],
      ["Z"],
    ];
  },
  textRegion: (w, h) => rect(w * 0.06, h * 0.1, w - delayRadius(w, h) * 0.5 - w * 0.1, h * 0.8),
};

const ring: OutlineVariant = {
  id: "ring",
  label: "Ring",
  description: "An ellipse that takes a border and a marker: events, states, attributes.",
  defaultSize: { width: 80, height: 80 },
  hidden: true,
  path: (w, h) => {
    const hw = w / 2;
    const hh = h / 2;
    return [
      ["M", 0, hh],
      ["C", 0, hh - KAPPA * hh, hw - KAPPA * hw, 0, hw, 0],
      ["C", hw + KAPPA * hw, 0, w, hh - KAPPA * hh, w, hh],
      ["C", w, hh + KAPPA * hh, hw + KAPPA * hw, h, hw, h],
      ["C", hw - KAPPA * hw, h, 0, hh + KAPPA * hh, 0, hh],
      ["Z"],
    ];
  },
  textRegion: (w, h) => rect(w * 0.17, h * 0.22, w * 0.66, h * 0.56),
};

const rhombus: OutlineVariant = {
  id: "rhombus",
  label: "Rhombus",
  description: "A diamond that takes a border and a marker: gateways and relationships.",
  defaultSize: { width: 100, height: 80 },
  hidden: true,
  path: (w, h) => polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
  textRegion: (w, h) => rect(w * 0.25, h * 0.25, w * 0.5, h * 0.5),
};

const box: OutlineVariant = {
  id: "box",
  label: "Box",
  description: "A rectangle that takes a border and a marker: weak entities.",
  defaultSize: { width: 140, height: 80 },
  hidden: true,
  path: (w, h) => polygon([[0, 0], [w, 0], [w, h], [0, h]]),
  textRegion: (w, h) => rect(w * 0.04, h * 0.06, w * 0.92, h * 0.88),
};

const VISIBLE_VARIANTS: readonly OutlineVariant[] = [
  cylinder, cloud, document, hexagon, parallelogram,
  queue, packageOutline, component, person, note, callout, step, predefinedProcess, documents, manualInput, manualOperation, delay,
];

/** Every outline a shape can name, including the base shapes that are only drawn with a border, marker or stack. */
export const ALL_OUTLINE_VARIANTS: readonly OutlineVariant[] = [...VISIBLE_VARIANTS, ring, rhombus, box];

/** The outlines offered as plain shapes: the picker, the language docs, the agent. */
export const OUTLINE_VARIANTS: readonly OutlineVariant[] = VISIBLE_VARIANTS;

/** The plain rectangle an unknown variant degrades to. Not listed: nobody can pick it. */
const RECTANGLE_FALLBACK: OutlineVariant = {
  id: "rectangle",
  label: "Rectangle",
  description: "Fallback outline.",
  defaultSize: { width: 140, height: 90 },
  path: (w, h) => polygon([[0, 0], [w, 0], [w, h], [0, h]]),
  textRegion: (w, h) => rect(0, 0, w, h),
};

const BY_ID = new Map(ALL_OUTLINE_VARIANTS.map((variant) => [variant.id, variant]));

/** Ids of every outline, including the hidden base shapes. */
export const allOutlineVariantIds = (): string[] => ALL_OUTLINE_VARIANTS.map((variant) => variant.id);

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

/**
 * The outline that draws `shape` once it takes a border, marker or stack: a rectangle is a box, a diamond a
 * rhombus, a pill or ellipse a ring, and an outline stands for itself. Undefined for shapes that cannot take them (icon).
 */
export const outlineForParams = (shape: string | undefined): string | undefined => {
  if (shape === undefined || shape === "rectangle") return "box";
  if (shape === "diamond") return "rhombus";
  if (shape === "pill" || shape === "ellipse") return "ring";
  return shape === "icon" ? undefined : isOutlineVariantId(shape) ? shape : undefined;
};

/** The language shape a base outline reads back as, so parameters round-trip through diagram code. */
export const shapeForBase = (variant: string): string | undefined => (variant === "box" ? undefined : variant === "rhombus" ? "diamond" : variant === "ring" ? "pill" : variant);
