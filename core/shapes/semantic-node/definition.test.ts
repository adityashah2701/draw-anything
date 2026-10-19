import { describe, expect, it } from "vitest";
import { createShape, getShapeDefinition, getShapeBounds, shapeContainsPoint } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

describe("semantic node definition", () => {
  const def = () => getShapeDefinition("semantic-node")!;

  it("creates a node stored exactly like older ones: no nodeStyle key until something is customised", () => {
    const fresh = createShape("semantic-node", { points: [{ x: 0, y: 0 }, { x: 168, y: 78 }] })!;
    expect("nodeStyle" in fresh).toBe(false);
    expect(fresh).toMatchObject({ type: "semantic-node", label: "Node", fontSize: 17, fontWeight: "600", fill: "#eef2ff" });
    const styled = createShape("semantic-node", { points: [], nodeStyle: { iconSize: 32 } })!;
    expect(styled.nodeStyle).toEqual({ iconSize: 32 });
  });

  it("keeps the capabilities that make it a node: movable, resizable, rotatable, connectable, labelable", () => {
    expect(def().capabilities).toEqual(expect.arrayContaining(["movable", "resizable", "rotatable", "connectable", "labelable"]));
  });

  it("is the only shape with its own selection chrome, and still has the box geometry of the other shapes", () => {
    expect(def().renderSelection).toBeTypeOf("function");
    const node = createShape("semantic-node", { points: [{ x: 10, y: 20 }, { x: 178, y: 98 }] })! as unknown as DrawingElement;
    expect(getShapeBounds(node)).toMatchObject({ minX: 10, minY: 20, maxX: 178, maxY: 98, width: 168, height: 78 });
    expect(shapeContainsPoint(node, { x: 100, y: 60 })).toBe(true);
    expect(shapeContainsPoint(node, { x: 300, y: 60 })).toBe(false);
    for (const type of ["rectangle", "ellipse", "diamond", "pill", "triangle", "icon"] as const) {
      expect(getShapeDefinition(type)?.renderSelection, type).toBeUndefined();
    }
  });

  it("four anchors on its edges, whatever its icon layout", () => {
    const node = createShape("semantic-node", { id: "n", points: [{ x: 0, y: 0 }, { x: 168, y: 78 }], nodeStyle: { iconPlacement: "top" } })!;
    const anchors = def().getAnchors(node, def().getBounds(node));
    expect(anchors.map((a) => a.side).sort()).toEqual(["bottom", "left", "right", "top"]);
  });

  it("a node needs two points to be valid", () => {
    expect(def().validate!(createShape("semantic-node", { points: [{ x: 0, y: 0 }] })!)).toBe(false);
    expect(def().validate!(createShape("semantic-node", { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] })!)).toBe(true);
  });
});
