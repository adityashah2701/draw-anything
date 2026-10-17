import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";
import { classifyDraftCommit, growDraftElement, straightArrowPreview } from "./draft-element";

const base = { id: "a", color: "#000", strokeWidth: 2 };

describe("growDraftElement", () => {
  it("appends to a freehand stroke", () => {
    const next = growDraftElement({ ...base, type: "freehand", points: [{ x: 0, y: 0 }] } as DrawingElement, { x: 5, y: 5 }, null);
    expect(next).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
  });

  it("keeps a box shape as origin plus pointer", () => {
    const next = growDraftElement(
      { ...base, type: "rectangle", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } as DrawingElement,
      { x: 9, y: 9 },
      null,
    );
    expect(next).toMatchObject({ points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] });
  });

  it("snaps a connector end to the matched anchor and records the connection", () => {
    const snap = { elementId: "n1", anchor: { id: "n1:left", x: 40, y: 50 } } as unknown as MagneticSnapMatch;
    const next = growDraftElement({ ...base, type: "arrow", points: [{ x: 0, y: 0 }] } as DrawingElement, { x: 3, y: 3 }, snap);
    expect(next).toMatchObject({
      points: [{ x: 0, y: 0 }, { x: 40, y: 50 }],
      endConnection: { elementId: "n1", anchorId: "n1:left" },
    });
  });
});

describe("straightArrowPreview", () => {
  it("keeps only the ends and drops the manual flag", () => {
    const out = straightArrowPreview({ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 9 }] }, { x: 1, y: 1 });
    expect(out).toEqual({ points: [{ x: 0, y: 0 }, { x: 5, y: 9 }], isManuallyRouted: false });
  });
});

describe("classifyDraftCommit", () => {
  const draft = (type: string, a: [number, number], b: [number, number], extra = {}) =>
    ({ ...base, type, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], ...extra }) as DrawingElement;

  it("treats a tiny drag as a click but never a freehand stroke", () => {
    expect(classifyDraftCommit(draft("rectangle", [0, 0], [2, 3]))).toBe("click");
    expect(classifyDraftCommit(draft("freehand", [0, 0], [2, 3]))).toBe("shape");
  });

  it("separates a connector bound at both ends from everything else", () => {
    const conn = { startConnection: { elementId: "a", anchorId: "a:r" }, endConnection: { elementId: "b", anchorId: "b:l" } };
    expect(classifyDraftCommit(draft("arrow", [0, 0], [50, 0], conn))).toBe("connected-arrow");
    expect(classifyDraftCommit(draft("arrow", [0, 0], [50, 0], { startConnection: conn.startConnection }))).toBe("shape");
    expect(classifyDraftCommit(draft("rectangle", [0, 0], [50, 40]))).toBe("shape");
  });
});
