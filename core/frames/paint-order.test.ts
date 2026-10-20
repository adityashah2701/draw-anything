import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { rect } from "@/core/groups/test-helpers";
import { paintOrder } from "./paint-order";
import { frame } from "./test-helpers";

const ids = (list: readonly DrawingElement[]) => list.map((e) => e.id);

describe("paintOrder", () => {
  it("returns the very same array for a board without frames, and for one already in order", () => {
    const plain = [rect("a", 0, 0), rect("b", 0, 0)];
    expect(paintOrder(plain)).toBe(plain);
    const ordered = [frame("f", 0, 0), rect("a", 10, 10, 10, 10, { frameId: "f" })] as DrawingElement[];
    expect(paintOrder(ordered)).toBe(ordered);
  });

  it("draws a frame under its contents even when it is stored above them", () => {
    const stored = [rect("a", 10, 10, 10, 10, { frameId: "f" }), rect("free", 500, 500), frame("f", 0, 0)] as DrawingElement[];
    expect(ids(paintOrder(stored))).toEqual(["f", "a", "free"]);
    expect(ids(stored)).toEqual(["a", "free", "f"]); // the input is not changed
  });

  it("keeps an outer frame under an inner one, and each under its contents", () => {
    const stored = [rect("x", 0, 0, 5, 5, { frameId: "i" }), frame("i", 0, 0, 100, 100, { frameId: "o" }), frame("o", 0, 0)] as DrawingElement[];
    expect(ids(paintOrder(stored))).toEqual(["o", "i", "x"]);
  });

  it("answers repeated calls for one array from memory", () => {
    const stored = [rect("a", 0, 0, 5, 5, { frameId: "f" }), frame("f", 0, 0)] as DrawingElement[];
    expect(paintOrder(stored)).toBe(paintOrder(stored));
  });

  it("ignores a frame link that does not resolve", () => {
    const stored = [frame("f", 0, 0), rect("a", 0, 0, 5, 5, { frameId: "ghost" })] as DrawingElement[];
    expect(paintOrder(stored)).toBe(stored);
  });
});
