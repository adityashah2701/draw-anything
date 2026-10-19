import { describe, expect, it } from "vitest";
import { buildGroupIndex } from "@/core/groups/group-index";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { formatNumber, readInspector } from "./inspector-model";

const read = (stored: StoredElement[], selected: string[]) => {
  const index = buildGroupIndex(stored);
  return readInspector(index, selected, (id) => {
    const shape = index.shapes.get(id);
    return shape ? getShapeBounds(shape) : null;
  });
};

describe("readInspector", () => {
  it("is null for no selection or ids that do not exist", () => {
    expect(read([rect("a", 0, 0)], [])).toBeNull();
    expect(read([rect("a", 0, 0)], ["ghost"])).toBeNull();
  });

  it("describes one shape by its own box", () => {
    const m = read([rect("a", 10, 20, 100, 50)], ["a"])!;
    expect(m.frame).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(m.frameIsLocal).toBe(false);
    expect(m.unitCount).toBe(1);
    expect(m.rotation).toEqual({ mode: "absolute", value: 0 });
    expect(m.group).toBeNull();
  });

  it("describes a rotated shape by its unrotated box and its angle", () => {
    const m = read([rect("a", 10, 20, 100, 50, { rotation: 90 })], ["a"])!;
    expect(m.frame).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(m.frameIsLocal).toBe(true);
    expect(m.rotation).toEqual({ mode: "absolute", value: 90 });
  });

  it("describes several shapes by the box around them, and rotation as relative", () => {
    const m = read([rect("a", 0, 0, 100, 50), rect("b", 200, 100, 100, 50)], ["a", "b"])!;
    expect(m.frame).toEqual({ x: 0, y: 0, width: 300, height: 150 });
    expect(m.unitCount).toBe(2);
    expect(m.rotation).toEqual({ mode: "relative" });
  });

  it("describes a group as one unit with its name", () => {
    const stored = [rect("a", 0, 0, 100, 50, { groupId: "G" }), rect("b", 200, 0, 100, 50, { groupId: "G" }), group("G", { name: "Header" })];
    const m = read(stored, ["a", "b"])!;
    expect(m.unitCount).toBe(1);
    expect(m.group).toEqual({ id: "G", name: "Header", rawName: "Header" });
    expect(m.frame).toMatchObject({ width: 300, height: 50 });
    expect(m.rotation).toEqual({ mode: "relative" });
    expect(read([...stored.slice(0, 2), group("G")], ["a", "b"])!.group).toEqual({ id: "G", name: "Group", rawName: "" });
  });

  it("a partly selected group is not described as a group", () => {
    const stored = [rect("a", 0, 0, 100, 50, { groupId: "G" }), rect("b", 200, 0, 100, 50, { groupId: "G" }), group("G")];
    expect(read(stored, ["a"])!.group).toBeNull();
  });

  it("leaves locked units out of what edits would change", () => {
    const stored = [rect("a", 0, 0, 100, 50), rect("b", 400, 0, 100, 50, { locked: true })];
    const m = read(stored, ["a", "b"])!;
    expect(m.partlyLocked).toBe(true);
    expect(m.locked).toBe(false);
    expect(m.editableUnitCount).toBe(1);
    expect(m.frame).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(m.targetIds).toEqual(["a"]);
  });

  it("reports a fully locked selection, still showing where it is", () => {
    const m = read([rect("a", 5, 6, 100, 50, { locked: true })], ["a"])!;
    expect(m.locked).toBe(true);
    expect(m.frame).toEqual({ x: 5, y: 6, width: 100, height: 50 });
    expect(m.rotation).toEqual({ mode: "none" });
    expect(m.targetIds).toEqual([]);
  });

  it("offers no rotation for text or a legacy circle alone", () => {
    const text = { id: "t", type: "text", text: "hi", fontSize: 20, color: "#000", strokeWidth: 1, points: [{ x: 0, y: 0 }] } as DrawingElement;
    const circle = { id: "c", type: "circle", color: "#000", strokeWidth: 1, points: [{ x: 50, y: 50 }, { x: 80, y: 50 }] } as DrawingElement;
    expect(read([text], ["t"])!.rotation).toEqual({ mode: "none" });
    expect(read([circle], ["c"])!.rotation).toEqual({ mode: "none" });
  });

  it("offers relative rotation for a line", () => {
    const line = { id: "l", type: "line", color: "#000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 80, y: 0 }] } as DrawingElement;
    expect(read([line], ["l"])!.rotation).toEqual({ mode: "relative" });
  });

  describe("style", () => {
    it("shows a value shared by every selected shape", () => {
      const m = read([rect("a", 0, 0, 10, 10, { color: "#f00", strokeWidth: 3, fill: "#0f0" }), rect("b", 50, 0, 10, 10, { color: "#f00", strokeWidth: 3, fill: "#0f0" })], ["a", "b"])!;
      expect(m.style).toMatchObject({ color: "#f00", strokeWidth: 3, fill: "#0f0" });
    });

    it("shows mixed when the selection disagrees", () => {
      const m = read([rect("a", 0, 0, 10, 10, { color: "#f00", strokeWidth: 3 }), rect("b", 50, 0, 10, 10, { color: "#00f", strokeWidth: 3 })], ["a", "b"])!;
      expect(m.style.color).toBe("mixed");
      expect(m.style.strokeWidth).toBe(3);
    });

    it("counts a missing fill as transparent", () => {
      const m = read([rect("a", 0, 0, 10, 10), rect("b", 50, 0, 10, 10, { fill: "transparent" })], ["a", "b"])!;
      expect(m.style.fill).toBe("transparent");
    });

    it("ignores shapes that cannot take a property", () => {
      const ar = arrow("ar", undefined, undefined, { strokeWidth: 5 });
      const m = read([rect("a", 0, 0, 10, 10, { fill: "#fff" }), ar], ["a", "ar"])!;
      expect(m.style.fill).toBe("#fff"); // arrows have no fill, so they do not make it "mixed"
    });

    it("has no font size unless something has text", () => {
      expect(read([rect("a", 0, 0, 10, 10)], ["a"])!.style.fontSize).toBeNull();
      expect(read([rect("a", 0, 0, 10, 10, { label: "Hi" })], ["a"])!.style.fontSize).toBe(16);
      expect(read([rect("a", 0, 0, 10, 10, { label: "Hi", fontSize: 24 }), rect("b", 50, 0, 10, 10, { label: "Yo", fontSize: 12 })], ["a", "b"])!.style.fontSize).toBe("mixed");
    });

    it("looks only at shapes that can be edited", () => {
      const m = read([rect("a", 0, 0, 10, 10, { color: "#f00" }), rect("b", 50, 0, 10, 10, { color: "#00f", locked: true })], ["a", "b"])!;
      expect(m.style.color).toBe("#f00");
    });
  });
});

describe("formatNumber", () => {
  it("shows at most two decimals and no negative zero", () => {
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(12.345)).toBe("12.35");
    expect(formatNumber(1 / 3)).toBe("0.33");
    expect(formatNumber(-0.001)).toBe("0");
    expect(formatNumber(-4.5)).toBe("-4.5");
  });
});

