import { describe, expect, it } from "vitest";
import { checkPatch } from "@/features/canvas-tools/integrity";
import { applyPatch } from "@/core/groups/patch";
import { planGroup } from "@/core/groups/group-commands";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import type { FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  addToFrame,
  createFrame,
  deleteFrame,
  fitFrameToContent,
  frameSelection,
  listFrameContents,
  listFrames,
  moveFrame,
  nestFrame,
  planAutoFit,
  removeFromFrame,
  renameFrame,
  reparentMoved,
  resizeFrame,
  fitFrames,
  updateFrame,
  updateFrames,
} from "./frame-api";
import { buildFrameIndex } from "./frame-index";
import { FRAME_DEFAULTS, frameBox } from "./frame-model";
import { box } from "./test-box";
import { byId, frame, ids, must } from "./test-helpers";

/** Applies a result and checks the stored list is still a valid board. */
const apply = (stored: StoredElement[], result: { ok: boolean; patch?: Parameters<typeof applyPatch>[1] }) => {
  const ok = must(result as { ok: true; patch: Parameters<typeof applyPatch>[1] });
  expect(checkPatch(stored, ok.patch)).toEqual([]);
  return applyPatch(stored, ok.patch);
};

/** A connector with a path between two points (the shared helper's default path sits at the origin). */
const edge = (id: string, from: string, to: string, points: Array<[number, number]>, extra: Record<string, unknown> = {}) =>
  arrow(id, from, to, { points: points.map(([x, y]) => ({ x, y })), ...extra });

const twoNodes = (): StoredElement[] => [rect("a", 100, 100, 100, 60), rect("b", 300, 100, 100, 60), edge("ab", "a", "b", [[200, 130], [300, 130]]), rect("far", 2000, 2000, 50, 50)];

describe("createFrame", () => {
  it("adds a frame with defaults and nothing else", () => {
    const stored = twoNodes();
    const result = must(createFrame(stored, { id: "f", box: box(0, 0, 500, 400), title: "Auth" }));
    const next = apply(stored, result);
    const f = byId(next, "f") as FrameShape;
    expect(f.type).toBe("frame");
    expect(f.title).toBe("Auth");
    expect(frameBox(f)).toMatchObject({ minX: 0, minY: 0, maxX: 500, maxY: 400 });
    expect(result.adopted).toEqual([]);
    expect(next.filter((e) => e.id !== "f")).toEqual(stored);
  });

  it("grows a click-sized box to the minimum size", () => {
    const next = apply([], createFrame([], { id: "f", box: box(10, 10, 14, 14) }));
    expect(frameBox(byId(next, "f") as FrameShape)).toMatchObject({ width: FRAME_DEFAULTS.minWidth, height: FRAME_DEFAULTS.minHeight });
  });

  it("adopts what lies inside when asked: shapes by centre, connectors by both ends, and puts the frame underneath", () => {
    const stored = twoNodes();
    const result = must(createFrame(stored, { id: "f", box: box(50, 50, 450, 250), adopt: true }));
    const next = apply(stored, result);
    expect(result.adopted.sort()).toEqual(["a", "ab", "b"]);
    expect(byId(next, "far").frameId).toBeUndefined();
    expect(ids(next).indexOf("f")).toBeLessThan(ids(next).indexOf("a"));
    expect(buildFrameIndex(next).childrenOf.get("f")).toEqual(["a", "b", "ab"]);
  });

  it("does not adopt a connector with only one end inside", () => {
    const stored = twoNodes();
    const next = apply(stored, createFrame(stored, { id: "f", box: box(50, 50, 250, 250), adopt: true }));
    expect(byId(next, "a").frameId).toBe("f");
    expect(byId(next, "b").frameId).toBeUndefined();
    expect(byId(next, "ab").frameId).toBeUndefined();
  });

  it("does not adopt locked elements", () => {
    const stored = [rect("a", 100, 100, 100, 60, { locked: true })];
    const result = must(createFrame(stored, { id: "f", box: box(0, 0, 400, 400), adopt: true }));
    expect(result.adopted).toEqual([]);
  });

  it("nests in a parent frame and adopts only what that parent owns", () => {
    let stored: StoredElement[] = [frame("p", 0, 0, 1000, 800), rect("in", 100, 100, 50, 50, { frameId: "p" }), rect("loose", 120, 120, 50, 50)];
    stored = apply(stored, createFrame(stored, { id: "c", box: box(80, 80, 300, 300), parent: "p", adopt: true }));
    expect(byId(stored, "c").frameId).toBe("p");
    expect(byId(stored, "in").frameId).toBe("c");
    expect(byId(stored, "loose").frameId).toBeUndefined();
  });

  it("fits an auto-fit frame to what it adopts", () => {
    const stored = twoNodes();
    const next = apply(stored, createFrame(stored, { id: "f", box: box(0, 0, 600, 600), adopt: true, style: { autoFit: true, padding: 10 } }));
    expect(frameBox(byId(next, "f") as FrameShape)).toMatchObject({ minX: 90, maxX: 410, maxY: 170, minY: 100 - 10 - FRAME_DEFAULTS.headerHeight });
  });

  it("refuses bad input with a reason", () => {
    const stored = [frame("f", 0, 0), frame("locked", 0, 0, 100, 100, { locked: true })];
    expect(createFrame(stored, { id: "f", box: box(0, 0, 10, 10) })).toMatchObject({ ok: false, code: "exists" });
    expect(createFrame(stored, { id: "", box: box(0, 0, 10, 10) })).toMatchObject({ ok: false, code: "invalid" });
    expect(createFrame(stored, { id: "n", box: box(0, 0, Number.NaN, 10) })).toMatchObject({ ok: false, code: "invalid" });
    expect(createFrame(stored, { id: "n", box: box(0, 0, 0, 10) })).toMatchObject({ ok: false, code: "invalid" });
    expect(createFrame(stored, { id: "n", box: box(0, 0, 90, 90), parent: "missing" })).toMatchObject({ ok: false, code: "not_found" });
    expect(createFrame([rect("a", 0, 0)], { id: "n", box: box(0, 0, 90, 90), parent: "a" })).toMatchObject({ ok: false, code: "not_a_frame" });
    expect(createFrame(stored, { id: "n", box: box(0, 0, 90, 90), parent: "locked" })).toMatchObject({ ok: false, code: "locked" });
    expect(createFrame(stored, { id: "n", box: box(0, 0, 90, 90), style: { titlePlacement: "left" as never } })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("updateFrame and renameFrame", () => {
  it("renames, trims, and clears back to the default title", () => {
    let stored: StoredElement[] = [frame("f", 0, 0)];
    stored = apply(stored, renameFrame(stored, "f", "  Billing  "));
    expect((byId(stored, "f") as FrameShape).title).toBe("Billing");
    stored = apply(stored, renameFrame(stored, "f", "   "));
    expect("title" in byId(stored, "f")).toBe(false);
  });

  it("reports an unchanged update as unchanged and writes nothing", () => {
    const stored = [frame("f", 0, 0, 400, 300, { title: "A" })];
    const result = must(renameFrame(stored, "f", "A"));
    expect(result.changed).toBe(false);
    expect(result.patch.update).toEqual([]);
  });

  it("clamps numbers, clears optional fields with null, and rejects the wrong types", () => {
    let stored: StoredElement[] = [frame("f", 0, 0, 400, 300, { fill: "#fff" })];
    stored = apply(stored, updateFrame(stored, "f", { padding: 9999, cornerRadius: -3, opacity: 0.5, fill: null, preset: "section", titlePlacement: "above" }));
    const f = byId(stored, "f") as FrameShape;
    expect(f).toMatchObject({ padding: 400, cornerRadius: 0, opacity: 0.5, preset: "section", titlePlacement: "above" });
    expect("fill" in f).toBe(false);
    expect(updateFrame(stored, "f", { padding: Number.NaN })).toMatchObject({ ok: false, code: "invalid" });
    expect(updateFrame(stored, "f", { autoFit: "yes" as never })).toMatchObject({ ok: false, code: "invalid" });
    expect(updateFrame(stored, "f", { preset: "zzz" as never })).toMatchObject({ ok: false, code: "invalid" });
    expect(updateFrame(stored, "f", { color: "" })).toMatchObject({ ok: false, code: "invalid" });
    expect(updateFrame(stored, "nope", { padding: 1 })).toMatchObject({ ok: false, code: "not_found" });
    expect(updateFrame([rect("r", 0, 0)], "r", { padding: 1 })).toMatchObject({ ok: false, code: "not_a_frame" });
  });

  it("refuses to change a locked frame", () => {
    expect(renameFrame([frame("f", 0, 0, 100, 100, { locked: true })], "f", "x")).toMatchObject({ ok: false, code: "locked" });
  });

  it("re-fits an auto-fit frame when padding changes, and the frames around it", () => {
    let stored: StoredElement[] = [
      frame("outer", 0, 0, 900, 900, { autoFit: true, padding: 10, headerVisible: false }),
      frame("inner", 80, 80, 300, 300, { frameId: "outer", autoFit: true, padding: 10, headerVisible: false }),
      rect("a", 100, 100, 100, 100, { frameId: "inner" }),
    ];
    stored = apply(stored, fitFrameToContent(stored, "inner"));
    expect(frameBox(byId(stored, "inner") as FrameShape)).toMatchObject({ minX: 90, minY: 90, maxX: 210, maxY: 210 });
    expect(frameBox(byId(stored, "outer") as FrameShape)).toMatchObject({ minX: 80, minY: 80, maxX: 220, maxY: 220 });
    stored = apply(stored, updateFrame(stored, "inner", { padding: 30 }));
    expect(frameBox(byId(stored, "inner") as FrameShape)).toMatchObject({ minX: 70, maxX: 230 });
    expect(frameBox(byId(stored, "outer") as FrameShape)).toMatchObject({ minX: 60, maxX: 240 });
  });

  it("fits at once when auto-fit is switched on", () => {
    let stored: StoredElement[] = [frame("f", 0, 0, 900, 900, { headerVisible: false, padding: 0 }), rect("a", 100, 100, 100, 100, { frameId: "f" })];
    stored = apply(stored, updateFrame(stored, "f", { autoFit: true, minWidth: 10, minHeight: 10 }));
    expect(frameBox(byId(stored, "f") as FrameShape)).toMatchObject({ minX: 100, maxX: 200, minY: 100, maxY: 200 });
  });
});

describe("moveFrame", () => {
  const nested = (): StoredElement[] => [
    frame("f", 0, 0, 600, 400),
    rect("a", 100, 100, 100, 60, { frameId: "f" }),
    rect("b", 300, 100, 100, 60, { frameId: "f" }),
    edge("ab", "a", "b", [[200, 130], [300, 130]], { frameId: "f" }),
    rect("out", 800, 100, 100, 60),
    edge("bout", "b", "out", [[400, 130], [800, 130]]),
  ];

  it("moves the frame and everything it owns, as one patch, and leaves the rest", () => {
    const stored = nested();
    const result = must(moveFrame(stored, "f", 10, 20));
    const next = apply(stored, result);
    expect(frameBox(byId(next, "f") as FrameShape)).toMatchObject({ minX: 10, minY: 20 });
    expect(byId(next, "a").points[0]).toEqual({ x: 110, y: 120 });
    expect(byId(next, "ab").points).toEqual([{ x: 210, y: 150 }, { x: 310, y: 150 }]);
    expect(byId(next, "out").points[0]).toEqual({ x: 800, y: 100 });
    expect(result.moved.sort()).toEqual(["a", "ab", "b", "f"]);
  });

  it("hands a connector that also touches the outside to the router instead of moving it", () => {
    const result = must(moveFrame(nested(), "f", 10, 0));
    expect(result.reroute).toEqual(["bout"]);
    expect(result.patch.update.map((u) => u.id)).not.toContain("bout");
  });

  it("carries a connector that no one owns when both of its ends are inside", () => {
    const stored = nested().map((e) => (e.id === "ab" ? { ...e, frameId: undefined } : e)) as StoredElement[];
    expect(must(moveFrame(stored, "f", 5, 5)).moved).toContain("ab");
  });

  it("moves nested frames with their contents", () => {
    const stored: StoredElement[] = [frame("o", 0, 0, 800, 600), frame("i", 50, 50, 300, 200, { frameId: "o" }), rect("a", 60, 100, 50, 50, { frameId: "i" })];
    const next = apply(stored, moveFrame(stored, "o", 100, 0));
    expect(byId(next, "a").points[0]).toEqual({ x: 160, y: 100 });
    expect(frameBox(byId(next, "i") as FrameShape)).toMatchObject({ minX: 150 });
  });

  it("is empty for a zero move and refuses a locked frame or locked content", () => {
    expect(must(moveFrame(nested(), "f", 0, 0)).patch.update).toEqual([]);
    expect(moveFrame(nested(), "f", Number.NaN, 0)).toMatchObject({ ok: false, code: "invalid" });
    const locked = nested().map((e) => (e.id === "a" ? { ...e, locked: true } : e)) as StoredElement[];
    expect(moveFrame(locked, "f", 1, 1)).toMatchObject({ ok: false, code: "locked" });
  });

  it("keeps a grouped shape's group intact", () => {
    let stored: StoredElement[] = [frame("f", 0, 0, 600, 400), rect("a", 100, 100, 50, 50, { frameId: "f" }), rect("b", 200, 100, 50, 50, { frameId: "f" })];
    stored = applyPatch(stored, planGroup(stored, ["a", "b"], () => "g")!.patch);
    const next = apply(stored, moveFrame(stored, "f", 7, 0));
    expect(byId(next, "a").groupId).toBe("g");
    expect(next.some((e) => e.id === "g")).toBe(true);
  });
});

describe("resizeFrame and fitFrameToContent", () => {
  it("resizes by hand, honouring the minimum, without touching contents", () => {
    const stored: StoredElement[] = [frame("f", 0, 0, 400, 300), rect("a", 100, 100, 50, 50, { frameId: "f" })];
    const result = must(resizeFrame(stored, "f", box(0, 0, 20, 20)));
    expect(result.box).toMatchObject({ width: FRAME_DEFAULTS.minWidth, height: FRAME_DEFAULTS.minHeight });
    const next = apply(stored, result);
    expect(byId(next, "a")).toEqual(byId(stored, "a"));
    expect(byId(next, "a").frameId).toBe("f");
  });

  it("refuses to size an auto-fit frame by hand, and bad boxes", () => {
    expect(resizeFrame([frame("f", 0, 0, 400, 300, { autoFit: true })], "f", box(0, 0, 100, 100))).toMatchObject({ ok: false, code: "auto_fit" });
    expect(resizeFrame([frame("f", 0, 0)], "f", box(5, 5, 5, 50))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("fits around contents with padding and room for an inside header", () => {
    const stored: StoredElement[] = [frame("f", 0, 0, 1000, 1000, { padding: 20 }), rect("a", 100, 100, 100, 60, { frameId: "f" }), rect("b", 300, 200, 100, 60, { frameId: "f" })];
    const next = apply(stored, fitFrameToContent(stored, "f"));
    expect(frameBox(byId(next, "f") as FrameShape)).toMatchObject({ minX: 80, maxX: 420, maxY: 280, minY: 100 - 20 - FRAME_DEFAULTS.headerHeight });
  });

  it("leaves an empty frame alone", () => {
    const result = must(fitFrameToContent([frame("f", 0, 0)], "f"));
    expect(result.changed).toBe(false);
  });

  it("planAutoFit re-fits only the auto-fit frames above a changed element", () => {
    const stored: StoredElement[] = [
      frame("auto", 0, 0, 300, 300, { autoFit: true, padding: 10, headerVisible: false }),
      frame("manual", 400, 0, 300, 300),
      rect("a", 100, 100, 100, 100, { frameId: "auto" }),
      rect("m", 500, 100, 50, 50, { frameId: "manual" }),
    ];
    const patch = planAutoFit(stored, ["a", "m"])!;
    expect(patch.update.map((u) => u.id)).toEqual(["auto"]);
    expect(planAutoFit(applyPatch(stored, patch), ["a"])).toBeNull();
  });
});

describe("ownership: addToFrame, removeFromFrame, nestFrame", () => {
  const base = (): StoredElement[] => [frame("f", 0, 0, 500, 400), frame("g", 600, 0, 500, 400), rect("a", 10, 50, 50, 50), rect("b", 100, 50, 50, 50), rect("c", 700, 50, 50, 50, { frameId: "g" })];

  it("moves an element from one frame to another without moving it", () => {
    const stored = base();
    const next = apply(stored, addToFrame(stored, "f", ["a", "c"]));
    expect(byId(next, "a").frameId).toBe("f");
    expect(byId(next, "c").frameId).toBe("f");
    expect(byId(next, "c").points).toEqual(byId(stored, "c").points);
  });

  it("puts the frame under what it now owns", () => {
    const stored: StoredElement[] = [rect("a", 10, 50, 50, 50), frame("f", 0, 0, 500, 400)];
    const next = apply(stored, addToFrame(stored, "f", ["a"]));
    expect(ids(next)).toEqual(["f", "a"]);
  });

  it("reports what it skipped", () => {
    const stored = base().map((e) => (e.id === "b" ? { ...e, locked: true } : e)) as StoredElement[];
    const result = must(addToFrame(stored, "f", ["a", "b", "ghost"]));
    expect(result.changed).toEqual(["a"]);
    expect(result.skipped).toEqual(expect.arrayContaining([{ id: "b", reason: "locked" }, { id: "ghost", reason: "not_found" }]));
    expect(must(addToFrame(apply(stored, { ok: true, patch: result.patch }), "f", ["a"])).skipped).toEqual([{ id: "a", reason: "unchanged" }]);
  });

  it("expands a group into its shapes", () => {
    let stored = base();
    stored = applyPatch(stored, planGroup(stored, ["a", "b"], () => "grp")!.patch);
    const next = apply(stored, addToFrame(stored, "f", ["grp"]));
    expect(byId(next, "a").frameId).toBe("f");
    expect(byId(next, "b").frameId).toBe("f");
    expect(byId(next, "a").groupId).toBe("grp");
  });

  it("lets a group span frames: ownership and grouping are independent", () => {
    let stored = base();
    stored = applyPatch(stored, planGroup(stored, ["a", "b"], () => "grp")!.patch);
    const next = apply(stored, addToFrame(stored, "f", ["a"]));
    expect(byId(next, "a").frameId).toBe("f");
    expect(byId(next, "b").frameId).toBeUndefined();
    expect(byId(next, "a").groupId).toBe(byId(next, "b").groupId);
  });

  it("rides elements along with a frame that is added", () => {
    const stored: StoredElement[] = [...base(), rect("d", 800, 50, 10, 10, { frameId: "g" })];
    const next = apply(stored, addToFrame(stored, "f", ["g", "d"]));
    expect(byId(next, "g").frameId).toBe("f");
    expect(byId(next, "d").frameId).toBe("g");
  });

  it("refuses cycles, itself, depth beyond the limit and locked targets", () => {
    const stored = nestChain(3);
    expect(addToFrame(stored, "n2", ["n0"])).toMatchObject({ ok: false, code: "cycle" });
    expect(addToFrame(stored, "n0", ["n0"])).toMatchObject({ ok: false, code: "cycle" });
    expect(addToFrame(nestChain(9), "n8", ["top"])).toMatchObject({ ok: false, code: "too_deep" });
    expect(addToFrame([frame("f", 0, 0, 100, 100, { locked: true }), rect("a", 0, 0)], "f", ["a"])).toMatchObject({ ok: false, code: "locked" });
    expect(addToFrame(base(), "a", ["b"])).toMatchObject({ ok: false, code: "not_a_frame" });
  });

  it("removes one level by default and to the canvas on request", () => {
    const stored: StoredElement[] = [frame("o", 0, 0, 800, 600), frame("i", 20, 40, 300, 200, { frameId: "o" }), rect("a", 40, 80, 50, 50, { frameId: "i" })];
    const up = apply(stored, removeFromFrame(stored, ["a"]));
    expect(byId(up, "a").frameId).toBe("o");
    expect(byId(apply(stored, removeFromFrame(stored, ["a"], { toTopLevel: true })), "a").frameId).toBeUndefined();
    expect(must(removeFromFrame(stored, ["o"])).skipped).toEqual([{ id: "o", reason: "unchanged" }]);
  });

  it("nests a frame and takes it out again", () => {
    const stored = base();
    const nested = apply(stored, nestFrame(stored, "g", "f"));
    expect(byId(nested, "g").frameId).toBe("f");
    expect(byId(apply(nested, nestFrame(nested, "g", null)), "g").frameId).toBeUndefined();
    expect(nestFrame(stored, "a", "f")).toMatchObject({ ok: false, code: "not_a_frame" });
  });

  it("re-fits auto-fit frames that gained or lost content", () => {
    let stored: StoredElement[] = [frame("f", 0, 0, 300, 300, { autoFit: true, padding: 0, headerVisible: false, minWidth: 10, minHeight: 10 }), rect("a", 100, 100, 100, 100, { frameId: "f" }), rect("z", 500, 500, 100, 100)];
    stored = apply(stored, addToFrame(stored, "f", ["z"]));
    expect(frameBox(byId(stored, "f") as FrameShape)).toMatchObject({ minX: 100, maxX: 600, maxY: 600 });
    stored = apply(stored, removeFromFrame(stored, ["z"]));
    expect(frameBox(byId(stored, "f") as FrameShape)).toMatchObject({ minX: 100, maxX: 200, maxY: 200 });
  });
});

const nestChain = (n: number): StoredElement[] => {
  const out: StoredElement[] = [];
  for (let i = 0; i < n; i += 1) out.push(frame(`n${i}`, 0, 0, 1000, 1000, i === 0 ? {} : { frameId: `n${i - 1}` }));
  out.push(frame("top", 0, 0, 100, 100));
  out.push(frame("leaf", 0, 0, 100, 100, { frameId: "top" }));
  return out;
};

describe("frameSelection", () => {
  it("wraps the selection, owns it, and moves nothing", () => {
    const stored = twoNodes();
    const result = must(frameSelection(stored, ["a", "b", "ab"], { id: "f", title: "Pair" }));
    const next = apply(stored, result);
    expect(result.selection).toEqual(["f"]);
    for (const id of ["a", "b", "ab"]) {
      expect(byId(next, id).frameId).toBe("f");
      expect(byId(next, id).points).toEqual(byId(stored, id).points);
    }
    const f = frameBox(byId(next, "f") as FrameShape)!;
    expect(f.minX).toBe(100 - FRAME_DEFAULTS.padding);
    expect(f.maxX).toBe(400 + FRAME_DEFAULTS.padding);
    expect(f.minY).toBe(100 - FRAME_DEFAULTS.padding - FRAME_DEFAULTS.headerHeight);
    expect(ids(next).indexOf("f")).toBeLessThan(ids(next).indexOf("a"));
  });

  it("nests the new frame in the frame that already held the whole selection", () => {
    const stored: StoredElement[] = [frame("p", 0, 0, 1000, 800), rect("a", 100, 100, 50, 50, { frameId: "p" }), rect("b", 300, 100, 50, 50, { frameId: "p" })];
    const next = apply(stored, frameSelection(stored, ["a", "b"], { id: "f" }));
    expect(byId(next, "f").frameId).toBe("p");
    expect(byId(next, "a").frameId).toBe("f");
  });

  it("counts a group as one and leaves out what rides with a selected frame", () => {
    let stored: StoredElement[] = [frame("i", 0, 0, 300, 300), rect("in", 20, 60, 50, 50, { frameId: "i" }), rect("a", 400, 0, 50, 50), rect("b", 500, 0, 50, 50)];
    stored = applyPatch(stored, planGroup(stored, ["a", "b"], () => "g")!.patch);
    const next = apply(stored, frameSelection(stored, ["i", "in", "g"], { id: "f" }));
    expect(byId(next, "i").frameId).toBe("f");
    expect(byId(next, "in").frameId).toBe("i");
    expect(byId(next, "a").frameId).toBe("f");
    expect(byId(next, "a").groupId).toBe("g");
  });

  it("applies padding and style, and reports an empty or locked selection", () => {
    const stored = twoNodes();
    const next = apply(stored, frameSelection(stored, ["a"], { id: "f", padding: 0, style: { headerVisible: false } }));
    expect(frameBox(byId(next, "f") as FrameShape)).toMatchObject({ minX: 100, maxX: 200, minY: 100, maxY: 160 });
    expect(frameSelection(stored, [], { id: "f" })).toMatchObject({ ok: false, code: "not_found" });
    expect(frameSelection([rect("a", 0, 0, 10, 10, { locked: true })], ["a"], { id: "f" })).toMatchObject({ ok: false, code: "not_found" });
    expect(frameSelection(stored, ["a"], { id: "a" })).toMatchObject({ ok: false, code: "exists" });
  });
});

describe("reparentMoved", () => {
  const scene = (): StoredElement[] => [frame("f", 0, 0, 500, 400), frame("g", 600, 0, 500, 400), rect("a", 10, 60, 50, 50, { frameId: "f" }), rect("free", 700, 100, 50, 50), rect("c", 100, 100, 50, 50)];

  it("gives an element dropped inside a frame to that frame, and one dropped outside to the canvas", () => {
    const result = must(reparentMoved(scene(), ["free", "a", "c"])!);
    const next = apply(scene(), result);
    expect(byId(next, "free").frameId).toBe("g");
    expect(byId(next, "c").frameId).toBe("f");
    expect(byId(next, "a").frameId).toBe("f");
    expect(result.changed.sort()).toEqual(["c", "free"]);
    const dragged = scene().map((e) => (e.id === "a" ? { ...e, points: [{ x: 3000, y: 3000 }, { x: 3050, y: 3050 }] } : e)) as StoredElement[];
    expect(byId(apply(dragged, reparentMoved(dragged, ["a"])!), "a").frameId).toBeUndefined();
  });

  it("returns null when nobody changes owner, and for boards without frames", () => {
    expect(reparentMoved(scene(), ["a"])).toBeNull();
    expect(reparentMoved([rect("a", 0, 0)], ["a"])).toBeNull();
  });

  it("prefers the deepest frame", () => {
    const stored: StoredElement[] = [frame("o", 0, 0, 800, 600), frame("i", 50, 50, 300, 300, { frameId: "o" }), rect("x", 100, 100, 50, 50)];
    expect(byId(apply(stored, reparentMoved(stored, ["x"])!), "x").frameId).toBe("i");
  });

  it("keeps a moved frame's contents with it and never puts a frame into its own contents", () => {
    const stored: StoredElement[] = [frame("o", 0, 0, 800, 600), frame("i", 50, 50, 300, 300, { frameId: "o" }), rect("x", 100, 100, 50, 50, { frameId: "i" })];
    expect(reparentMoved(stored, ["o", "i", "x"])).toBeNull();
    const dragged: StoredElement[] = [frame("o", 0, 0, 800, 600), frame("i", 50, 50, 300, 300, { frameId: "o" })];
    expect(reparentMoved(dragged, ["o"])).toBeNull();
  });

  it("does not drop into a locked frame", () => {
    const stored: StoredElement[] = [frame("f", 0, 0, 500, 400, { locked: true }), rect("a", 100, 100, 50, 50)];
    expect(reparentMoved(stored, ["a"])).toBeNull();
  });

  it("makes a connector follow the frame that owns both of its ends", () => {
    const stored: StoredElement[] = [frame("f", 0, 0, 800, 400), rect("a", 10, 60, 50, 50, { frameId: "f" }), rect("b", 300, 60, 50, 50, { frameId: "f" }), edge("ab", "a", "b", [[60, 85], [300, 85]])];
    expect(byId(apply(stored, reparentMoved(stored, ["ab"])!), "ab").frameId).toBe("f");
  });
});

describe("deleteFrame", () => {
  const scene = (): StoredElement[] => [frame("f", 0, 0, 600, 400), rect("a", 100, 100, 50, 50, { frameId: "f" }), rect("b", 300, 100, 50, 50, { frameId: "f" }), edge("ab", "a", "b", [[150, 125], [300, 125]], { frameId: "f" }), rect("out", 900, 0, 50, 50), edge("bout", "b", "out", [[350, 125], [900, 25]])];

  it("releases the contents into the frame's owner", () => {
    const stored: StoredElement[] = [frame("o", 0, 0, 800, 600), ...scene().map((e) => (e.id === "f" ? { ...e, frameId: "o" } : e))];
    const next = apply(stored, deleteFrame(stored, "f", { contents: "release" }));
    expect(next.some((e) => e.id === "f")).toBe(false);
    expect(byId(next, "a").frameId).toBe("o");
    expect(next).toHaveLength(stored.length - 1);
  });

  it("deletes the contents with their connectors and leaves everything else", () => {
    const stored = scene();
    const next = apply(stored, deleteFrame(stored, "f", { contents: "delete" }));
    expect(ids(next)).toEqual(["out"]);
  });

  it("deletes a group that its contents leave empty", () => {
    let stored: StoredElement[] = [frame("f", 0, 0, 600, 400), rect("a", 100, 100, 50, 50, { frameId: "f" }), rect("b", 300, 100, 50, 50, { frameId: "f" })];
    stored = applyPatch(stored, planGroup(stored, ["a", "b"], () => "g")!.patch);
    expect(ids(apply(stored, deleteFrame(stored, "f", { contents: "delete" })))).toEqual([]);
  });

  it("refuses when the frame or anything it would delete is locked", () => {
    expect(deleteFrame([frame("f", 0, 0, 100, 100, { locked: true })], "f", { contents: "delete" })).toMatchObject({ ok: false, code: "locked" });
    const locked = scene().map((e) => (e.id === "a" ? { ...e, locked: true } : e)) as StoredElement[];
    expect(deleteFrame(locked, "f", { contents: "delete" })).toMatchObject({ ok: false, code: "locked" });
    expect(must(deleteFrame(locked, "f", { contents: "release" })).removed).toEqual(["f"]);
  });
});

describe("reading", () => {
  const scene = (): StoredElement[] => [frame("o", 0, 0, 800, 600, { title: "Outer" }), frame("i", 20, 40, 300, 200, { frameId: "o" }), rect("a", 40, 80, 50, 50, { frameId: "i" }), rect("b", 400, 80, 50, 50, { frameId: "o" })];

  it("lists frames outermost first", () => {
    expect(listFrames(scene()).map((f) => [f.id, f.title, f.parent, f.depth, f.children])).toEqual([
      ["o", "Outer", null, 0, 2],
      ["i", "Frame", "o", 1, 1],
    ]);
  });

  it("lists contents, directly or deep", () => {
    const direct = listFrameContents(scene(), "o");
    expect(direct).toMatchObject({ ok: true, items: [{ id: "i", depth: 0 }, { id: "b", depth: 0 }] });
    expect(listFrameContents(scene(), "o", { deep: true })).toMatchObject({ ok: true, items: [{ id: "i", depth: 0 }, { id: "a", depth: 1 }, { id: "b", depth: 0 }] });
    expect(listFrameContents(scene(), "a")).toMatchObject({ ok: false, code: "not_a_frame" });
  });
});

describe("a board with damaged links", () => {
  it("still lets every operation run, and never writes a bad link", () => {
    const stored: StoredElement[] = [frame("f", 0, 0, 500, 400), rect("a", 10, 60, 50, 50, { frameId: "ghost" }), group("g")];
    expect(listFrames(stored)).toHaveLength(1);
    const next = apply(stored, addToFrame(stored, "f", ["a"]));
    expect(byId(next, "a").frameId).toBe("f");
    expect(checkPatch(stored, { add: [], update: [{ ...byId(stored, "a"), frameId: "ghost" }], remove: [] }).join(" ")).toContain("not a frame");
  });
});

describe("editing several frames at once", () => {
  const board = (): StoredElement[] => [
    frame("F", 0, 0, 400, 300),
    frame("G", 500, 0, 400, 300, { title: "Old" }),
    rect("a", 40, 80, 100, 60, { frameId: "F" }),
    rect("b", 600, 80, 100, 60, { frameId: "G" }),
  ];

  it("writes one patch that changes each frame and nothing else", () => {
    const stored = board();
    const result = must(updateFrames(stored, ["F", "G"], { title: "Team", titlePlacement: "above" }));
    expect(result.changed).toEqual(["F", "G"]);
    const after = applyPatch(stored, result.patch);
    expect(byId(after, "F")).toMatchObject({ title: "Team", titlePlacement: "above" });
    expect(byId(after, "G")).toMatchObject({ title: "Team", titlePlacement: "above" });
    expect(byId(after, "a")).toEqual(byId(stored, "a"));
  });

  it("skips locked, missing and already-matching frames and says why", () => {
    const stored = board();
    stored[0] = { ...stored[0], locked: true } as StoredElement;
    const result = must(updateFrames(stored, ["F", "G", "ghost", "a"], { title: "Old" }));
    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([
      { id: "F", reason: "locked" },
      { id: "G", reason: "unchanged" },
      { id: "ghost", reason: "not_found" },
      { id: "a", reason: "not_found" },
    ]);
    expect(result.patch).toEqual({ add: [], update: [], remove: [] });
  });

  it("clearing the title removes the field, and a duplicate id is handled once", () => {
    const stored = board();
    const result = must(updateFrames(stored, ["G", "G"], { title: "" }));
    expect(result.changed).toEqual(["G"]);
    expect("title" in byId(applyPatch(stored, result.patch), "G")).toBe(false);
  });

  it("fits an outer frame around its inner frame's new size even when the outer id comes first", () => {
    const stored = [frame("O", 0, 0, 900, 700), frame("I", 20, 40, 800, 600, { frameId: "O" }), rect("a", 100, 150, 100, 60, { frameId: "I" })];
    const parentFirst = applyPatch(stored, must(fitFrames(stored, ["O", "I"])).patch);
    const childFirst = applyPatch(stored, must(fitFrames(stored, ["I", "O"])).patch);
    expect(frameBox(byId(parentFirst, "O") as FrameShape)).toEqual(frameBox(byId(childFirst, "O") as FrameShape));
    const inner = frameBox(byId(parentFirst, "I") as FrameShape)!;
    expect(frameBox(byId(parentFirst, "O") as FrameShape)!.maxX).toBeLessThan(900);
    expect(frameBox(byId(parentFirst, "O") as FrameShape)!.minX).toBeLessThanOrEqual(inner.minX);
  });

  it("fits frames to what they hold, nested ones included, in one patch", () => {
    const stored = [frame("O", 0, 0, 900, 700), frame("I", 20, 40, 800, 600, { frameId: "O" }), rect("a", 100, 150, 100, 60, { frameId: "I" })];
    const result = must(fitFrames(stored, ["I", "O"]));
    const after = applyPatch(stored, result.patch);
    const inner = frameBox(byId(after, "I") as FrameShape)!;
    expect(inner.minX).toBe(100 - FRAME_DEFAULTS.padding);
    expect(inner.maxX).toBe(200 + FRAME_DEFAULTS.padding);
    const outer = frameBox(byId(after, "O") as FrameShape)!;
    expect(outer.minX).toBeLessThanOrEqual(inner.minX - FRAME_DEFAULTS.padding);
    expect(result.changed.length).toBeGreaterThan(0);
  });
});
