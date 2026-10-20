import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementsForSelectionExport } from "./selection-policy";

const node = (id: string): DrawingElement => ({ id, type: "rectangle", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "#000", strokeWidth: 2 }) as DrawingElement;
const arrow = (id: string, from?: string, to?: string): DrawingElement =>
  ({
    id,
    type: "arrow",
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: "#000",
    strokeWidth: 2,
    startConnection: from ? { elementId: from } : undefined,
    endConnection: to ? { elementId: to } : undefined,
    ai: { semanticId: id, role: "edge" },
  }) as unknown as DrawingElement;
const label = (arrowId: string): DrawingElement =>
  ({ id: `${arrowId}-lbl`, type: "text", points: [{ x: 0, y: 0 }], color: "#000", strokeWidth: 1, text: "x", ai: { semanticId: `${arrowId}-label`, role: "edge-label" } }) as unknown as DrawingElement;

const board = [node("a"), node("b"), node("c"), arrow("ab", "a", "b"), arrow("bc", "b", "c"), label("ab"), label("bc")];
const ids = (els: DrawingElement[]) => els.map((e) => e.id);

describe("selection export policy", () => {
  it("is empty for an empty selection", () => {
    expect(elementsForSelectionExport(board, [])).toEqual([]);
  });

  it("includes connectors whose two ends are both selected, with their labels", () => {
    expect(ids(elementsForSelectionExport(board, ["a", "b"]))).toEqual(["a", "b", "ab", "ab-lbl"]);
  });

  it("leaves out a connector with only one selected end", () => {
    expect(ids(elementsForSelectionExport(board, ["a"]))).toEqual(["a"]);
  });

  it("includes an explicitly selected connector even with unselected ends", () => {
    expect(ids(elementsForSelectionExport(board, ["bc"]))).toEqual(["bc", "bc-lbl"]);
  });

  it("ignores connectors that are not attached at both ends", () => {
    const loose = [node("a"), arrow("x", "a", undefined)];
    expect(ids(elementsForSelectionExport(loose, ["a"]))).toEqual(["a"]);
  });

  it("keeps board order and ignores unknown ids", () => {
    expect(ids(elementsForSelectionExport(board, ["c", "ghost", "b", "a"]))).toEqual(["a", "b", "c", "ab", "bc", "ab-lbl", "bc-lbl"]);
  });
});

describe("selection export of frames", () => {
  const frame = (id: string, extra: Record<string, unknown> = {}): DrawingElement =>
    ({ id, type: "frame", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: "#000", strokeWidth: 1, ...extra }) as unknown as DrawingElement;
  const own = (el: DrawingElement, frameId: string) => ({ ...el, frameId }) as DrawingElement;
  const scene = [frame("f"), own(frame("g"), "f"), own(node("a"), "g"), own(node("b"), "f"), node("outside")];

  it("brings everything a selected frame owns, at any depth, and nothing else", () => {
    expect(ids(elementsForSelectionExport(scene, ["f"]))).toEqual(["f", "g", "a", "b"]);
  });

  it("exports an inner frame with its contents but not its owner", () => {
    expect(ids(elementsForSelectionExport(scene, ["g"]))).toEqual(["g", "a"]);
  });

  it("exports just the element when only a child is selected", () => {
    expect(ids(elementsForSelectionExport(scene, ["a"]))).toEqual(["a"]);
  });
});
