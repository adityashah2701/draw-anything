import { describe, expect, it } from "vitest";
import { applyPatch, isEmptyPatch, restack } from "./patch";
import { rect } from "./test-helpers";

describe("DocPatch.order", () => {
  const base = [rect("a", 0, 0), rect("b", 100, 0), rect("c", 200, 0)];
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it("restacks in the same step as the rest of the patch", () => {
    const out = applyPatch(base, { add: [rect("d", 300, 0)], update: [], remove: ["a"], order: ["d", "c", "b"] });
    expect(ids(out)).toEqual(["d", "c", "b"]);
  });

  it("ignores an order that is not exactly a permutation of what remains", () => {
    expect(ids(applyPatch(base, { add: [], update: [], remove: [], order: ["c", "b"] }))).toEqual(["a", "b", "c"]);
    expect(ids(applyPatch(base, { add: [], update: [], remove: [], order: ["c", "b", "x"] }))).toEqual(["a", "b", "c"]);
    expect(ids(applyPatch(base, { add: [], update: [], remove: [], order: ["c", "c", "b"] }))).toEqual(["a", "b", "c"]);
    expect(ids(restack(base, ["b", "a", "c"]))).toEqual(["b", "a", "c"]);
  });

  it("counts as a change", () => {
    expect(isEmptyPatch({ add: [], update: [], remove: [] })).toBe(true);
    expect(isEmptyPatch({ add: [], update: [], remove: [], order: ["a"] })).toBe(false);
  });
});
