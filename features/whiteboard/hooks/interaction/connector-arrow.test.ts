import { describe, expect, it, vi } from "vitest";
import { buildConnectorArrow, handleUnderPoint, resolveConnectionDrop } from "./connector-arrow";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const base = {
  id: "a1",
  from: { elementId: "A", anchorId: "A:right", x: 100, y: 50, side: "right" as const },
  to: { elementId: "B", anchorId: "B:left", x: 300, y: 50, side: "left" as const },
};

describe("buildConnectorArrow", () => {
  it("creates an orthogonal arrow bound to both shapes, with an initial path", () => {
    const arrow = buildConnectorArrow(base)!;
    expect(arrow).toMatchObject({
      id: "a1",
      type: "arrow",
      routingMode: "orthogonal",
      isManuallyRouted: false,
      arrowHeadEnd: true,
      startConnection: { elementId: "A", anchorId: "A:right" },
      endConnection: { elementId: "B", anchorId: "B:left" },
    });
    expect(arrow.points.length).toBeGreaterThanOrEqual(2);
    expect(arrow.points[0]).toEqual({ x: 100, y: 50 });
    expect(arrow.points.at(-1)).toEqual({ x: 300, y: 50 });
  });

  it("hands the finished arrow to the obstacle-aware router and uses its path", () => {
    const routed = [{ x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 200 }, { x: 300, y: 50 }];
    const route = vi.fn((arrow: DrawingElement): DrawingElement => ({ ...arrow, points: routed }));
    const arrow = buildConnectorArrow({ ...base, route })!;
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0]).toMatchObject({ startConnection: { elementId: "A" } });
    expect(arrow.points).toEqual(routed);
  });

  it("keeps the unrouted path when the router returns nothing usable", () => {
    const arrow = buildConnectorArrow({ ...base, route: () => undefined as never })!;
    expect(arrow.points.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the unrouted path when the router throws", () => {
    const arrow = buildConnectorArrow({
      ...base,
      route: () => {
        throw new Error("boom");
      },
    })!;
    expect(arrow.points[0]).toEqual({ x: 100, y: 50 });
  });
});

describe("resolveConnectionDrop", () => {
  const el = (id: string) => ({ id, type: "rectangle", points: [] }) as never;
  const handles = (id: string, x: number) => [
    { id: `${id}:left`, name: "left" as const, x, y: 50 },
    { id: `${id}:right`, name: "right" as const, x: x + 100, y: 50 },
  ];
  const getHandles = (element: { id: string }) => handles(element.id, element.id === "a" ? 0 : 300);
  const draft = { fromElementId: "a", fromAnchorId: "a:right", fromHandle: "right" as const, currentPoint: { x: 310, y: 50 } };

  it("ends on the target handle nearest the pointer", () => {
    const drop = resolveConnectionDrop({ draft, elements: [el("a"), el("b")], candidates: [el("b")], snapAnchor: null, getHandles });
    expect(drop?.from).toMatchObject({ elementId: "a", anchorId: "a:right", x: 100, side: "right" });
    expect(drop?.to).toMatchObject({ elementId: "b", anchorId: "b:left", x: 300, side: "left" });
  });

  it("prefers the snapped anchor over the nearest handle", () => {
    const snapAnchor = { id: "b:right", name: "right" as const, x: 400, y: 50 };
    const drop = resolveConnectionDrop({ draft, elements: [el("a"), el("b")], candidates: [el("b")], snapAnchor, getHandles });
    expect(drop?.to).toMatchObject({ anchorId: "b:right", x: 400 });
  });

  it("ignores the source itself and drops on empty space", () => {
    expect(resolveConnectionDrop({ draft, elements: [el("a")], candidates: [el("a")], snapAnchor: null, getHandles })).toBeNull();
    expect(resolveConnectionDrop({ draft, elements: [el("a")], candidates: [], snapAnchor: null, getHandles })).toBeNull();
  });
});

describe("handleUnderPoint", () => {
  const hs = [{ id: "h1", name: "top" as const, x: 0, y: 0 }, { id: "h2", name: "left" as const, x: 5, y: 0 }];
  it("returns the first handle in reach", () => {
    expect(handleUnderPoint(hs, { x: 4, y: 0 }, 12)?.id).toBe("h1");
    expect(handleUnderPoint(hs, { x: 40, y: 0 }, 12)).toBeNull();
  });
});
