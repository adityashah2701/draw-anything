import { describe, expect, it } from "vitest";
import { applyPatch } from "@/core/groups/patch";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import { brokenFrameLinks, buildFrameIndex, commonFrame, frameAncestors, frameDescendants, isInsideFrame } from "./frame-index";
import { MAX_FRAME_DEPTH } from "./frame-model";
import { frame } from "./test-helpers";

const board = (): StoredElement[] => [
  frame("outer", 0, 0, 800, 600),
  frame("inner", 20, 40, 300, 200, { frameId: "outer" }),
  rect("a", 40, 80, 50, 50, { frameId: "inner" }),
  rect("b", 400, 80, 50, 50, { frameId: "outer" }),
  rect("c", 900, 0, 50, 50),
  arrow("ab", "a", "b", { frameId: "outer" }),
];

describe("buildFrameIndex", () => {
  it("reads ownership, depth and children in stacking order", () => {
    const index = buildFrameIndex(board());
    expect(index.parentOf.get("inner")).toBe("outer");
    expect(index.parentOf.get("a")).toBe("inner");
    expect(index.parentOf.has("c")).toBe(false);
    expect(index.depthOf.get("a")).toBe(2);
    expect(index.depthOf.get("outer")).toBe(0);
    expect(index.childrenOf.get("outer")).toEqual(["inner", "b", "ab"]);
    expect(frameAncestors(index, "a")).toEqual(["inner", "outer"]);
    expect(frameDescendants(index, "outer")).toEqual(["inner", "a", "b", "ab"]);
    expect(isInsideFrame(index, "a", "outer")).toBe(true);
    expect(isInsideFrame(index, "c", "outer")).toBe(false);
  });

  it("is the same for a board with no frames (old boards need no migration)", () => {
    const index = buildFrameIndex([rect("a", 0, 0), rect("b", 100, 0), group("g")]);
    expect(index.frames.size).toBe(0);
    expect(index.parentOf.size).toBe(0);
    expect(index.shapes.size).toBe(2);
  });

  it("ignores a frameId that points nowhere, at a non-frame, or at itself, without throwing", () => {
    const stored = [frame("f", 0, 0), rect("a", 0, 0, 10, 10, { frameId: "gone" }), rect("b", 0, 0, 10, 10, { frameId: "a" }), frame("g", 0, 0, 100, 100, { frameId: "g" }), rect("c", 0, 0, 10, 10, { frameId: "f" })];
    const index = buildFrameIndex(stored);
    expect([...index.parentOf]).toEqual([["c", "f"]]);
    expect(brokenFrameLinks(stored).sort()).toEqual(["a", "b", "g"]);
  });

  it("cuts a cycle so every frame is still reachable from the top", () => {
    const stored = [frame("a", 0, 0, 100, 100, { frameId: "b" }), frame("b", 0, 0, 100, 100, { frameId: "a" })];
    const index = buildFrameIndex(stored);
    expect(index.parentOf.size).toBe(1);
    for (const id of ["a", "b"]) expect(Number.isFinite(index.depthOf.get(id))).toBe(true);
    expect(brokenFrameLinks(stored)).toHaveLength(1);
  });

  it("reads a link deeper than the limit as top level", () => {
    const stored: StoredElement[] = [];
    for (let i = 0; i < MAX_FRAME_DEPTH + 4; i += 1) stored.push(frame(`f${i}`, 0, 0, 100, 100, i === 0 ? {} : { frameId: `f${i - 1}` }));
    const index = buildFrameIndex(stored);
    expect(Math.max(...index.depthOf.values())).toBeLessThanOrEqual(MAX_FRAME_DEPTH);
    expect(brokenFrameLinks(stored).length).toBeGreaterThan(0);
  });

  it("uses the first of two elements with the same id", () => {
    const index = buildFrameIndex([frame("f", 0, 0), rect("a", 0, 0, 10, 10, { frameId: "f" }), rect("a", 99, 99, 10, 10)]);
    expect(index.shapes.size).toBe(2);
    expect(index.parentOf.get("a")).toBe("f");
  });

  it("copes with a very long chain without recursing", () => {
    const stored: StoredElement[] = [];
    for (let i = 0; i < 20_000; i += 1) stored.push(frame(`f${i}`, 0, 0, 10, 10, i === 0 ? {} : { frameId: `f${i - 1}` }));
    expect(() => buildFrameIndex(stored)).not.toThrow();
  });
});

describe("commonFrame", () => {
  it("is the nearest frame that holds all of them", () => {
    const index = buildFrameIndex(board());
    expect(commonFrame(index, ["a", "b"])).toBe("outer");
    expect(commonFrame(index, ["a"])).toBe("inner");
    expect(commonFrame(index, ["a", "c"])).toBeNull();
    expect(commonFrame(index, [])).toBeNull();
  });
});

describe("saving and loading frames", () => {
  const save = (elements: StoredElement[]) =>
    JSON.stringify({ elements, canvasSettings: { zoom: 1, panOffset: { x: 0, y: 0 }, showGrid: false }, metadata: { version: "1.0.0", createdAt: 0, lastModified: "now" } });
  const load = (content: string) => {
    const parsed = parseSavedContent(content);
    if (parsed.status !== "ok") throw new Error(parsed.status);
    return parsed.elements;
  };

  it("keeps frames, ownership and titles through a save and load, twice, without drift", () => {
    const withTitles = applyPatch(board(), { add: [], update: [frame("outer", 0, 0, 800, 600, { title: "Platform", autoFit: true, padding: 12, titlePlacement: "above" })], remove: [] });
    const once = save(load(save(withTitles)));
    expect(JSON.parse(once).elements).toEqual(JSON.parse(JSON.stringify(withTitles)));
    expect(save(load(once))).toBe(once);
    const before = buildFrameIndex(withTitles);
    const after = buildFrameIndex(load(once));
    expect([...after.parentOf]).toEqual([...before.parentOf]);
  });

  it("loads a board saved before frames existed as a board with no frames", () => {
    const old = load(save([rect("a", 0, 0), arrow("x", "a", undefined)]));
    expect(buildFrameIndex(old).frames.size).toBe(0);
  });
});
