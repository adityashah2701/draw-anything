import { describe, expect, it } from "vitest";
import { resolveClickSelection } from "./selection";

const click = (selected: string[], hitId: string | null, additive = false) =>
  resolveClickSelection({ selected, hitId, additive });

describe("resolveClickSelection", () => {
  it("selects the clicked shape and starts a drag", () => {
    expect(click([], "a")).toEqual({ selected: ["a"], startDrag: true, collapseOnRelease: null });
    expect(click(["b"], "a")).toEqual({ selected: ["a"], startDrag: true, collapseOnRelease: null });
  });

  it("adds to the selection when a modifier is held", () => {
    expect(click(["b"], "a", true)).toEqual({ selected: ["b", "a"], startDrag: true, collapseOnRelease: null });
  });

  it("removes an already selected shape when a modifier is held, and does not drag", () => {
    expect(click(["a", "b"], "a", true)).toEqual({ selected: ["b"], startDrag: false, collapseOnRelease: null });
    expect(click(["a"], "a", true)).toEqual({ selected: [], startDrag: false, collapseOnRelease: null });
  });

  it("keeps a multi-selection for dragging, but collapses to the clicked shape on a plain click", () => {
    expect(click(["a", "b", "c"], "b")).toEqual({
      selected: ["a", "b", "c"],
      startDrag: true,
      collapseOnRelease: "b",
    });
  });

  it("has nothing to collapse when only that shape is selected", () => {
    expect(click(["a"], "a")).toEqual({ selected: ["a"], startDrag: true, collapseOnRelease: null });
  });

  it("clears on an empty click, unless a modifier is held", () => {
    expect(click(["a", "b"], null)).toEqual({ selected: [], startDrag: false, collapseOnRelease: null });
    expect(click(["a", "b"], null, true)).toEqual({ selected: ["a", "b"], startDrag: false, collapseOnRelease: null });
  });

  it("never returns duplicate ids", () => {
    expect(click(["a", "a"], "b", true).selected).toEqual(["a", "b"]);
  });
});
