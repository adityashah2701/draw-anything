import { describe, expect, it } from "vitest";
import { placeGroupHeadings, type HeadingRequest } from "./group-headings";

const request = (over: Partial<HeadingRequest> = {}): HeadingRequest => ({
  id: "g",
  frame: { minX: 0, minY: 100, maxX: 400, maxY: 500 },
  width: 100,
  height: 29,
  top: 8,
  inset: 16,
  ...over,
});
const vertical = (x: number, from = 0, to = 300) => [{ x, y: from }, { x, y: to }];

describe("placeGroupHeadings", () => {
  it("keeps the heading at the left when nothing runs through it", () => {
    expect(placeGroupHeadings([request()], [vertical(300)]).get("g")).toEqual({ x: 16, y: 108 });
  });

  it("moves it past a connector that enters under it", () => {
    const spot = placeGroupHeadings([request()], [vertical(60)]).get("g")!;
    expect(spot.x).toBeGreaterThanOrEqual(60 + 14);
    expect(spot.x + 100).toBeLessThanOrEqual(400 - 16);
    expect(spot.frameMaxX).toBeUndefined();
  });

  it("ignores connectors that pass above or below the heading's row", () => {
    expect(placeGroupHeadings([request()], [vertical(60, 0, 90), vertical(60, 200, 400)]).get("g")?.x).toBe(16);
  });

  it("grows the frame to the right when the frame is too narrow to clear the connector", () => {
    const narrow = request({ frame: { minX: 0, minY: 100, maxX: 150, maxY: 500 } });
    const spot = placeGroupHeadings([narrow], [vertical(75)]).get("g")!;
    expect(spot.x).toBeGreaterThanOrEqual(75 + 14);
    expect(spot.frameMaxX).toBe(spot.x + 100 + 16);
    expect(spot.frameMaxX).toBeGreaterThan(150);
  });

  it("stays put when the frame may not grow, rather than covering something else", () => {
    const narrow = request({ frame: { minX: 0, minY: 100, maxX: 150, maxY: 500 } });
    const spot = placeGroupHeadings([narrow], [vertical(75)], () => false).get("g")!;
    expect(spot).toEqual({ x: 16, y: 108 });
  });

  it("treats a horizontal run through the heading's row as blocking its whole length", () => {
    const run = [{ x: 0, y: 120 }, { x: 250, y: 120 }];
    const spot = placeGroupHeadings([request()], [run]).get("g")!;
    expect(spot.x).toBeGreaterThanOrEqual(250 + 14);
  });
});
