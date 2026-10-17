import { describe, expect, it } from "vitest";
import { createScratch } from "./gesture-scratch";

describe("createScratch", () => {
  it("starts empty and never shares state between gestures", () => {
    const first = createScratch();
    first.previousSnap.end = {} as never;
    first.lastPoint = { x: 1, y: 1 };
    const second = createScratch();
    expect(second.previousSnap).toEqual({ start: null, end: null });
    expect(second.arrowSnap).toEqual({ start: null, end: null });
    expect(second.lastPoint).toBeNull();
    expect(second.dragSession).toBeNull();
  });
});
