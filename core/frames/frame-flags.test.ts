import { describe, expect, it } from "vitest";
import { buildGroupIndex, flaggedByFrame, isEffectivelyLocked } from "@/core/groups/group-index";
import { isEffectivelyHidden, isHiddenByFlag, visibleShapes } from "@/core/groups/visibility";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { frame } from "./test-helpers";

const board = (frameFlags: Record<string, unknown> = {}, outerFlags: Record<string, unknown> = {}): StoredElement[] => [
  frame("O", 0, 0, 900, 600, outerFlags),
  frame("I", 40, 60, 500, 400, { frameId: "O", ...frameFlags }),
  rect("a", 80, 150, 100, 60, { frameId: "I" }),
  rect("b", 300, 150, 100, 60, { frameId: "I" }),
  rect("loose", 700, 100, 100, 60, { frameId: "O" }),
  rect("free", 1200, 100, 100, 60),
];

describe("a locked frame locks what it owns", () => {
  it("covers contents at any depth and nothing outside", () => {
    const index = buildGroupIndex(board({}, { locked: true }));
    for (const id of ["O", "I", "a", "b", "loose"]) expect(isEffectivelyLocked(index, id)).toBe(true);
    expect(isEffectivelyLocked(index, "free")).toBe(false);
  });

  it("locking an inner frame leaves the outer frame and its other contents free", () => {
    const index = buildGroupIndex(board({ locked: true }));
    expect(["a", "b", "I"].every((id) => isEffectivelyLocked(index, id))).toBe(true);
    expect(isEffectivelyLocked(index, "O")).toBe(false);
    expect(isEffectivelyLocked(index, "loose")).toBe(false);
  });

  it("is derived, so the contents' own flag stays untouched and unlocking gives them back", () => {
    const locked = board({ locked: true });
    expect(locked.find((e) => e.id === "a")).not.toHaveProperty("locked");
    const unlocked = board();
    expect(isEffectivelyLocked(buildGroupIndex(unlocked), "a")).toBe(false);
  });

  it("follows a frame that sits in a locked group, and a group whose shapes are all in a locked frame", () => {
    const stored = [group("g", { locked: true }), frame("F", 0, 0, 300, 300, { groupId: "g" }), rect("a", 10, 10, 50, 50, { frameId: "F" })];
    expect(isEffectivelyLocked(buildGroupIndex(stored), "a")).toBe(true);
    const grouped = [frame("F", 0, 0, 300, 300, { locked: true }), group("g"), rect("a", 10, 10, 50, 50, { frameId: "F", groupId: "g" }), rect("b", 90, 10, 50, 50, { frameId: "F", groupId: "g" })];
    expect(isEffectivelyLocked(buildGroupIndex(grouped), "g")).toBe(true);
    const mixed = [frame("F", 0, 0, 300, 300, { locked: true }), group("g"), rect("a", 10, 10, 50, 50, { frameId: "F", groupId: "g" }), rect("b", 90, 10, 50, 50, { groupId: "g" })];
    expect(isEffectivelyLocked(buildGroupIndex(mixed), "g")).toBe(false);
  });

  it("stops at damaged links instead of looping or throwing", () => {
    const cyclic = [frame("A", 0, 0, 100, 100, { frameId: "B", locked: true }), frame("B", 0, 0, 100, 100, { frameId: "A" }), rect("x", 5, 5, 10, 10, { frameId: "A" })];
    expect(isEffectivelyLocked(buildGroupIndex(cyclic), "x")).toBe(true);
    const dangling = [rect("x", 5, 5, 10, 10, { frameId: "ghost" }), rect("y", 5, 5, 10, 10, { frameId: "x" })];
    const index = buildGroupIndex(dangling);
    expect(flaggedByFrame(index, "x", "locked")).toBe(false);
    expect(flaggedByFrame(index, "y", "locked")).toBe(false); // owner is not a frame
    const loop = [frame("A", 0, 0, 100, 100, { frameId: "B" }), frame("B", 0, 0, 100, 100, { frameId: "A" }), rect("x", 5, 5, 10, 10, { frameId: "A" })];
    expect(isEffectivelyLocked(buildGroupIndex(loop), "x")).toBe(false);
  });
});

describe("a hidden frame hides what it owns", () => {
  it("hides contents and the connectors that end in them, and leaves the rest", () => {
    const stored = [...board({ hidden: true }), arrow("ab", "a", "b", { frameId: "I" }), arrow("a-free", "a", "free")];
    const index = buildGroupIndex(stored);
    for (const id of ["I", "a", "b", "ab", "a-free"]) expect(isEffectivelyHidden(index, id)).toBe(true);
    for (const id of ["O", "loose", "free"]) expect(isEffectivelyHidden(index, id)).toBe(false);
    expect(isHiddenByFlag(index, "a")).toBe(true);
    const shapes = visibleShapes([...index.shapes.values()], index).map((shape) => shape.id);
    expect(shapes).toEqual(["O", "loose", "free"]);
  });

  it("showing the frame brings everything back with no bookkeeping", () => {
    const index = buildGroupIndex(board());
    expect(visibleShapes([...index.shapes.values()], index)).toHaveLength(6);
  });
});
