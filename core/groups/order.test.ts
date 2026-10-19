import { describe, expect, it } from "vitest";
import { reorder } from "@/features/whiteboard/utils/arrange";
import { splitStored } from "./group-index";
import { storedOrderFromShapes } from "./order";
import { group, rect } from "./test-helpers";

const stored = () => [group("G"), rect("a", 0, 0, 10, 10, { groupId: "G" }), rect("x", 0, 0, 10, 10), group("H"), rect("b", 0, 0, 10, 10, { groupId: "G" }), rect("c", 0, 0, 10, 10, { groupId: "H" })];

describe("storedOrderFromShapes", () => {
  it("keeps group records in their slots and refills the rest with the new shape order", () => {
    expect(storedOrderFromShapes(stored(), ["c", "b", "x", "a"])).toEqual(["G", "c", "b", "H", "x", "a"]);
  });

  it("is the identity for the current order", () => {
    const s = stored();
    expect(storedOrderFromShapes(s, splitStored(s).shapes.map((e) => e.id))).toEqual(s.map((e) => e.id));
  });

  it("always has the stored length, even when the shape order is stale", () => {
    expect(storedOrderFromShapes(stored(), ["a"])).toHaveLength(6);
  });

  it("makes a group's z-order commands move all its shapes as a block", () => {
    const s = stored();
    const shapes = splitStored(s).shapes.map((e) => e.id); // a x b c
    const front = reorder(shapes, new Set(["a", "b"]), "front"); // x c a b
    expect(front).toEqual(["x", "c", "a", "b"]);
    expect(storedOrderFromShapes(s, front)).toEqual(["G", "x", "c", "H", "a", "b"]);
    const back = reorder(shapes, new Set(["b", "c"]), "back");
    expect(back).toEqual(["b", "c", "a", "x"]);
  });
});
