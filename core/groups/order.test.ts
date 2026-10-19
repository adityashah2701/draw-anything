import { describe, expect, it } from "vitest";
import { reorder } from "@/features/whiteboard/utils/arrange";
import { splitStored } from "./group-index";
import { movesToOrder, storedOrderFromShapes } from "./order";
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

describe("movesToOrder", () => {
  const run = (current: string[], wanted: string[]) => {
    const moves = movesToOrder(current, wanted)!;
    const list = [...current];
    for (const { from, to } of moves) list.splice(to, 0, list.splice(from, 1)[0]);
    return { list, moves };
  };

  it("turns the list into the wanted order, moving only what is out of place", () => {
    expect(run(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toEqual({ list: ["a", "b", "c", "d"], moves: [] });
    expect(run(["a", "b", "c", "d"], ["d", "a", "b", "c"]).list).toEqual(["d", "a", "b", "c"]);
    expect(run(["a", "b", "c", "d"], ["d", "c", "b", "a"]).list).toEqual(["d", "c", "b", "a"]);
    expect(run(["a", "b", "c"], ["a", "c", "b"]).moves).toHaveLength(1);
  });

  it("refuses a stale or damaged order instead of scrambling the list", () => {
    expect(movesToOrder(["a", "b"], ["a"])).toBeNull();
    expect(movesToOrder(["a", "b"], ["a", "a"])).toBeNull();
    expect(movesToOrder(["a", "b"], ["a", "x"])).toBeNull();
  });
});
