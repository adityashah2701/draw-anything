import { describe, expect, it } from "vitest";
import { buildFrameIndex } from "@/core/frames/frame-index";
import { frame } from "@/core/frames/test-helpers";
import { buildGroupIndex, isStoredRecord, splitStored } from "@/core/groups/group-index";
import { storedOrderFromShapes } from "@/core/groups/order";
import { applyPatch } from "@/core/groups/patch";
import { group, rect } from "@/core/groups/test-helpers";
import { createCommandContext } from "@/features/whiteboard/commands/context";
import { sanitizeLoaded } from "@/features/canvas-tools/editor/editor-host";
import { checkPatch } from "@/features/canvas-tools/integrity";
import { node, setup } from "@/features/canvas-tools/test-helpers";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildLayoutRecord, isLayoutRecord, layoutFor, layoutRecordId, layoutRecordsOf, normalizeLayoutRecord } from "./record";

const record = (scope: Parameters<typeof buildLayoutRecord>[0], engine = "architecture", algorithm = "layered") => buildLayoutRecord(scope, engine, algorithm);

describe("the layout record", () => {
  it("has one id per scope, and normalises what it reads", () => {
    expect(layoutRecordId({ kind: "board" })).toBe("layout:board");
    expect(layoutRecordId({ kind: "diagram", id: "g1" })).toBe("layout:diagram:g1");
    expect(layoutRecordId({ kind: "frame", id: "f1" })).toBe("layout:frame:f1");
    expect(record({ kind: "board" })).toMatchObject({ type: "layout", incremental: "adjust", version: 1, points: [] });
    expect(isLayoutRecord(record({ kind: "board" }))).toBe(true);
    expect(isLayoutRecord({ id: "x", type: "layout" })).toBe(false);
    expect(isLayoutRecord(null)).toBe(false);
    // Unreadable fields fall back to the choice that moves nothing; unusable records are dropped.
    expect(normalizeLayoutRecord({ ...record({ kind: "board" }), incremental: "bogus" })!.incremental).toBe("preserve");
    expect(normalizeLayoutRecord({ ...record({ kind: "board" }), engine: "Bad Engine!" })).toBeNull();
    expect(normalizeLayoutRecord({ ...record({ kind: "board" }), scope: { kind: "diagram" } })).toBeNull();
    expect(normalizeLayoutRecord({ ...record({ kind: "board" }), scope: { kind: "planet", id: "x" } })).toBeNull();
  });
});

describe("which record governs an element: one function", () => {
  const records = layoutRecordsOf([record({ kind: "board" }, "freeform", "keep"), record({ kind: "diagram", id: "g1" }, "architecture"), record({ kind: "frame", id: "f1" }, "freeform", "keep")]);
  const parents = new Map([["inner", "f1"], ["nested", "inner"]]);
  const lookup = { records, frameOf: (id: string) => parents.get(id) };
  const el = (id: string, generation?: string) => ({ id, ai: generation ? { generationId: generation } : undefined }) as Pick<DrawingElement, "id" | "ai">;

  it("is the nearest enclosing frame's, else its diagram's, else the board's", () => {
    expect(layoutFor(lookup, el("inner", "g1"))!.id).toBe("layout:frame:f1"); // the frame beats the diagram
    expect(layoutFor(lookup, el("nested", "g1"))!.id).toBe("layout:frame:f1"); // through a nested frame chain
    expect(layoutFor(lookup, el("free", "g1"))!.id).toBe("layout:diagram:g1");
    expect(layoutFor(lookup, el("free", "g2"))!.id).toBe("layout:board");
    expect(layoutFor({ ...lookup, records: new Map() }, el("free"))).toBeUndefined(); // no record: freeform
  });

  it("survives a frame cycle without looping", () => {
    const cyclic = { records, frameOf: (id: string) => (id === "a" ? "b" : id === "b" ? "a" : undefined) };
    expect(layoutFor(cyclic, el("a"))!.id).toBe("layout:board");
  });
});

describe("a layout record is configuration, never a shape", () => {
  const layout = record({ kind: "diagram", id: "g1" });
  const stored = (): StoredElement[] => [rect("a", 0, 0), layout, rect("b", 200, 0), group("grp", {}), frame("fr", 0, 0, 500, 300)];

  it("is split from the shapes and the groups, and never indexed as either", () => {
    const split = splitStored(stored());
    expect(split.layouts).toEqual([layout]);
    expect(split.shapes.map((s) => s.id)).toEqual(["a", "b", "fr"]);
    expect(split.records.map((r) => r.id)).toEqual(["grp"]);
    expect(isStoredRecord(layout)).toBe(true);
    expect(buildGroupIndex(stored()).shapes.has(layout.id)).toBe(false);
    expect(buildFrameIndex(stored()).shapes.has(layout.id)).toBe(false);
  });

  it("is not a shape of a command context, so nothing selects, moves, arranges, routes or counts it", () => {
    const ctx = createCommandContext(stored(), { newId: () => "n" });
    expect(ctx.shapes.some((s) => s.id === layout.id)).toBe(false);
    expect(ctx.index.shapes.has(layout.id)).toBe(false);
  });

  it("keeps its slot when the shapes are re-stacked", () => {
    expect(storedOrderFromShapes(stored(), ["b", "a", "fr"])).toEqual(["b", layout.id, "a", "grp", "fr"]);
  });

  it("survives a load, and is accepted by the integrity check without being read as a shape", () => {
    expect(sanitizeLoaded(JSON.parse(JSON.stringify(stored()))).some((e) => e.id === layout.id)).toBe(true);
    expect(checkPatch(stored(), { add: [record({ kind: "board" })], update: [], remove: [] })).toEqual([]);
    expect(applyPatch(stored(), { add: [], update: [], remove: [layout.id] }).some((e) => e.id === layout.id)).toBe(false);
  });

  it("is not on the board the AI sees", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), layout] });
    const state = await s.ok("get_document_state", {});
    expect(JSON.stringify(state.data)).not.toContain(layout.id);
  });
});
