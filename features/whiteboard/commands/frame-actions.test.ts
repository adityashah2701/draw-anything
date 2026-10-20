import { describe, expect, it } from "vitest";
import { frame } from "@/core/frames/test-helpers";
import { frameBox } from "@/core/frames/frame-model";
import { applyPatch } from "@/core/groups/patch";
import { rect } from "@/core/groups/test-helpers";
import type { DrawingElement, FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { frameActionState, planFitSelectedFrames, planFrameSelection, planReleaseFrames, planRemoveFromFrame } from "./frame-actions";

const at = (list: StoredElement[], id: string) => list.find((e) => e.id === id) as DrawingElement;
const board = (): StoredElement[] => [
  frame("O", 0, 0, 900, 600),
  frame("I", 40, 60, 500, 400, { frameId: "O" }),
  rect("a", 80, 150, 100, 60, { frameId: "I" }),
  rect("b", 300, 150, 100, 60, { frameId: "I" }),
  rect("loose", 700, 100, 100, 60, { frameId: "O" }),
  rect("free", 1200, 100, 100, 60),
];

describe("frameActionState", () => {
  it("reports what the selection allows", () => {
    expect(frameActionState(board(), [])).toEqual({ frames: [], owned: [], canFrame: false });
    expect(frameActionState(board(), ["I", "a", "free"])).toEqual({ frames: ["I"], owned: ["I", "a"], canFrame: true });
    expect(frameActionState([rect("a", 0, 0)], ["a"])).toEqual({ frames: [], owned: [], canFrame: true });
  });
});

describe("planFrameSelection", () => {
  it("wraps the selection in a new frame owned by the frame that already held it, and selects it", () => {
    const stored = board();
    const result = planFrameSelection(stored, ["a", "b"], "n1");
    if (!result.ok) throw new Error(result.message);
    const after = applyPatch(stored, result.patch);
    expect(at(after, "n1")).toMatchObject({ type: "frame", frameId: "I" });
    expect(at(after, "a").frameId).toBe("n1");
    expect(at(after, "b").frameId).toBe("n1");
    expect(at(after, "a").points).toEqual(at(stored, "a").points); // nothing moves
    expect(result.selection).toEqual(["n1"]);
  });

  it("says so when there is nothing selected or nothing frameable", () => {
    expect(planFrameSelection(board(), [], "n1")).toEqual({ ok: false, message: "Select something to put a frame around." });
    expect(planFrameSelection(board(), ["ghost"], "n1").ok).toBe(false);
  });
});

describe("planRemoveFromFrame", () => {
  it("lifts shapes one level, and leaves a shape that is in no frame alone", () => {
    const stored = board();
    const result = planRemoveFromFrame(stored, ["a", "free"]);
    if (!result.ok) throw new Error(result.message);
    const after = applyPatch(stored, result.patch);
    expect(at(after, "a").frameId).toBe("O");
    expect(at(after, "b").frameId).toBe("I");
    expect(at(after, "free")).toEqual(at(stored, "free"));
  });

  it("explains itself when nothing selected is in a frame", () => {
    expect(planRemoveFromFrame(board(), ["free"])).toEqual({ ok: false, message: "Nothing selected is in a frame." });
  });
});

describe("planReleaseFrames", () => {
  it("removes the frame and keeps its contents, handing them to the frame's own owner", () => {
    const stored = board();
    const result = planReleaseFrames(stored, ["I"]);
    if (!result.ok) throw new Error(result.message);
    const after = applyPatch(stored, result.patch);
    expect(after.some((e) => e.id === "I")).toBe(false);
    expect(at(after, "a").frameId).toBe("O");
    expect(at(after, "b").frameId).toBe("O");
    expect(result.selection.sort()).toEqual(["a", "b"]); // the freed contents end up selected
    expect(at(after, "a").points).toEqual(at(stored, "a").points);
  });

  it("releases an outer and an inner frame together", () => {
    const stored = board();
    const result = planReleaseFrames(stored, ["O", "I"]);
    if (!result.ok) throw new Error(result.message);
    const after = applyPatch(stored, result.patch);
    expect(after.map((e) => e.id).sort()).toEqual(["a", "b", "free", "loose"]);
    for (const id of ["a", "b", "loose"]) expect(at(after, id).frameId).toBeUndefined();
  });

  it("refuses a locked frame and needs a frame to be selected", () => {
    const stored = board();
    stored[1] = { ...stored[1], locked: true } as StoredElement;
    expect(planReleaseFrames(stored, ["I"]).ok).toBe(false);
    expect(planReleaseFrames(board(), ["a"])).toEqual({ ok: false, message: "Select a frame to remove." });
  });
});

describe("planFitSelectedFrames", () => {
  it("wraps what the frame holds, and says when it already does", () => {
    const stored = board();
    const result = planFitSelectedFrames(stored, ["I"]);
    if (!result.ok) throw new Error(result.message);
    const after = applyPatch(stored, result.patch);
    const box = frameBox(at(after, "I") as FrameShape)!;
    expect(box.minX).toBe(80 - 24);
    expect(box.maxX).toBe(400 + 24);
    expect(planFitSelectedFrames(after, ["I"])).toEqual({ ok: false, message: "The frame already fits its contents." });
  });

  it("names a locked frame instead of silently doing nothing", () => {
    const stored = board();
    stored[1] = { ...stored[1], locked: true } as StoredElement;
    expect(planFitSelectedFrames(stored, ["I"])).toEqual({ ok: false, message: "That frame is locked." });
  });
});
