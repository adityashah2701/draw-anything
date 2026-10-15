import { beforeEach, describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { clearClipboardForTests, copyToClipboard, hasClipboard, takeFromClipboard } from "./clipboard";

const el = { id: "a", type: "rectangle", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#000", strokeWidth: 1 } as DrawingElement;

describe("clipboard", () => {
  beforeEach(clearClipboardForTests);

  it("starts empty and ignores copying nothing", () => {
    expect(hasClipboard()).toBe(false);
    copyToClipboard([]);
    expect(takeFromClipboard()).toBeNull();
  });

  it("each paste steps further, and later edits to the original do not leak in", () => {
    const source = structuredClone(el);
    copyToClipboard([source]);
    source.points[0].x = 999;
    expect(takeFromClipboard()!.step).toBe(1);
    const second = takeFromClipboard()!;
    expect(second.step).toBe(2);
    expect(second.elements[0].points[0].x).toBe(0);
  });

  it("a new copy resets the step", () => {
    copyToClipboard([el]);
    takeFromClipboard();
    copyToClipboard([el]);
    expect(takeFromClipboard()!.step).toBe(1);
  });
});
