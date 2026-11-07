import type { ArrowheadKind, Point } from "@/core/model";

/**
 * How the end of a connector is finished, as plain drawing instructions. Pure: the canvas and the
 * SVG exporter paint the same list, so a head cannot differ between them. `dir` is the unit vector the
 * line travels along as it reaches the shape; `tip` is the point on the shape's edge.
 */
export const ARROWHEAD_KINDS: readonly ArrowheadKind[] = [
  "triangle",
  "open",
  "hollow-triangle",
  "diamond",
  "diamond-filled",
  "circle",
  "crow-one",
  "crow-many",
  "crow-zero-one",
  "crow-zero-many",
  "crow-exactly-one",
  "crow-one-many",
  "cross",
  "lollipop",
  "socket",
];

export type PathCmd = readonly ["M", number, number] | readonly ["L", number, number] | readonly ["Z"];
export type HeadOp =
  | { kind: "fill" | "stroke"; path: PathCmd[] }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: boolean };

export interface HeadSize {
  length: number;
  width: number;
}

/** -0 and float noise out, so equal geometry compares equal. */
const n = (v: number) => Math.round(v * 1000) / 1000 + 0;

const circleRadius = (size: HeadSize) => size.length * 0.38;
/** A socket's stem, and the radius of its cup. */
const socketStem = (size: HeadSize) => size.length * 0.35;
const socketRadius = (size: HeadSize) => size.length * 0.55;

/** How far back from the tip the line must stop so a hollow head is not drawn over the line. */
export const headTrim = (kind: ArrowheadKind, size: HeadSize): number => {
  switch (kind) {
    case "hollow-triangle":
    case "diamond":
      return size.length;
    case "circle":
      return circleRadius(size) * 2;
    case "crow-zero-one":
    case "crow-zero-many":
    case "lollipop":
      return size.length + circleRadius(size) * 2;
    case "socket":
      return socketStem(size) + socketRadius(size);
    default:
      return 0;
  }
};

export const arrowheadOps = (kind: ArrowheadKind, tip: Point, dir: Point, size: HeadSize): HeadOp[] => {
  const px = -dir.y;
  const py = dir.x;
  const at = (back: number, side: number): Point => ({
    x: n(tip.x - dir.x * back + px * side),
    y: n(tip.y - dir.y * back + py * side),
  });
  const line = (...pts: Point[]): PathCmd[] => pts.map((p, i) => [i === 0 ? "M" : "L", p.x, p.y] as const);
  const { length: len, width: w } = size;
  const tipPoint = at(0, 0);

  switch (kind) {
    case "open":
      return [{ kind: "stroke", path: line(at(len, -w), tipPoint, at(len, w)) }];
    case "hollow-triangle":
      return [{ kind: "stroke", path: [...line(tipPoint, at(len, w), at(len, -w)), ["Z"]] }];
    case "diamond":
    case "diamond-filled":
      return [
        {
          kind: kind === "diamond" ? "stroke" : "fill",
          path: [...line(tipPoint, at(len / 2, w), at(len, 0), at(len / 2, -w)), ["Z"]],
        },
      ];
    case "circle": {
      const r = circleRadius(size);
      const c = at(r, 0);
      return [{ kind: "circle", cx: c.x, cy: c.y, r: n(r), fill: false }];
    }
    case "crow-one":
      return [{ kind: "stroke", path: line(at(len * 0.4, -w), at(len * 0.4, w)) }];
    case "crow-exactly-one":
      return [
        { kind: "stroke", path: line(at(len * 0.3, -w), at(len * 0.3, w)) },
        { kind: "stroke", path: line(at(len * 0.65, -w), at(len * 0.65, w)) },
      ];
    case "crow-many":
    case "crow-zero-many": {
      const base = at(len, 0);
      const ops: HeadOp[] = [at(0, -w), tipPoint, at(0, w)].map((end) => ({ kind: "stroke", path: line(base, end) }) as HeadOp);
      if (kind === "crow-zero-many") {
        const r = circleRadius(size);
        const c = at(len + r, 0);
        ops.push({ kind: "circle", cx: c.x, cy: c.y, r: n(r), fill: false });
      }
      return ops;
    }
    case "crow-one-many": {
      // The prongs touch the shape; the bar sits just beyond them.
      const base = at(len, 0);
      const ops: HeadOp[] = [at(0, -w), tipPoint, at(0, w)].map((end) => ({ kind: "stroke", path: line(base, end) }) as HeadOp);
      ops.push({ kind: "stroke", path: line(at(len + 3, -w), at(len + 3, w)) });
      return ops;
    }
    case "cross":
      return [
        { kind: "stroke", path: line(at(w * 0.2, -w * 0.8), at(w * 1.8, w * 0.8)) },
        { kind: "stroke", path: line(at(w * 0.2, w * 0.8), at(w * 1.8, -w * 0.8)) },
      ];
    case "lollipop": {
      // A provided interface: a ball on a short stem.
      const r = circleRadius(size);
      const c = at(len + r, 0);
      return [
        { kind: "stroke", path: line(at(len, 0), tipPoint) },
        { kind: "circle", cx: c.x, cy: c.y, r: n(r), fill: false },
      ];
    }
    case "socket": {
      // A required interface: a cup, open toward the line, on a short stem.
      const stem = socketStem(size);
      const radius = socketRadius(size);
      const arc: Point[] = [];
      for (let degrees = -90; degrees <= 90; degrees += 15) {
        const t = (degrees * Math.PI) / 180;
        arc.push(at(stem + radius * (1 - Math.cos(t)), radius * Math.sin(t)));
      }
      return [
        { kind: "stroke", path: line(tipPoint, at(stem, 0)) },
        { kind: "stroke", path: line(...arc) },
      ];
    }
    case "crow-zero-one": {
      const r = circleRadius(size);
      const c = at(len + r, 0);
      return [
        { kind: "stroke", path: line(at(len, 0), tipPoint) },
        { kind: "stroke", path: line(at(len * 0.4, -w), at(len * 0.4, w)) },
        { kind: "circle", cx: c.x, cy: c.y, r: n(r), fill: false },
      ];
    }
    case "triangle":
    default:
      return [{ kind: "fill", path: [...line(tipPoint, at(len, w), at(len, -w)), ["Z"]] }];
  }
};

/** Paints a list of drawing instructions with the stroke and fill already set on `ctx`. Canvas and SVG export share it. */
export const paintOps = (ctx: CanvasRenderingContext2D, ops: readonly HeadOp[]) => {
  for (const op of ops) {
    ctx.beginPath();
    if (op.kind === "circle") {
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      if (op.fill) ctx.fill();
      else ctx.stroke();
      continue;
    }
    for (const cmd of op.path) {
      if (cmd[0] === "M") ctx.moveTo(cmd[1], cmd[2]);
      else if (cmd[0] === "L") ctx.lineTo(cmd[1], cmd[2]);
      else ctx.closePath();
    }
    if (op.kind === "fill") ctx.fill();
    else ctx.stroke();
  }
};
