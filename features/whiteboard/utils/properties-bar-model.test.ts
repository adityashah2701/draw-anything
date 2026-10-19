import { describe, expect, it } from "vitest";
import { buildGroupIndex } from "@/core/groups/group-index";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { readPropertiesBar } from "./properties-bar-model";

const read = (stored: StoredElement[], selected: string[]) => readPropertiesBar(buildGroupIndex(stored), selected);
const text = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "text", text: "Hi", points: [{ x: 0, y: 0 }], color: "#111111", strokeWidth: 1, fontSize: 24, ...extra }) as unknown as DrawingElement;

describe("readPropertiesBar", () => {
  it("is null without a selection", () => {
    expect(read([rect("a", 0, 0)], [])).toBeNull();
    expect(read([rect("a", 0, 0)], ["ghost"])).toBeNull();
  });

  it("gives a rectangle stroke, fill and corners but no text or connector section", () => {
    const m = read([rect("a", 0, 0, 100, 60, { fill: "#DBEAFE", cornerRadius: 12 })], ["a"])!;
    expect(m.title).toBe("Rectangle");
    expect(m.stroke).toMatchObject({ color: "#000000", width: 2, colorLabel: "Stroke" });
    expect(m.fill).toEqual({ value: "#dbeafe", ids: ["a"] });
    expect(m.border).toEqual({ radius: 12, ids: ["a"] });
    expect(m.text).toBeNull();
    expect(m.connector).toBeNull();
    expect(m.opacity).toBe(1);
  });

  it("treats a missing fill and the legacy '#transparent' as no fill", () => {
    expect(read([rect("a", 0, 0)], ["a"])!.fill!.value).toBe("transparent");
    expect(read([rect("a", 0, 0, 100, 60, { fill: "#transparent" })], ["a"])!.fill!.value).toBe("transparent");
  });

  it("gives text a text colour and size only", () => {
    const m = read([text("t")], ["t"])!;
    expect(m.title).toBe("Text");
    expect(m.stroke).toMatchObject({ colorLabel: "Text color", width: null, widthIds: [] });
    expect(m.text).toEqual({ size: 24, ids: ["t"] });
    expect(m.fill).toBeNull();
    expect(m.border).toBeNull();
  });

  it("gives a connector its line options, and none of fill, corners or text", () => {
    const m = read([rect("a", 0, 0), rect("b", 200, 0), arrow("c", "a", "b", { dashed: true, routingMode: "straight" })], ["c"])!;
    expect(m.title).toBe("Connector");
    expect(m.connector).toEqual({ ids: ["c"], dashed: true, routing: "straight", headStart: false, headEnd: true });
    expect(m.fill).toBeNull();
    expect(m.border).toBeNull();
    expect(m.text).toBeNull();
  });

  it("reports mixed values instead of the first shape's", () => {
    const m = read([rect("a", 0, 0, 100, 60, { color: "#111111", opacity: 0.5 }), rect("b", 0, 0, 100, 60, { color: "#222222", strokeWidth: 4 })], ["a", "b"])!;
    expect(m.title).toBe("2 objects");
    expect(m.stroke).toMatchObject({ color: "mixed", width: "mixed" });
    expect(m.opacity).toBe("mixed");
  });

  it("lists, per section, only the shapes the property applies to", () => {
    const m = read([rect("a", 0, 0), rect("b", 0, 0, 100, 60, { label: "Service" }), text("t"), arrow("c", undefined, undefined)], ["a", "b", "t", "c"])!;
    expect(m.fill!.ids).toEqual(["a", "b"]);
    expect(m.border!.ids).toEqual(["a", "b"]);
    expect(m.text!.ids).toEqual(["b", "t"]);
    expect(m.connector!.ids).toEqual(["c"]);
    expect(m.stroke!.colorIds).toEqual(["a", "b", "t", "c"]);
    expect(m.stroke!.widthIds).toEqual(["a", "b", "c"]);
  });

  it("expands a group to its members and calls it a group", () => {
    const m = read([group("g"), rect("a", 0, 0, 100, 60, { groupId: "g" }), rect("b", 0, 0, 100, 60, { groupId: "g" })], ["a", "b"])!;
    expect(m.title).toBe("Group");
    expect(m.targetIds.sort()).toEqual(["a", "b"]);
    expect(m.stroke!.color).toBe("#000000");
  });

  it("leaves locked shapes out, and is locked when every unit is", () => {
    const stored = [rect("a", 0, 0, 100, 60, { locked: true }), rect("b", 0, 0)];
    const partly = read(stored, ["a", "b"])!;
    expect(partly.partlyLocked).toBe(true);
    expect(partly.targetIds).toEqual(["b"]);
    const all = read(stored, ["a"])!;
    expect(all.locked).toBe(true);
    expect(all.stroke).toBeNull();
  });
});
