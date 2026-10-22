import { describe, expect, it } from "vitest";
import { frame } from "@/core/frames/test-helpers";
import { applyPatch } from "@/core/groups/patch";
import { arrow, rect } from "@/core/groups/test-helpers";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { planAlign, planMoveBy, planZOrder } from "./arrange";
import { createCommandContext } from "./context";
import { planDuplicate } from "./duplicate";
import { planRemove } from "./remove";
import { planStyle, supportsStyle } from "./style";

const ctxOf = (stored: StoredElement[]) => {
  let n = 0;
  return createCommandContext(stored, { newId: () => `new${++n}` });
};
const edge = (id: string, from: string, to: string, pts: Array<[number, number]>, extra: Record<string, unknown> = {}) =>
  arrow(id, from, to, { points: pts.map(([x, y]) => ({ x, y })), ...extra });
const at = (list: StoredElement[], id: string) => list.find((e) => e.id === id) as DrawingElement;
const ids = (list: StoredElement[]) => list.map((e) => e.id);

const scene = (): StoredElement[] => [
  frame("F", 0, 0, 600, 400),
  rect("a", 100, 100, 100, 60, { frameId: "F" }),
  rect("b", 300, 100, 100, 60, { frameId: "F" }),
  edge("ab", "a", "b", [[200, 130], [300, 130]], { frameId: "F" }),
  rect("out", 800, 100, 100, 60),
  edge("bout", "b", "out", [[400, 130], [800, 130]], { startConnection: { elementId: "b", anchorId: "b-anchor-right" }, endConnection: { elementId: "out", anchorId: "out-anchor-left" } }),
];

describe("moving a frame by command", () => {
  it("a nudge carries what the frame owns and re-routes the connector that leaves it", () => {
    const stored = scene();
    const next = applyPatch(stored, planMoveBy(ctxOf(stored), ["F"], 10, 5)!);
    expect(at(next, "F").points[0]).toEqual({ x: 10, y: 5 });
    expect(at(next, "a").points[0]).toEqual({ x: 110, y: 105 });
    expect(at(next, "ab").points[0]).toEqual({ x: 210, y: 135 });
    expect(at(next, "out").points[0]).toEqual({ x: 800, y: 100 });
    expect(at(next, "bout").points.at(-1)).toMatchObject({ x: 800 }); // still reaches `out`
    expect(at(next, "bout").points[0]).not.toEqual({ x: 400, y: 130 }); // and starts from b's new place
  });

  it("align carries the contents of a frame along with it", () => {
    const stored: StoredElement[] = [...scene().slice(0, 4), rect("ref", 1000, 300, 50, 50)];
    const next = applyPatch(stored, planAlign(ctxOf(stored), ["F", "ref"], "left")!);
    expect(at(next, "F").points[0].x).toBe(0);
    expect(at(next, "ref").points[0].x).toBe(0);
    expect(at(next, "a").points[0].x).toBe(100); // F was already leftmost: nothing moved
  });

  it("does not move locked contents", () => {
    const stored = scene().map((e) => (e.id === "a" ? { ...e, locked: true } : e)) as StoredElement[];
    const next = applyPatch(stored, planMoveBy(ctxOf(stored), ["F"], 10, 0)!);
    expect(at(next, "a").points[0]).toEqual({ x: 100, y: 100 });
    expect(at(next, "b").points[0]).toEqual({ x: 310, y: 100 });
  });
});

describe("deleting a frame by command", () => {
  it("removes the frame, everything inside it and the connectors attached to those", () => {
    const stored = scene();
    expect(ids(applyPatch(stored, planRemove(ctxOf(stored), ["F"])!))).toEqual(["out"]);
  });

  it("deleting a child leaves the frame, and only the connectors attached to it go", () => {
    const stored = scene();
    expect(ids(applyPatch(stored, planRemove(ctxOf(stored), ["a"])!))).toEqual(["F", "b", "out", "bout"]);
  });
});

describe("duplicating a frame", () => {
  it("copies the frame and its contents, with the copies owned by the copy", () => {
    const stored = scene();
    const plan = planDuplicate(ctxOf(stored), new Set(["F"]))!;
    const next = applyPatch(stored, plan.patch);
    const copyOf = (id: string) => plan.idMap.get(id)!;
    expect(at(next, copyOf("F")).type).toBe("frame");
    expect(at(next, copyOf("a")).frameId).toBe(copyOf("F"));
    expect(at(next, copyOf("ab")).frameId).toBe(copyOf("F"));
    expect(at(next, "a").frameId).toBe("F");
    expect(ids(next).indexOf(copyOf("F"))).toBeLessThan(ids(next).indexOf(copyOf("a")));
  });

  it("a copied child stays in its frame, and a copy never points at a locked or missing one", () => {
    const stored = scene();
    const plan = planDuplicate(ctxOf(stored), new Set(["a"]))!;
    expect(at(applyPatch(stored, plan.patch), plan.idMap.get("a")!).frameId).toBe("F");
    const locked = scene().map((e) => (e.id === "F" ? { ...e, locked: true } : e)) as StoredElement[];
    const lockedPlan = planDuplicate(ctxOf(locked), new Set(["a"]))!;
    expect(at(applyPatch(locked, lockedPlan.patch), lockedPlan.idMap.get("a")!).frameId).toBeUndefined();
  });
});

describe("stacking", () => {
  const stack = (): StoredElement[] => [rect("x", 0, 0), ...scene().slice(0, 4), rect("y", 0, 0)];

  it("bringing a frame to the front brings its contents with it, in order, frame first", () => {
    const stored = stack();
    const next = applyPatch(stored, planZOrder(ctxOf(stored), ["F"], "front")!);
    expect(ids(next)).toEqual(["x", "y", "F", "a", "b", "ab"]);
  });

  it("sending a child to the back stops at its frame", () => {
    const stored = stack();
    const patch = planZOrder(ctxOf(stored), ["b"], "back");
    const next = patch ? applyPatch(stored, patch) : stored;
    expect(ids(next).indexOf("F")).toBeLessThan(ids(next).indexOf("b"));
  });
});

<<<<<<< HEAD
describe("a locked frame covers its contents", () => {
  const locked = (): StoredElement[] => scene().map((e) => (e.id === "F" ? ({ ...e, locked: true } as StoredElement) : e));

  it("refuses to move, restack or delete what it owns, and moves nothing when the frame itself is nudged", () => {
    expect(planMoveBy(ctxOf(locked()), ["a"], 10, 0)).toBeNull();
    expect(planMoveBy(ctxOf(locked()), ["F"], 10, 0)).toBeNull();
    expect(planRemove(ctxOf(locked()), ["a"])).toBeNull();
  });

  it("still moves what is outside it", () => {
    expect(planMoveBy(ctxOf(locked()), ["out"], 10, 0)).not.toBeNull();
  });
});

=======
describe("styling a frame by command", () => {
  it("takes corner radius, fill, stroke and opacity, and leaves what it owns alone", () => {
    const stored = scene();
    const plan = planStyle(ctxOf(stored), ["F"], { cornerRadius: 16, fill: "#dbeafe", color: "#ef4444", opacity: 0.5 }, { strict: true });
    expect(supportsStyle(at(stored, "F"), "cornerRadius")).toBe(true);
    const after = applyPatch(stored, plan.patch!);
    expect(at(after, "F")).toMatchObject({ cornerRadius: 16, fill: "#dbeafe", color: "#ef4444", opacity: 0.5 });
    expect(at(after, "a")).toEqual(at(stored, "a"));
  });
});
>>>>>>> origin/main
