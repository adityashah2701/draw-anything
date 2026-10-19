import { describe, expect, it } from "vitest";
import type { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { HANDLE_REACH_PX, resizeHandleAt } from "./resize-handle-hit";

const corner = (name: string, x: number, y: number): ShapeResizeHandle => ({ name, x, y });

describe("resizeHandleAt", () => {
  const handles: ShapeResizeHandle[] = [
    corner("nw", 0, 0),
    corner("se", 100, 60),
    { name: "n", x: 50, y: 0, span: 100, visible: false },
    { name: "e", x: 100, y: 30, span: 60, visible: false },
  ];

  it("grabs a point handle within a square of 8 screen pixels, whatever the zoom", () => {
    expect(resizeHandleAt(handles, { x: 100 + 7, y: 60 - 7 }, 1)).toBe("se");
    expect(resizeHandleAt(handles, { x: 100 + 9, y: 60 }, 1)).toBeNull();
    expect(resizeHandleAt(handles, { x: 100 + 15, y: 60 }, 0.5)).toBe("se"); // 8px = 16 world units at half zoom
    expect(resizeHandleAt(handles, { x: 100 + 3, y: 60 }, 4)).toBeNull(); // 8px = 2 world units at 4x
    expect(HANDLE_REACH_PX).toBe(8);
  });

  it("grabs an edge anywhere along its length, within the reach across it", () => {
    expect(resizeHandleAt(handles, { x: 20, y: 5 }, 1)).toBe("n");
    expect(resizeHandleAt(handles, { x: 90, y: -6 }, 1)).toBe("n");
    expect(resizeHandleAt(handles, { x: 95, y: 15 }, 1)).toBe("e");
    expect(resizeHandleAt(handles, { x: 20, y: 12 }, 1)).toBeNull(); // too far from the edge
    expect(resizeHandleAt(handles, { x: 140, y: 5 }, 1)).toBeNull(); // past the end of the edge
  });

  it("lists win in order: a corner beats the edge it sits on", () => {
    expect(resizeHandleAt(handles, { x: 2, y: 2 }, 1)).toBe("nw");
    expect(resizeHandleAt(handles, { x: 30, y: 2 }, 1)).toBe("n");
  });

  it("an edge of a turned shape is grabbed along its turned length", () => {
    // Quarter-turned: the top edge of a 100-wide box centred at (50, 0) now runs vertically through (50, 0).
    const turned: ShapeResizeHandle[] = [{ name: "n", x: 50, y: 0, span: 100, visible: false, angle: 90 }];
    expect(resizeHandleAt(turned, { x: 50, y: 40 }, 1)).toBe("n");
    expect(resizeHandleAt(turned, { x: 53, y: -45 }, 1)).toBe("n");
    expect(resizeHandleAt(turned, { x: 90, y: 0 }, 1)).toBeNull(); // where the unturned edge would have been
  });

  it("nothing for an empty list", () => {
    expect(resizeHandleAt([], { x: 0, y: 0 }, 1)).toBeNull();
  });
});
