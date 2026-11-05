import type { HeadOp, PathCmd } from "@/core/shapes/arrow/arrowhead";

/**
 * Small glyphs drawn inside a shape (the symbol in a BPMN event or gateway, the dot of an initial state).
 * Plain drawing instructions inside the circle of radius `r` about (cx, cy), so the canvas and the SVG
 * exporter paint the same thing.
 */
const BASE_MARKERS = ["envelope", "clock", "cross", "plus", "circle", "pentagon", "asterisk", "dot", "bullseye", "bolt", "triangle", "arrow-up", "square", "arrow-right", "lines"] as const;
/** Every marker also exists filled (`envelope-filled`): BPMN draws a catching event hollow and a throwing one filled. */
export const MARKER_IDS = [...BASE_MARKERS, ...BASE_MARKERS.map((id) => `${id}-filled` as const)] as readonly (typeof BASE_MARKERS[number] | `${typeof BASE_MARKERS[number]}-filled`)[];
export type MarkerId = (typeof MARKER_IDS)[number];

export const isMarkerId = (value: unknown): value is MarkerId => typeof value === "string" && (MARKER_IDS as readonly string[]).includes(value);

const n = (v: number) => Math.round(v * 1000) / 1000 + 0;
const line = (...pts: Array<[number, number]>): PathCmd[] => pts.map(([x, y], i) => [i === 0 ? "M" : "L", n(x), n(y)] as const);
const stroke = (path: PathCmd[]): HeadOp => ({ kind: "stroke", path });

/** The same drawing with every outline turned into a fill: the filled form of a marker. */
const filled = (ops: HeadOp[]): HeadOp[] => ops.map((op) => (op.kind === "stroke" ? ({ kind: "fill", path: op.path } as HeadOp) : op.kind === "circle" ? { ...op, fill: true } : op));

export const markerOps = (id: MarkerId, cx: number, cy: number, r: number): HeadOp[] => {
  if (id.endsWith("-filled")) return filled(markerOps(id.slice(0, -"-filled".length) as MarkerId, cx, cy, r));
  const at = (dx: number, dy: number): [number, number] => [cx + dx * r, cy + dy * r];
  switch (id as (typeof BASE_MARKERS)[number]) {
    case "envelope":
      return [
        stroke([...line(at(-0.82, -0.5), at(0.82, -0.5), at(0.82, 0.5), at(-0.82, 0.5)), ["Z"]]),
        stroke(line(at(-0.82, -0.5), at(0, 0.08), at(0.82, -0.5))),
      ];
    case "clock":
      return [
        { kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: false },
        stroke(line(at(0, 0), at(0, -0.62))),
        stroke(line(at(0, 0), at(0.45, 0.2))),
      ];
    case "cross":
      return [stroke(line(at(-0.7, -0.7), at(0.7, 0.7))), stroke(line(at(-0.7, 0.7), at(0.7, -0.7)))];
    case "plus":
      return [stroke(line(at(-0.85, 0), at(0.85, 0))), stroke(line(at(0, -0.85), at(0, 0.85)))];
    case "circle":
      return [{ kind: "circle", cx: n(cx), cy: n(cy), r: n(r * 0.75), fill: false }];
    case "pentagon": {
      const pts = Array.from({ length: 5 }, (_, i) => at(Math.sin((i * 2 * Math.PI) / 5) * 0.9, -Math.cos((i * 2 * Math.PI) / 5) * 0.9));
      return [stroke([...line(...pts), ["Z"]])];
    }
    case "asterisk":
      return [stroke(line(at(-0.8, 0), at(0.8, 0))), stroke(line(at(-0.4, -0.7), at(0.4, 0.7))), stroke(line(at(0.4, -0.7), at(-0.4, 0.7)))];
    case "dot":
      return [{ kind: "circle", cx: n(cx), cy: n(cy), r: n(r * 0.8), fill: true }];
    case "bolt":
      return [stroke([...line(at(0.25, -0.9), at(-0.45, 0.1), at(0.05, 0.1), at(-0.3, 0.9), at(0.5, -0.2), at(0, -0.2)), ["Z"]])];
    case "triangle":
      return [stroke([...line(at(0, -0.8), at(0.8, 0.6), at(-0.8, 0.6)), ["Z"]])];
    case "arrow-up":
      return [stroke(line(at(0, 0.8), at(0, -0.8))), stroke(line(at(-0.5, -0.3), at(0, -0.8), at(0.5, -0.3)))];
    case "square":
      return [stroke([...line(at(-0.6, -0.6), at(0.6, -0.6), at(0.6, 0.6), at(-0.6, 0.6)), ["Z"]])];
    case "arrow-right":
      return [stroke(line(at(-0.8, 0), at(0.8, 0))), stroke(line(at(0.3, -0.5), at(0.8, 0), at(0.3, 0.5)))];
    case "lines":
      return [stroke(line(at(-0.7, -0.5), at(0.7, -0.5))), stroke(line(at(-0.7, 0), at(0.7, 0))), stroke(line(at(-0.7, 0.5), at(0.7, 0.5)))];
    case "bullseye":
      return [
        { kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: false },
        { kind: "circle", cx: n(cx), cy: n(cy), r: n(r * 0.55), fill: true },
      ];
  }
  return [];
};
