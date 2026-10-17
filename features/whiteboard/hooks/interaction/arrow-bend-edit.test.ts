import { describe, expect, it } from "vitest";
import { editBendAtPoint } from "./arrow-bend-edit";

const zPath = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 200, y: 100 },
];

describe("editBendAtPoint", () => {
  it("removes the bend under the pointer", () => {
    expect(editBendAtPoint(zPath, { x: 102, y: 3 }, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
  });

  it("adds a bend on the nearest segment", () => {
    const next = editBendAtPoint(zPath, { x: 50, y: 4 }, 1);
    expect(next).toHaveLength(zPath.length + 1);
    expect(next![1]).toEqual({ x: 50, y: 0 });
  });

  it("does nothing away from the arrow", () => {
    expect(editBendAtPoint(zPath, { x: 50, y: 60 }, 1)).toBeNull();
  });

  it("scales the pick radius with zoom", () => {
    expect(editBendAtPoint(zPath, { x: 50, y: 20 }, 1)).toBeNull();
    expect(editBendAtPoint(zPath, { x: 50, y: 20 }, 0.5)).not.toBeNull();
  });
});
