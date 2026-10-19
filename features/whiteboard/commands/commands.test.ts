import { describe, expect, it } from "vitest";
import { applyPatch } from "@/core/groups/patch";
import { buildGroupIndex } from "@/core/groups/group-index";
import { isEffectivelyHidden, hasHidden, hiddenShapeIds, visibleShapes } from "@/core/groups/visibility";
import { group, rect } from "@/core/groups/test-helpers";
import { createShape } from "@/core/shapes/shape-runtime";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { collectCopySet, cloneElements, spacingOffsets } from "@/features/whiteboard/utils/arrange";
import { planMoveBy, planSpacing, planZOrder, planAlign, planDistribute } from "./arrange";
import { createCommandContext, type CommandContext } from "./context";
import { connectorsBetween, facingSides, labelOf, planConnectorLabel, planCreateConnector, planDetach, planReroute, planUpdateConnector } from "./connectors";
import { planDuplicate } from "./duplicate";
import { planFrame } from "./frame";
import { isLayoutNode, planAutoLayout, planTidy } from "./layout";
import { planRemove } from "./remove";
import { planStyle, supportsStyle } from "./style";
import { planHide, planShow, planShowAll } from "./visibility";

let counter = 0;
const ctxOf = (stored: StoredElement[]): CommandContext => createCommandContext(stored, { newId: () => `n${(counter += 1)}` });
const boxes = (stored: readonly StoredElement[]) =>
  Object.fromEntries((stored as DrawingElement[]).filter((e) => e.points.length >= 2).map((e) => [e.id, { x: e.points[0].x, y: e.points[0].y, w: e.points[1].x - e.points[0].x, h: e.points[1].y - e.points[0].y }]));
const node = (id: string, x: number, y: number, w = 100, h = 60, extra: Record<string, unknown> = {}) =>
  ({ ...createShape("semantic-node", { id, label: id.toUpperCase(), points: [{ x, y }, { x: x + w, y: y + h }] }), ...extra }) as DrawingElement;

describe("spacing, align and distribute commands", () => {
  it("spacingOffsets sets the exact gap and keeps the first item", () => {
    const items = [
      { id: "a", bounds: { minX: 0, minY: 0, maxX: 50, maxY: 10, width: 50, height: 10 }, leaves: ["a"], locked: false },
      { id: "b", bounds: { minX: 200, minY: 0, maxX: 250, maxY: 10, width: 50, height: 10 }, leaves: ["b"], locked: false },
      { id: "c", bounds: { minX: 300, minY: 0, maxX: 350, maxY: 10, width: 50, height: 10 }, leaves: ["c"], locked: false },
    ];
    const offsets = spacingOffsets(items, "horizontal", 20);
    expect(offsets.get("a")).toBeUndefined();
    expect(offsets.get("b")).toEqual({ dx: -130, dy: 0 });
    expect(offsets.get("c")).toEqual({ dx: -160, dy: 0 });
  });

  it("planSpacing moves units, groups as one, and re-routes the connectors that follow", () => {
    const stored = [rect("a", 0, 0, 50, 50, { groupId: "g" }), rect("b", 60, 0, 50, 50, { groupId: "g" }), group("g"), rect("c", 400, 0, 50, 50)];
    const patch = planSpacing(ctxOf(stored), ["g", "c", "a", "b"].filter((id) => id !== "g"), "horizontal", 30)!;
    const after = boxes(applyPatch(stored, patch));
    expect(after.c.x).toBe(140);
    expect(after.b.x - after.a.x).toBe(60);
  });

  it("returns null when nothing would move or nothing is movable", () => {
    const stored = [rect("a", 0, 0, 50, 50), rect("b", 80, 0, 50, 50)];
    expect(planSpacing(ctxOf(stored), ["a", "b"], "horizontal", 30)).toBeNull();
    expect(planSpacing(ctxOf([rect("a", 0, 0, 50, 50, { locked: true }), rect("b", 90, 0, 50, 50, { locked: true })]), ["a", "b"], "horizontal", 30)).toBeNull();
  });

  it("align and distribute leave locked units alone", () => {
    const stored = [rect("a", 0, 0, 50, 50), rect("b", 100, 40, 50, 50, { locked: true }), rect("c", 300, 90, 50, 50)];
    const aligned = boxes(applyPatch(stored, planAlign(ctxOf(stored), ["a", "b", "c"], "top")!));
    expect(aligned.b.y).toBe(40);
    expect(aligned.a.y).toBe(0);
    // a locked unit is left out of distribution, which leaves two: nothing to distribute
    expect(planDistribute(ctxOf(stored), ["a", "b", "c"], "horizontal")).toBeNull();
  });

  it("planMoveBy refuses locked shapes and planZOrder restacks only unlocked ones", () => {
    const stored = [rect("a", 0, 0, 50, 50, { locked: true }), rect("b", 100, 0, 50, 50), rect("c", 200, 0, 50, 50)];
    expect(planMoveBy(ctxOf(stored), ["a"], 10, 0)).toBeNull();
    expect(planZOrder(ctxOf(stored), ["a"], "front")).toBeNull();
    expect(planZOrder(ctxOf(stored), ["b"], "front")!.order).toEqual(["a", "c", "b"]);
  });
});

describe("planStyle", () => {
  it("applies the standard properties, opacity as a stored value only below 1, and node radius to nodeStyle", () => {
    const stored = [rect("r", 0, 0, 50, 50, { opacity: 0.5 }), node("n", 100, 0)];
    const plan = planStyle(ctxOf(stored), ["r", "n"], { opacity: 1, cornerRadius: 14, fill: null }, { strict: true });
    const after = applyPatch(stored, plan.patch!) as DrawingElement[];
    expect(after[0]).not.toHaveProperty("opacity");
    expect((after[0] as unknown as { cornerRadius: number }).cornerRadius).toBe(14);
    expect((after[1] as unknown as { nodeStyle: unknown }).nodeStyle).toEqual({ cornerRadius: 14 });
    expect(after[1].fill).toBeUndefined();
  });

  it("strict mode skips whole elements that cannot take a property; lenient mode (the toolbar) sets what it can", () => {
    const text = { id: "t", type: "text", points: [{ x: 0, y: 0 }], text: "x", color: "#000", strokeWidth: 1 } as unknown as DrawingElement;
    const stored = [rect("r", 0, 0, 50, 50), text];
    expect(supportsStyle(text, "fill")).toBe(false);
    expect(supportsStyle(text, "fontSize")).toBe(true);
    const strict = planStyle(ctxOf(stored), ["r", "t"], { fill: "#fff000" }, { strict: true });
    expect(strict.unsupported).toEqual([{ id: "t", keys: ["fill"] }]);
    expect(strict.changed).toEqual(["r"]);
    const lenient = planStyle(ctxOf(stored), ["r", "t"], { fill: "#fff000" }, { strict: false });
    expect(lenient.changed).toEqual(["r", "t"]);
  });

  it("reports locked and missing ids without editing them", () => {
    const plan = planStyle(ctxOf([rect("a", 0, 0, 5, 5, { locked: true })]), ["a", "zz"], { color: "#ff0000" }, { strict: true });
    expect(plan).toMatchObject({ patch: null, locked: ["a"], missing: ["zz"] });
  });
});

describe("connector commands", () => {
  const two = () => [node("a", 0, 0, 100, 60), node("b", 300, 0, 100, 60), node("c", 300, 200, 100, 60)];

  it("facingSides picks the sides that look at each other along the longer axis", () => {
    const box = (x: number, y: number) => ({ minX: x, minY: y, maxX: x + 10, maxY: y + 10, width: 10, height: 10 });
    expect(facingSides(box(0, 0), box(100, 20))).toEqual({ from: "right", to: "left" });
    expect(facingSides(box(0, 0), box(20, 100))).toEqual({ from: "bottom", to: "top" });
    expect(facingSides(box(100, 0), box(0, 0))).toEqual({ from: "left", to: "right" });
  });

  it("planCreateConnector attaches at the element's own anchors and reports why it cannot", () => {
    const ctx = ctxOf(two());
    const plan = planCreateConnector(ctx, { id: "ab", from: { id: "a" }, to: { id: "b" }, label: "calls" });
    expect("reason" in plan).toBe(false);
    if ("reason" in plan) return;
    expect(plan.patch.add.map((e) => e.id)).toEqual(["ab", "ab-label"]);
    expect(plan.from).toEqual({ id: "a", side: "right" });
    expect(planCreateConnector(ctx, { from: { id: "a" }, to: { id: "a" } })).toEqual({ reason: "same_element", id: "a" });
    expect(planCreateConnector(ctx, { from: { id: "a" }, to: { id: "nope" } })).toEqual({ reason: "missing", id: "nope" });
  });

  it("labels: set, change, remove, and follow the connector when it is re-routed", () => {
    let stored: StoredElement[] = two();
    const created = planCreateConnector(ctxOf(stored), { id: "ab", from: { id: "a" }, to: { id: "b" } });
    if ("reason" in created) throw new Error("setup");
    stored = applyPatch(stored, created.patch);
    const setLabel = planConnectorLabel(ctxOf(stored), "ab", "hello")!;
    stored = applyPatch(stored, setLabel.patch);
    expect(labelOf(ctxOf(stored), stored.find((e) => e.id === "ab") as DrawingElement)?.text).toBe("hello");
    const moved = planMoveBy(ctxOf(stored), ["b"], 0, 300)!;
    const after = applyPatch(stored, moved) as DrawingElement[];
    expect(after.find((e) => e.id === "ab-label")!.points[0]).not.toEqual((stored as DrawingElement[]).find((e) => e.id === "ab-label")!.points[0]);
    const removed = planConnectorLabel(ctxOf(stored), "ab", "")!;
    expect(removed.patch.remove).toEqual(["ab-label"]);
    expect(planConnectorLabel(ctxOf(stored), "a", "x")).toBeNull();
  });

  it("planUpdateConnector re-attaches an end and keeps its other end; planReroute fixes a stale path; planDetach frees the ends", () => {
    let stored: StoredElement[] = two();
    const created = planCreateConnector(ctxOf(stored), { id: "ab", from: { id: "a" }, to: { id: "b" } });
    if ("reason" in created) throw new Error("setup");
    stored = applyPatch(stored, created.patch);
    const updated = planUpdateConnector(ctxOf(stored), "ab", { to: { id: "c", side: "top" } });
    if ("reason" in updated) throw new Error("update");
    const arrow = applyPatch(stored, updated.patch).find((e) => e.id === "ab") as DrawingElement & { startConnection: { elementId: string }; endConnection: { elementId: string } };
    expect([arrow.startConnection.elementId, arrow.endConnection.elementId]).toEqual(["a", "c"]);
    expect(planUpdateConnector(ctxOf(stored), "a", { change: { dashed: true } })).toEqual({ reason: "not_a_connector", id: "a" });

    const stale = stored.map((e) => (e.id === "b" ? ({ ...e, points: [{ x: 300, y: 100 }, { x: 400, y: 160 }] } as DrawingElement) : e));
    const fixed = planReroute(ctxOf(stale), ["ab"], { forgetManual: false });
    expect(fixed.changed).toEqual(["ab"]);

    const detached = applyPatch(stored, planDetach(ctxOf(stored), ["ab"])!).find((e) => e.id === "ab") as DrawingElement & { startConnection?: unknown };
    expect(detached.startConnection).toBeUndefined();
    expect(connectorsBetween(ctxOf(stored), "a", "b", true)).toHaveLength(1);
    expect(connectorsBetween(ctxOf(stored), "b", "a", true)).toHaveLength(0);
    expect(connectorsBetween(ctxOf(stored), "b", "a", false)).toHaveLength(1);
  });
});

describe("hide and show", () => {
  it("hides units, skips locked and already-hidden ones, and shows with the same cascade as unlock", () => {
    const stored = [rect("a", 0, 0, 5, 5, { groupId: "g" }), rect("b", 10, 0, 5, 5, { groupId: "g" }), group("g"), rect("l", 40, 0, 5, 5, { locked: true })];
    const hidden = applyPatch(stored, planHide(ctxOf(stored), ["a", "b", "l"])!);
    expect(hidden.find((e) => e.id === "g")!.hidden).toBe(true);
    expect(hidden.find((e) => e.id === "l")!.hidden).toBeUndefined();
    expect(planHide(ctxOf(hidden), ["a", "b"])).toBeNull();
    const shown = applyPatch(hidden, planShow(ctxOf(hidden), ["a"])!);
    expect(shown.some((e) => e.hidden)).toBe(false);
    expect(planShow(ctxOf(stored), ["a"])).toBeNull();
  });

  it("shows everything at once, and derives hidden connectors and visibleShapes", () => {
    const stored = [rect("a", 0, 0, 5, 5, { hidden: true }), rect("b", 100, 0, 5, 5), { ...rect("c", 0, 0), type: "arrow", startConnection: { elementId: "a" }, endConnection: { elementId: "b" } } as DrawingElement];
    const index = buildGroupIndex(stored);
    expect(hasHidden(stored)).toBe(true);
    expect(hiddenShapeIds(index)).toEqual(["a"]);
    expect(isEffectivelyHidden(index, "c")).toBe(true);
    expect(visibleShapes(stored as DrawingElement[], index).map((e) => e.id)).toEqual(["b"]);
    const all = applyPatch(stored, planShowAll(ctxOf(stored))!);
    expect(hasHidden(all)).toBe(false);
    expect(planShowAll(ctxOf(all))).toBeNull();
  });
});

describe("planFrame", () => {
  it("surrounds the content with padding and a title strip, without touching it", () => {
    const stored = [rect("a", 100, 100, 100, 50), rect("b", 300, 100, 100, 50)];
    const plan = planFrame(ctxOf(stored), ["a", "b"], { title: "Zone", id: "z", padding: 20 })!;
    expect(plan.patch.update).toEqual([]);
    const frame = (plan.patch.add[0] as DrawingElement).points;
    expect(frame[0].x).toBe(80);
    expect(frame[1].x).toBe(420);
    expect(frame[0].y).toBeLessThan(80);
    expect(plan.patch.add[1]).toMatchObject({ id: "z-label", text: "Zone", ai: { role: "group-label" } });
    expect(planFrame(ctxOf(stored), [], { title: "x" })).toBeNull();
  });
});

describe("planAutoLayout and planTidy", () => {
  const diagram = () => {
    let stored: StoredElement[] = [node("a", 0, 400), node("b", 700, 20), node("c", 90, 900), node("d", 500, 600)];
    for (const [id, from, to] of [["ab", "a", "b"], ["bc", "b", "c"], ["bd", "b", "d"]] as const) {
      const plan = planCreateConnector(ctxOf(stored), { id, from: { id: from }, to: { id: to } });
      if ("reason" in plan) throw new Error("setup");
      stored = applyPatch(stored, plan.patch);
    }
    return stored;
  };

  it("only counts connectable boxes as layout nodes", () => {
    expect(isLayoutNode(rect("r", 0, 0))).toBe(true);
    expect(isLayoutNode({ ...rect("t", 0, 0), type: "text", points: [{ x: 0, y: 0 }] } as DrawingElement)).toBe(false);
    expect(isLayoutNode(rect("g", 0, 0, 10, 10, { isGuide: true }))).toBe(false);
  });

  it("layered puts sources above what they feed, keeps sizes, and routes connectors afterwards", () => {
    const stored = diagram();
    const plan = planAutoLayout(ctxOf(stored), null, { algorithm: "layered", direction: "down", gap: 50 });
    const after = applyPatch(stored, plan.patch!);
    const b = boxes(after);
    expect(b.a.y).toBeLessThan(b.b.y);
    expect(b.b.y).toBeLessThan(b.c.y);
    expect(b.c.y).toBe(b.d.y);
    expect([b.a.w, b.a.h]).toEqual([100, 60]);
    const arrow = after.find((e) => e.id === "ab") as DrawingElement;
    expect(arrow.points.at(-1)!.y).toBeGreaterThan(b.b.y - 1);
  });

  it("falls back to a grid, with a note, when nothing is connected, and refuses fewer than two", () => {
    const stored = [node("a", 0, 0), node("b", 5, 5), node("c", 9, 9)];
    const plan = planAutoLayout(ctxOf(stored), null, { algorithm: "layered" });
    expect(plan.notes.join(" ")).toContain("grid");
    expect(plan.patch).not.toBeNull();
    expect(planAutoLayout(ctxOf([node("a", 0, 0)]), null, { algorithm: "row" })).toMatchObject({ patch: null });
  });

  it("is deterministic: the same board gives the same layout", () => {
    const run = () => JSON.stringify(applyPatch(diagram(), planAutoLayout(ctxOf(diagram()), null, { algorithm: "layered" }).patch!));
    expect(run()).toBe(run());
  });

  it("tidy snaps rows, separates overlaps, never changes ids or connections, and does nothing to a tidy board", () => {
    const stored = [node("a", 0, 4), node("b", 200, -3), node("c", 410, 2), node("x", 405, 20)];
    const plan = planTidy(ctxOf(stored), null, { minGap: 30 });
    const after = boxes(applyPatch(stored, plan.patch!));
    expect(new Set([after.a.y, after.b.y]).size).toBe(1);
    expect(after.x.x >= after.c.x + after.c.w + 29 || after.x.y >= after.c.y + after.c.h + 29 || after.c.y >= after.x.y + after.x.h + 29 || after.c.x >= after.x.x + after.x.w + 29).toBe(true);
    const tidy = [node("a", 0, 0), node("b", 300, 0)];
    expect(planTidy(ctxOf(tidy), null).patch).toBeNull();
  });
});

describe("planRemove and copying", () => {
  const labelled = () => {
    let stored: StoredElement[] = [node("a", 0, 0), node("b", 300, 0), node("c", 600, 0)];
    for (const [id, from, to, label] of [["ab", "a", "b", "x"], ["bc", "b", "c", undefined]] as const) {
      const plan = planCreateConnector(ctxOf(stored), { id, from: { id: from }, to: { id: to }, label });
      if ("reason" in plan) throw new Error("setup");
      stored = applyPatch(stored, plan.patch);
    }
    return stored;
  };

  it("removes attached connectors and their labels, keeps unrelated elements, and respects locks", () => {
    const stored = labelled();
    const patch = planRemove(ctxOf(stored), ["a"])!;
    expect(patch.remove.sort()).toEqual(["a", "ab", "ab-label"]);
    expect(planRemove(ctxOf(stored.map((e) => (e.id === "a" ? ({ ...e, locked: true } as DrawingElement) : e))), ["a"])).toBeNull();
    expect(planRemove(ctxOf(stored), ["ab"])!.remove.sort()).toEqual(["ab", "ab-label"]);
  });

  it("a copied connector keeps its label, linked to the copy and not to the original", () => {
    const stored = labelled();
    const plan = planDuplicate(ctxOf(stored), new Set(["a", "b"]))!;
    const copies = plan.patch.add as DrawingElement[];
    const arrowCopy = copies.find((e) => e.type === "arrow")!;
    const labelCopy = copies.find((e) => e.ai?.role === "edge-label")!;
    expect(labelCopy.ai?.semanticId).toBe(`${arrowCopy.id}-label`);
    expect(labelOf({ shapes: [...(stored as DrawingElement[]), ...copies] }, arrowCopy)?.id).toBe(labelCopy.id);
    expect(labelOf({ shapes: [...(stored as DrawingElement[]), ...copies] }, stored.find((e) => e.id === "ab") as DrawingElement)?.id).toBe("ab-label");
  });

  it("collectCopySet finds the label of a hand-made connector (no semantic id) and cloneElements relinks it", () => {
    const stored = labelled() as DrawingElement[];
    const set = collectCopySet(stored, new Set(["a", "b"]));
    expect(set.map((e) => e.id).sort()).toEqual(["a", "ab", "ab-label", "b"]);
    let n = 0;
    const clones = cloneElements(set, { dx: 5, dy: 5 }, () => `k${(n += 1)}`);
    const arrow = clones.find((e) => e.type === "arrow")!;
    expect(clones.find((e) => e.ai?.role === "edge-label")!.ai?.semanticId).toBe(`${arrow.id}-label`);
  });
});
