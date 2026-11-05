import { describe, expect, it } from "vitest";
import { portAnchorId } from "@/core/anchors/ports";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { createCommandContext } from "@/features/whiteboard/commands/context";

const node = (id: string, x: number, y: number): DrawingElement =>
  ({ id, type: "semantic-node", points: [{ x, y }, { x: x + 200, y: y + 80 }], label: id, ai: { role: "node" } }) as DrawingElement;

const connector = (fromAnchor: string, toAnchor: string): DrawingElement =>
  ({
    id: "e",
    type: "arrow",
    color: "#000000",
    strokeWidth: 2,
    routingMode: "orthogonal",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    startConnection: { elementId: "a", anchorId: fromAnchor },
    endConnection: { elementId: "b", anchorId: toAnchor },
  }) as DrawingElement;

const route = (elements: DrawingElement[]) => {
  const ctx = createCommandContext(elements, { newId: () => "x" });
  const arrow = elements.find((e) => e.id === "e")!;
  const points = (ctx.routeArrow(arrow as never) as unknown as { points: Array<{ x: number; y: number }> }).points;
  return points.map(({ x, y }) => ({ x, y })); // the router hands back anchors; only the position matters here
};

describe("connector router and port anchors", () => {
  it("starts a connector at its port along the side, and follows the shape when it moves", () => {
    const e = connector(portAnchorId("a", "bottom", 0.25), "b-anchor-top");
    const first = route([node("a", 0, 0), node("b", 0, 300), e]);
    expect(first[0]).toEqual({ x: 50, y: 80 });

    const moved = route([node("a", 300, 0), node("b", 0, 300), e]);
    expect(moved[0]).toEqual({ x: 350, y: 80 });
  });

  it("still uses the middle of the side for a plain anchor id", () => {
    const e = connector("a-anchor-bottom", "b-anchor-top");
    expect(route([node("a", 0, 0), node("b", 0, 300), e])[0]).toEqual({ x: 100, y: 80 });
  });

  it("ends at a port on the target side", () => {
    const e = connector("a-anchor-bottom", portAnchorId("b", "top", 0.75));
    const points = route([node("a", 0, 0), node("b", 0, 300), e]);
    expect(points[points.length - 1]).toEqual({ x: 150, y: 300 });
  });
});
