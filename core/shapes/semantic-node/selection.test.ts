import { describe, expect, it } from "vitest";
import { SELECTION_ACCENT } from "@/core/shapes/base/selection-style";
import { getShapeDefinition, renderShapeSelection } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { getSemanticNodeResizeHandles } from "./interaction";

type Call = { name: string; args: unknown[] };
const recorder = () => {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => (name in state ? state[name] : (...args: unknown[]) => void calls.push({ name, args })),
      set: (_t, name: string, value) => ((state[name] = value), calls.push({ name: `set:${name}`, args: [value] }), true),
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const node = (over: Record<string, unknown> = {}) =>
  ({ id: "n", type: "semantic-node", color: "#000", strokeWidth: 2, points: [{ x: 100, y: 50 }, { x: 268, y: 128 }], ...over }) as unknown as DrawingElement;
const context = (ctx: CanvasRenderingContext2D, zoom = 1) => ({ ctx, zoom, panOffset: { x: 0, y: 0 }, getElementBounds: () => null, editingTextId: null });

describe("semantic node selection chrome", () => {
  it("is drawn by the node itself, in place of the generic dashed box", () => {
    const { ctx, calls } = recorder();
    expect(renderShapeSelection(node(), context(ctx))).toBe(true);
    expect(calls.some((c) => c.name === "setLineDash" && (c.args[0] as number[]).length === 0)).toBe(true);
    expect(calls.some((c) => c.name === "setLineDash" && (c.args[0] as number[]).length > 0)).toBe(false); // never dashed
    expect(calls.some((c) => c.name === "set:strokeStyle" && c.args[0] === SELECTION_ACCENT)).toBe(true);
  });

  it("other shapes keep the generic chrome (the hook is opt-in)", () => {
    const { ctx, calls } = recorder();
    const rect = { id: "r", type: "rectangle", color: "#000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] } as unknown as DrawingElement;
    expect(renderShapeSelection(rect, context(ctx))).toBe(false);
    expect(calls).toEqual([]);
    expect(getShapeDefinition("rectangle")?.renderSelection).toBeUndefined();
    expect(getShapeDefinition("semantic-node")?.renderSelection).toBeTypeOf("function");
  });

  it("draws exactly the visible handles of the hit-test list, at every zoom, and not the edge zones", () => {
    for (const zoom of [0.25, 0.5, 1, 2]) {
      const { ctx, calls } = recorder();
      const shape = node();
      renderShapeSelection(shape, context(ctx, zoom));
      const bounds = { minX: 100, minY: 50, maxX: 268, maxY: 128, width: 168, height: 78 };
      const wanted = getSemanticNodeResizeHandles(shape as never, bounds).filter((h) => h.visible !== false).length;
      // One rounded rect for the outline plus one per visible handle.
      expect(calls.filter((c) => c.name === "roundRect").length, `zoom ${zoom}`).toBe(1 + wanted);
      expect(wanted).toBe(4);
    }
  });

  it("has smaller handles than the old 11px dots and keeps the outline off the node's own border", () => {
    const { ctx, calls } = recorder();
    renderShapeSelection(node(), context(ctx));
    const rects = calls.filter((c) => c.name === "roundRect").map((c) => c.args as number[]);
    const [outline, ...handles] = rects;
    // The outline is slightly larger than the 168x78 node, so its edge does not sit on the border.
    expect(outline[2]).toBeGreaterThan(168);
    expect(outline[3]).toBeGreaterThan(78);
    for (const handle of handles) expect(Math.max(handle[2], handle[3])).toBeLessThanOrEqual(16);
  });

  it("turns with a rotated node", () => {
    const { ctx, calls } = recorder();
    renderShapeSelection(node({ rotation: 30 }), context(ctx));
    expect(calls.some((c) => c.name === "rotate" && Math.abs((c.args[0] as number) - (30 * Math.PI) / 180) < 1e-9)).toBe(true);
    const upright = recorder();
    renderShapeSelection(node(), context(upright.ctx));
    expect(upright.calls.some((c) => c.name === "rotate")).toBe(false);
  });

  it("leaves the context balanced (every save is restored) and draws nothing for a node without a box", () => {
    const { ctx, calls } = recorder();
    renderShapeSelection(node(), context(ctx));
    expect(calls.filter((c) => c.name === "save").length).toBe(calls.filter((c) => c.name === "restore").length);
    const empty = recorder();
    renderShapeSelection(node({ points: [{ x: 0, y: 0 }] }), context(empty.ctx));
    expect(empty.calls).toEqual([]);
  });
});
