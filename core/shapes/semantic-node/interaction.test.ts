import { describe, expect, it } from "vitest";
import { getShapeDefinition, getShapeResizeHandles } from "@/core/shapes/shape-runtime";
import { getSemanticNodeResizeHandles, resizeSemanticNode } from "./interaction";
import { semanticMinSize } from "./layout";
import type { SemanticNodeShape } from "./types";

const node = (over: Partial<SemanticNodeShape> = {}, w = 168, h = 78): SemanticNodeShape =>
  ({ id: "n", type: "semantic-node", color: "#000", strokeWidth: 2, label: "A", points: [{ x: 100, y: 50 }, { x: 100 + w, y: 50 + h }], ...over }) as SemanticNodeShape;
const boundsOf = (s: SemanticNodeShape) => getShapeDefinition("semantic-node")!.getBounds(s)!;

describe("resize handles", () => {
  it("are four visible corners and four edges that can be grabbed along their whole length", () => {
    const handles = getSemanticNodeResizeHandles(node(), boundsOf(node()));
    expect(handles.map((h) => h.name)).toEqual(["nw", "ne", "se", "sw", "n", "s", "e", "w"]);
    expect(handles.find((h) => h.name === "se")).toMatchObject({ x: 268, y: 128 });
    for (const corner of handles.slice(0, 4)) expect(corner.span).toBeUndefined();
    expect(handles.find((h) => h.name === "n")).toMatchObject({ x: 184, y: 50, span: 168, visible: false });
    expect(handles.find((h) => h.name === "w")).toMatchObject({ x: 100, y: 89, span: 78, visible: false });
    // Corners come first, so they win where they meet an edge.
    expect(handles.slice(0, 4).every((h) => h.visible !== false)).toBe(true);
  });

  it("no edge handle sits on an edge's midpoint where a connector starts: edges are zones, not dots", () => {
    const visible = getSemanticNodeResizeHandles(node(), boundsOf(node())).filter((h) => h.visible !== false);
    expect(visible.map((h) => h.name).sort()).toEqual(["ne", "nw", "se", "sw"]);
  });

  it("is the same list the runtime hands to the hit-test, and rotates with the node", () => {
    const shape = node({ rotation: 90 });
    const handles = getShapeResizeHandles(shape as never, { bounds: boundsOf(shape), zoom: 1 });
    const n = handles.find((h) => h.name === "n")!;
    // The top-middle of a quarter-turned 168x78 box about (184, 89) is to the right of its centre.
    expect(n.x).toBeCloseTo(184 + 39, 6);
    expect(n.y).toBeCloseTo(89, 6);
    expect(n.angle).toBe(90);
    expect(n.span).toBe(168);
  });

  it("none for a node without a box", () => {
    expect(getSemanticNodeResizeHandles(node(), null)).toEqual([]);
  });
});

describe("resizing", () => {
  const resize = (shape: SemanticNodeShape, handle: string, x: number, y: number) =>
    resizeSemanticNode(shape, handle, { x, y }, boundsOf(shape));
  const size = (s: SemanticNodeShape) => ({ w: s.points[1].x - s.points[0].x, h: s.points[1].y - s.points[0].y });

  it("grows from any handle", () => {
    expect(size(resize(node(), "se", 400, 300))).toEqual({ w: 300, h: 250 });
    expect(resize(node(), "nw", 40, 10).points[0]).toEqual({ x: 40, y: 10 });
  });

  it("stops at the minimum for a node with an icon, keeping the opposite edge in place", () => {
    const min = semanticMinSize();
    const shrunk = resize(node(), "se", 105, 55);
    expect(size(shrunk)).toEqual({ w: min.width, h: min.height });
    expect(shrunk.points[0]).toEqual({ x: 100, y: 50 });
    const fromWest = resize(node(), "w", 267, 89);
    expect(fromWest.points[1].x).toBe(268);
    expect(fromWest.points[0].x).toBe(268 - min.width);
  });

  it("the minimum follows the node's style: smaller without an icon, taller when the icon is stacked", () => {
    const hidden = node({ nodeStyle: { iconHidden: true } });
    expect(size(resize(hidden, "se", 105, 55))).toEqual({ w: semanticMinSize({ iconHidden: true }).width, h: semanticMinSize({ iconHidden: true }).height });
    const stacked = node({ nodeStyle: { iconPlacement: "top" } }, 168, 150);
    expect(size(resize(stacked, "se", 105, 55)).h).toBe(semanticMinSize({ iconPlacement: "top" }).height);
  });

  it("does not push an older node that is already below the minimum up to it", () => {
    const tiny = node({}, 90, 44); // spans x 100..190
    expect(size(resize(tiny, "e", 195, 94)).w).toBe(95); // follows the pointer, not snapped up to 112
    expect(size(resize(tiny, "e", 192, 94)).w).toBe(92);
    expect(size(resize(tiny, "e", 110, 94)).w).toBe(90); // but cannot shrink below where it already was
  });

  it("ignores an unknown handle", () => {
    expect(resize(node(), "zz", 0, 0)).toEqual(node());
  });
});
