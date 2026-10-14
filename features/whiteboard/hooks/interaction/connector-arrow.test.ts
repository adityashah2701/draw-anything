import { describe, expect, it, vi } from "vitest";
import { buildConnectorArrow } from "./connector-arrow";
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
