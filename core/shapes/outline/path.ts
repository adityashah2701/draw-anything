import type { Point } from "@/features/whiteboard/types/whiteboard.types";

/** A path in a variant's own units: world units from the shape's top-left corner. */
export type PathCommand =
  | readonly ["M", number, number]
  | readonly ["L", number, number]
  | readonly ["C", number, number, number, number, number, number]
  | readonly ["Z"];

export type OutlinePath = readonly PathCommand[];

const CURVE_STEPS = 14;

/** Control-point distance of a cubic that approximates a quarter circle. */
export const KAPPA = 0.5522847498;

const cubic = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
};

/** The polygon a path draws (curves flattened), for hit-testing and bounds checks. Closed paths only repeat no point. */
export const flattenPath = (path: OutlinePath): Point[] => {
  const points: Point[] = [];
  let at: Point | null = null;
  for (const command of path) {
    if (command[0] === "M" || command[0] === "L") {
      at = { x: command[1], y: command[2] };
      points.push(at);
    } else if (command[0] === "C" && at) {
      const from: Point = at;
      const c1 = { x: command[1], y: command[2] };
      const c2 = { x: command[3], y: command[4] };
      const to = { x: command[5], y: command[6] };
      for (let step = 1; step <= CURVE_STEPS; step += 1) points.push(cubic(from, c1, c2, to, step / CURVE_STEPS));
      at = to;
    }
  }
  return points;
};

/** Trace `path` on a canvas context, mapping each point through `map`. Does not begin, close or stroke. */
export const tracePath = (ctx: CanvasRenderingContext2D, path: OutlinePath, map: (x: number, y: number) => Point) => {
  for (const command of path) {
    if (command[0] === "M") {
      const p = map(command[1], command[2]);
      ctx.moveTo(p.x, p.y);
    } else if (command[0] === "L") {
      const p = map(command[1], command[2]);
      ctx.lineTo(p.x, p.y);
    } else if (command[0] === "C") {
      const a = map(command[1], command[2]);
      const b = map(command[3], command[4]);
      const c = map(command[5], command[6]);
      ctx.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y);
    } else {
      ctx.closePath();
    }
  }
};

/** An SVG path `d` string for `path`, with each coordinate mapped through `map`. */
export const pathToSvg = (path: OutlinePath, map: (x: number, y: number) => Point): string => {
  const f = (n: number) => Number(n.toFixed(2));
  return path
    .map((command) => {
      if (command[0] === "Z") return "Z";
      if (command[0] === "C") {
        const a = map(command[1], command[2]);
        const b = map(command[3], command[4]);
        const c = map(command[5], command[6]);
        return `C${f(a.x)} ${f(a.y)} ${f(b.x)} ${f(b.y)} ${f(c.x)} ${f(c.y)}`;
      }
      const p = map(command[1], command[2]);
      return `${command[0]}${f(p.x)} ${f(p.y)}`;
    })
    .join("");
};

/** Is `point` inside the polygon (even-odd)? */
export const pointInPolygon = (point: Point, polygon: readonly Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Distance from `point` to the polygon's boundary (the closing edge included). */
export const distanceToPolygonEdge = (point: Point, polygon: readonly Point[]): number => {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
  }
  return best;
};
