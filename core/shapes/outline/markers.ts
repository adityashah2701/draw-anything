import type { HeadOp, PathCmd } from "@/core/shapes/arrow/arrowhead";

/**
 * Small glyphs drawn inside a shape (the symbol in a BPMN event or gateway, the dot of an initial state).
 * Plain drawing instructions inside the circle of radius `r` about (cx, cy), so the canvas and the SVG
 * exporter paint the same thing.
 */
export const MARKER_IDS = ["envelope", "clock", "cross", "plus", "circle", "pentagon", "asterisk", "dot", "bullseye"] as const;
export type MarkerId = (typeof MARKER_IDS)[number];

export const isMarkerId = (value: unknown): value is MarkerId => typeof value === "string" && (MARKER_IDS as readonly string[]).includes(value);

const n = (v: number) => Math.round(v * 1000) / 1000 + 0;
const line = (...pts: Array<[number, number]>): PathCmd[] => pts.map(([x, y], i) => [i === 0 ? "M" : "L", n(x), n(y)] as const);
const stroke = (path: PathCmd[]): HeadOp => ({ kind: "stroke", path });

export const markerOps = (id: MarkerId, cx: number, cy: number, r: number): HeadOp[] => {
  const at = (dx: number, dy: number): [number, number] => [cx + dx * r, cy + dy * r];
  switch (id) {
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
    case "bullseye":
      return [
        { kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: false },
        { kind: "circle", cx: n(cx), cy: n(cy), r: n(r * 0.55), fill: true },
      ];
  }
};
