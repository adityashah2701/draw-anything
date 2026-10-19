import { describe, expect, it } from "vitest";
import { isValidPathData } from "./path-data";

describe("isValidPathData", () => {
  it.each([
    "M0 0",
    "M3.29 7 12 12 20.71 7",
    "m16 16 2 2 4-4",
    "M21 8a2 2 0 0 0-1-1.73l-7-4Z",
    "M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0",
    "M2 12h20M12 2v20",
    "M1e2 .5L-3 +4",
    "M4 4c1 1 2 2 3 3 1 1 2 2 3 3z",
    "M0 0 L1 1 2 2",
  ])("accepts %j", (d) => expect(isValidPathData(d)).toBe(true));

  it.each([
    "",
    "L0 0",
    "M3.29L7L12L12L20.71L7", // a polyline's numbers joined by L, as the vendored glyphs once were
    "M22L12L16L12",
    "M0",
    "M0 0 L1",
    "M0 0 a2 2 0 2 0 1 1",
    "M0 0 X1 1",
    "M0 0 L1 1 2",
  ])("rejects %j", (d) => expect(isValidPathData(d)).toBe(false));
});
