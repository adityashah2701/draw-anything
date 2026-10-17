import { describe, expect, it } from "vitest";
import { isActive, isDrawingGesture } from "./gesture-state";

describe("gesture state", () => {
  it("only idle is inactive", () => {
    expect(isActive("idle")).toBe(false);
    for (const g of ["drawing", "erasing", "dragging", "resizing", "marquee", "connecting"] as const) expect(isActive(g)).toBe(true);
  });
  it("drawing and erasing are the drawing gestures", () => {
    expect(isDrawingGesture("drawing")).toBe(true);
    expect(isDrawingGesture("erasing")).toBe(true);
    expect(isDrawingGesture("dragging")).toBe(false);
  });
});
