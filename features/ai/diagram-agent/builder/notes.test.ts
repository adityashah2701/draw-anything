import { describe, expect, it } from "vitest";
import type { BuilderNote, BuilderResult } from "./loop";
import { noteFor, summaryNote } from "./notes";
import { addLines, createState, describeFlow } from "./state";

describe("noteFor", () => {
  it("describes an add with counts, the flow and the layout", () => {
    const note: BuilderNote = { kind: "add", turn: 1, added: ["A", "B", "A > B"], nodes: 2, edges: 1, flow: "A → B", layout: "2 nodes, 1 connections, 0 crossings", skipped: 2 };
    expect(noteFor(note)).toEqual({
      kind: "add",
      title: "Added 2 components and 1 connection",
      items: ["A", "B", "A > B"],
      text: "It reads: A → B. Layout: 2 nodes, 1 connections, 0 crossings. 2 more statements did not fit in this step and will come next.",
    });
  });

  it("says nothing about the flow or the layout until there are connections to describe", () => {
    const first = noteFor({ kind: "add", turn: 1, added: ["Start", "End"], nodes: 2, edges: 0, flow: "Start", layout: "2 nodes, 0 connections, 0 crossings, longest connector 0px", skipped: 0 });
    expect(first.text).toBeUndefined();
    expect(first.title).toBe("Added 2 components");
  });

  it("lists the problems of a review and says what happens next", () => {
    const out = noteFor({ kind: "review", turn: 4, round: 1, problems: ["X > Y crosses Z > W"] });
    expect(out).toMatchObject({ title: "Review 1: 1 thing to fix", items: ["X > Y crosses Z > W"], text: "Fixing these before finishing." });
  });

  it("separates what an adjustment did from what it could not do", () => {
    expect(noteFor({ kind: "adjust", turn: 2, applied: ["moved B by 0, 60"], failed: [] })).toMatchObject({ title: "Adjusted the layout", items: ["moved B by 0, 60"] });
    expect(noteFor({ kind: "adjust", turn: 2, applied: [], failed: ['"move Q": no node named "Q"'] })).toMatchObject({ title: "Could not adjust the layout", text: expect.stringContaining("no node named") });
  });

  it("keeps the model's own words for reasoning", () => {
    expect(noteFor({ kind: "reasoning", turn: 1, text: "Grouping the stores." })).toEqual({ kind: "reasoning", title: "Thinking", text: "Grouping the stores." });
  });
});

describe("describeFlow", () => {
  it("reads the longest path from an entry point and names where it branches", () => {
    const state = addLines(createState(), "Start > Check > Done\nCheck > Retry").state;
    expect(describeFlow(state)).toBe("Start → Check → Done; it branches at Check");
  });

  it("copes with a cycle and an empty diagram", () => {
    expect(describeFlow(addLines(createState(), "A > B > A").state)).toMatch(/→/);
    expect(describeFlow(createState())).toBe("");
  });
});

describe("summaryNote", () => {
  const result = (over: Partial<BuilderResult> = {}) =>
    ({ state: addLines(createState(), "A > B > C").state, finished: true, turns: 4, reviews: 1, stoppedByQuota: false, firstReviewProblems: 3, remainingProblems: ["one left"], ...over }) as BuilderResult;

  it("says what was built, how it went and what was left", () => {
    const note = summaryNote(result());
    expect(note.title).toBe("Done: 3 components and 2 connections");
    expect(note.items).toEqual(["4 steps, 1 review", "2 of 3 problems found at review fixed"]);
    expect(note.text).toBe("Left as it is: one left.");
  });

  it("explains a stop for quota", () => {
    expect(summaryNote(result({ finished: false, stoppedByQuota: true }))).toMatchObject({ kind: "stopped", text: expect.stringContaining("quota") });
  });
});
