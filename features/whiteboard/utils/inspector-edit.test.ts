import { describe, expect, it } from "vitest";
import { arrow, boundsOf, rect } from "@/core/groups/test-helpers";
import { getShapeBounds, getShapeLocalBounds } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { planFrameEdit, planRotateBy, planSetRotation, targetFrame, MIN_FIELD_SIZE } from "./inspector-edit";

const none = () => [] as DrawingElement[];
const bounds = (s: DrawingElement) => getShapeBounds(s);
const frame = { x: 100, y: 50, width: 200, height: 100 };

describe("targetFrame", () => {
  it("takes the fields that were edited and keeps the rest", () => {
    expect(targetFrame(frame, { x: 5 }, false)).toEqual({ ...frame, x: 5 });
    expect(targetFrame(frame, { width: 400, y: 0 }, false)).toEqual({ x: 100, y: 0, width: 400, height: 100 });
  });

  it("keeps the proportions when asked, from whichever side was typed", () => {
    expect(targetFrame(frame, { width: 400 }, true)).toMatchObject({ width: 400, height: 200 });
    expect(targetFrame(frame, { height: 50 }, true)).toMatchObject({ width: 100, height: 50 });
    expect(targetFrame(frame, { width: 400, height: 10 }, true)).toMatchObject({ width: 400, height: 10 }); // both given: take both
  });

  it("never goes below the minimum size, and ignores non-numbers", () => {
    expect(targetFrame(frame, { width: 0, height: -5 }, false)).toMatchObject({ width: MIN_FIELD_SIZE, height: MIN_FIELD_SIZE });
    expect(targetFrame(frame, { x: Number.NaN, width: Number.POSITIVE_INFINITY }, false)).toEqual(frame);
  });

  it("does not divide by a zero-size frame", () => {
    const flat = { x: 0, y: 0, width: 0, height: 10 };
    expect(Number.isFinite(targetFrame(flat, { width: 40 }, true).height)).toBe(true);
  });
});

describe("planFrameEdit", () => {
  const targets = [rect("a", 100, 50, 100, 100), rect("b", 200, 50, 100, 100)]; // frame (100,50)-(300,150)
  const run = (edit: Parameters<typeof planFrameEdit>[0]["edit"], over: Partial<Parameters<typeof planFrameEdit>[0]> = {}) =>
    planFrameEdit({ targets, frame, frameIsLocal: false, edit, keepRatio: false, getBounds: bounds, reroute: none, ...over });
  const box = (out: DrawingElement[], id: string) => boundsOf(out.find((s) => s.id === id));

  it("moves the whole selection when X or Y is typed, shapes keeping their relative places", () => {
    const out = run({ x: 0, y: 10 });
    expect(box(out, "a")).toMatchObject({ minX: 0, minY: 10, maxX: 100, maxY: 110 });
    expect(box(out, "b")).toMatchObject({ minX: 100, minY: 10 });
  });

  it("scales the selection from its top-left corner when W or H is typed", () => {
    const out = run({ width: 400, height: 50 }); // x2, x0.5
    expect(box(out, "a")).toMatchObject({ minX: 100, minY: 50, maxX: 300, maxY: 100 });
    expect(box(out, "b")).toMatchObject({ minX: 300, maxX: 500, minY: 50, maxY: 100 });
  });

  it("scales both ways proportionally with the ratio lock", () => {
    const out = run({ width: 400 }, { keepRatio: true });
    expect(box(out, "b")).toMatchObject({ minX: 300, maxX: 500, minY: 50, maxY: 250 });
  });

  it("holds the selection above the size its smallest shape can reach", () => {
    const tiny = [rect("a", 100, 50, 100, 100), rect("b", 200, 50, 8, 100)];
    const out = planFrameEdit({ targets: tiny, frame: { x: 100, y: 50, width: 108, height: 100 }, frameIsLocal: false, edit: { width: 1 }, keepRatio: false, getBounds: bounds, reroute: none });
    expect(box(out, "b")!.width).toBeGreaterThanOrEqual(3.9);
  });

  it("scales a connector inside the selection along with its shapes", () => {
    const withArrow = [...targets, { ...arrow("ab", "a", "b"), points: [{ x: 200, y: 100 }, { x: 250, y: 100 }] } as DrawingElement];
    const out = run({ width: 400 }, { targets: withArrow });
    expect(out.find((s) => s.id === "ab")!.points).toEqual([{ x: 300, y: 100 }, { x: 400, y: 100 }]);
  });

  it("returns the connectors the router produces for the changed shapes", () => {
    const routed = { ...arrow("out", "a", "elsewhere"), points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } as DrawingElement;
    const out = run({ x: 0 }, { reroute: () => [routed] });
    expect(out.map((s) => s.id)).toEqual(["a", "b", "out"]);
  });

  it("resizes one rotated shape about its centre, in its own frame", () => {
    const turned = rect("t", 100, 50, 100, 40, { rotation: 90 });
    const local = { x: 100, y: 50, width: 100, height: 40 };
    const out = planFrameEdit({ targets: [turned], frame: local, frameIsLocal: true, edit: { width: 200 }, keepRatio: false, getBounds: bounds, reroute: none });
    const after = getShapeLocalBounds(out[0])!;
    expect(after.width).toBe(200);
    expect(after.height).toBe(40);
    expect(after.minX + after.width / 2).toBeCloseTo(150, 9); // centre unchanged
    expect(out[0].rotation).toBe(90);
  });

  it("moves one rotated shape by the typed X and Y", () => {
    const turned = rect("t", 100, 50, 100, 40, { rotation: 30 });
    const out = planFrameEdit({ targets: [turned], frame: { x: 100, y: 50, width: 100, height: 40 }, frameIsLocal: true, edit: { x: 130, y: 45 }, keepRatio: false, getBounds: bounds, reroute: none });
    expect(getShapeLocalBounds(out[0])).toMatchObject({ minX: 130, minY: 45, width: 100, height: 40 });
  });
});

describe("rotation edits", () => {
  it("sets one shape's angle, normalised, and re-routes what is attached to it", () => {
    const routed = [{ ...arrow("x", "a", "b") }] as DrawingElement[];
    const out = planSetRotation(rect("a", 0, 0), 450, () => routed);
    expect(out.map((s) => s.id)).toEqual(["a", "x"]);
    expect(out[0].rotation).toBe(90);
  });

  it("removes the field when set back to upright, so the shape is stored as before", () => {
    const out = planSetRotation(rect("a", 0, 0, 10, 10, { rotation: 90 }), 360, none);
    expect("rotation" in JSON.parse(JSON.stringify(out[0]))).toBe(false);
  });

  it("ignores a non-number", () => {
    expect(planSetRotation(rect("a", 0, 0), Number.NaN, none)).toEqual([]);
  });

  it("turns a selection about the centre of its frame", () => {
    const targets = [rect("a", 0, 0, 100, 50), rect("b", 200, 0, 100, 50)];
    const out = planRotateBy(targets, { x: 0, y: 0, width: 300, height: 50 }, 180, bounds, none);
    expect(boundsOf(out.find((s) => s.id === "a"))).toMatchObject({ minX: 200, maxX: 300 });
    expect(out.every((s) => s.rotation === 180)).toBe(true);
  });

  it("does nothing for no angle", () => {
    expect(planRotateBy([rect("a", 0, 0)], frame, 0, bounds, none)).toEqual([]);
    expect(planRotateBy([rect("a", 0, 0)], frame, 360, bounds, none)).toEqual([]);
    expect(planRotateBy([rect("a", 0, 0)], frame, Number.NaN, bounds, none)).toEqual([]);
  });
});
