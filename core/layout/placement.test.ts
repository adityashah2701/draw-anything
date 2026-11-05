import { describe, expect, it } from "vitest";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { isMovableByLayout, isPlaceable, placementOf, stampForAdd, stampForUpdate, withUpdateStamp } from "./placement";

const box = (id: string, x = 0, y = 0, extra: Partial<DrawingElement> = {}): DrawingElement =>
  ({ id, type: "rectangle", color: "#000000", strokeWidth: 2, points: [{ x, y }, { x: x + 100, y: y + 60 }], ...extra }) as DrawingElement;
const arrow = (id: string): DrawingElement => ({ id, type: "arrow", color: "#000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }) as DrawingElement;

describe("who placed an element", () => {
  it("reads no stamp as user, auto as auto, and a lock over both", () => {
    expect(placementOf({})).toBe("user");
    expect(placementOf({ placement: "user" })).toBe("user");
    expect(placementOf({ placement: "auto" })).toBe("auto");
    expect(placementOf({ placement: "auto", locked: true })).toBe("locked");
    expect(placementOf({ placement: "auto" }, true)).toBe("locked");
    expect(isMovableByLayout({ placement: "auto" })).toBe(true);
    expect(isMovableByLayout({})).toBe(false);
    expect(isMovableByLayout({ placement: "auto" }, true)).toBe(false);
  });

  it("stamps only elements that are placed: not connectors, annotations or records", () => {
    expect(isPlaceable(box("a"))).toBe(true);
    expect(isPlaceable(arrow("e"))).toBe(false);
    expect(isPlaceable({ type: "rectangle", isGuide: true })).toBe(false);
    expect(isPlaceable({ type: "group" })).toBe(false);
    expect(isPlaceable({ type: "layout" })).toBe(false);
  });
});

describe("the stamp of an update", () => {
  const current = box("a", 0, 0, { placement: "auto" });

  it("is user for a move by anyone but a layout, and auto for a layout", () => {
    const moved = { points: [{ x: 5, y: 0 }, { x: 105, y: 60 }] };
    expect(stampForUpdate(current, moved, "user")).toBe("user");
    expect(stampForUpdate(current, moved, "layout")).toBe("auto");
    expect(stampForUpdate(box("b", 0, 0), moved, "layout")).toBe("auto");
  });

  it("is none when the geometry is identical, so the stored stamp stays", () => {
    expect(stampForUpdate(current, { points: [{ x: 0, y: 0 }, { x: 100, y: 60 }] }, "user")).toBeUndefined();
    expect(stampForUpdate(current, {}, "user")).toBeUndefined();
    // Exactly identical: a nudge too small to see still counts as a move.
    expect(stampForUpdate(current, { points: [{ x: 0.0001, y: 0 }, { x: 100, y: 60 }] }, "user")).toBe("user");
  });

  it("lets an explicit override win, and never stamps a connector", () => {
    expect(stampForUpdate(current, {}, "layout", "user")).toBe("user");
    expect(stampForUpdate(arrow("e"), { points: [{ x: 9, y: 9 }, { x: 50, y: 0 }] }, "user")).toBeUndefined();
  });

  it("drops a stale stamp carried by the caller's copy when nothing moved", () => {
    expect(withUpdateStamp({ id: "a", placement: "auto" as const, label: "x" }, undefined)).toEqual({ id: "a", label: "x" });
    expect(withUpdateStamp({ id: "a", placement: "auto" as const }, "user")).toEqual({ id: "a", placement: "user" });
    const untouched = { id: "a", label: "x" };
    expect(withUpdateStamp(untouched, undefined)).toBe(untouched);
  });

  it("gives a new element the stamp of where it came from", () => {
    expect(stampForAdd(box("n"), "user")).toBe("user");
    expect(stampForAdd(box("n"), "layout")).toBe("auto");
    expect(stampForAdd(box("n"), "layout", "user")).toBe("user");
    expect(stampForAdd(arrow("e"), "layout")).toBeUndefined();
  });
});

describe("a patch applied to the stored list stamps by origin and by override", () => {
  const stored = (): StoredElement[] => [box("a", 0, 0, { placement: "auto" }), box("b", 200, 0), arrow("e")];
  const byId = (list: StoredElement[], id: string) => list.find((e) => e.id === id) as DrawingElement;

  it("marks a moved element user by default and leaves an unmoved one alone", () => {
    const patch: DocPatch = { add: [], update: [{ ...box("a", 50, 0), placement: "auto" }, box("b", 200, 0, { label: "renamed" })], remove: [] };
    const next = applyPatch(stored(), patch);
    expect(byId(next, "a").placement).toBe("user");
    expect(byId(next, "b").placement).toBeUndefined(); // no stamp before, none after: still reads as user
    expect(byId(next, "b").label).toBe("renamed");
  });

  it("marks what a layout moved auto, and what it did not move is not rewritten", () => {
    const before = stored();
    const patch: DocPatch = { origin: "layout", add: [], update: [{ ...box("a", 50, 0) }], remove: [] };
    const next = applyPatch(before, patch);
    expect(byId(next, "a").placement).toBe("auto");
    expect(next[1]).toBe(before[1]); // the very same object: not rewritten
  });

  it("applies per-element overrides over the origin (diagram code: explicit x and y are user)", () => {
    const patch: DocPatch = { origin: "layout", add: [box("n1", 300, 0), box("n2", 400, 0)], update: [], remove: [], placements: { n1: "user" } };
    const next = applyPatch(stored(), patch);
    expect(byId(next, "n1").placement).toBe("user");
    expect(byId(next, "n2").placement).toBe("auto");
  });

  it("does not let a stale copy of an element overwrite its stamp", () => {
    const patch: DocPatch = { add: [], update: [{ ...box("a", 0, 0), placement: "user" }], remove: [] };
    expect(byId(applyPatch(stored(), patch), "a").placement).toBe("auto");
  });

  it("never stamps connectors or records", () => {
    const patch: DocPatch = { add: [arrow("e2")], update: [{ ...arrow("e"), points: [{ x: 1, y: 1 }, { x: 60, y: 0 }] }], remove: [] };
    const next = applyPatch(stored(), patch);
    expect("placement" in byId(next, "e")).toBe(false);
    expect("placement" in byId(next, "e2")).toBe(false);
  });
});

import { layoutEnginesEnabled } from "./flags";

describe("the layout engines flag", () => {
  it("is on for `new`, off for `legacy`, and by default on outside production only", () => {
    expect(layoutEnginesEnabled("new", "production")).toBe(true);
    expect(layoutEnginesEnabled("legacy", "development")).toBe(false);
    expect(layoutEnginesEnabled(undefined, "development")).toBe(true);
    expect(layoutEnginesEnabled(undefined, "test")).toBe(true);
    expect(layoutEnginesEnabled(undefined, "production")).toBe(false);
    expect(layoutEnginesEnabled("whatever", "production")).toBe(false);
  });
});
