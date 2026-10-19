import { describe, expect, it } from "vitest";
import type { StoredElement, WhiteboardData } from "@/features/whiteboard/types/whiteboard.types";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import { buildGroupIndex, splitStored } from "./group-index";
import { planGroup, planSetLocked } from "./group-commands";
import { applyPatch } from "./patch";
import { arrow, rect } from "./test-helpers";

/** Exactly what autosave writes and the controller reads back. */
const save = (elements: StoredElement[]) =>
  JSON.stringify({
    elements,
    canvasSettings: { zoom: 1, panOffset: { x: 0, y: 0 }, showGrid: false },
    metadata: { version: "1.0.0", createdAt: 0, lastModified: "now" },
  } satisfies WhiteboardData);

const load = (content: string): StoredElement[] => {
  const parsed = parseSavedContent(content);
  if (parsed.status !== "ok") throw new Error(`saved content was ${parsed.status}`);
  return parsed.elements as unknown as StoredElement[];
};

describe("saving and loading groups", () => {
  const start = [rect("a", 0, 0), rect("b", 150, 0), rect("c", 300, 0), arrow("ab", "a", "b")];
  const nestedBoard = () => {
    const inner = applyPatch(start, planGroup(start, ["a", "b", "ab"], () => "inner")!.patch);
    const outer = applyPatch(inner, planGroup(inner, ["a", "b", "ab", "c"], () => "outer")!.patch);
    return applyPatch(outer, { add: [], update: [{ ...(outer.find((s) => s.id === "inner") as object), name: "Flow" } as StoredElement], remove: [] });
  };

  it("keeps groups, nesting, names and locks through a save and load", () => {
    const locked = applyPatch(nestedBoard(), planSetLocked(nestedBoard(), ["a", "b", "ab", "c"], true)!);
    const loaded = load(save(locked));
    expect(loaded).toEqual(JSON.parse(JSON.stringify(locked)));
    const index = buildGroupIndex(loaded);
    expect(index.parentOf.get("inner")).toBe("outer");
    expect(index.groups.get("inner")?.name).toBe("Flow");
    expect(index.groups.get("outer")?.locked).toBe(true);
    expect(index.leavesOf.get("outer")).toEqual(["a", "b", "c", "ab"]);
  });

  it("keeps shape ids stable, so connectors stay attached after a reload", () => {
    const loaded = load(save(nestedBoard()));
    const connector = splitStored(loaded).shapes.find((s) => s.id === "ab") as { startConnection?: { elementId: string }; endConnection?: { elementId: string } };
    expect(connector.startConnection?.elementId).toBe("a");
    expect(connector.endConnection?.elementId).toBe("b");
  });

  it("produces the same index before and after a round trip", () => {
    const before = buildGroupIndex(nestedBoard());
    const after = buildGroupIndex(load(save(nestedBoard())));
    expect([...after.parentOf]).toEqual([...before.parentOf]);
    expect([...after.leavesOf]).toEqual([...before.leavesOf]);
  });

  it("round-trips twice without drift", () => {
    const once = save(load(save(nestedBoard())) as never);
    const twice = save(load(once) as never);
    expect(twice).toBe(once);
  });
});

describe("boards saved before groups existed", () => {
  const legacy = [
    rect("r1", 0, 0, 160, 100, { label: "Start", fill: "#fff" }),
    { id: "c1", type: "circle", color: "#111", strokeWidth: 2, points: [{ x: 300, y: 50 }, { x: 330, y: 50 }] },
    arrow("a1", "r1", "c1"),
    { id: "t1", type: "text", color: "#000", strokeWidth: 1, text: "note", fontSize: 18, points: [{ x: 10, y: 200 }] },
  ] as unknown as StoredElement[];

  it("loads unchanged and without any group", () => {
    const loaded = load(save(legacy));
    expect(loaded).toEqual(JSON.parse(JSON.stringify(legacy)));
    const index = buildGroupIndex(loaded);
    expect(index.groups.size).toBe(0);
    expect(index.shapes.size).toBe(4);
    for (const shape of splitStored(loaded).shapes) {
      expect("groupId" in shape).toBe(false);
      expect("locked" in shape).toBe(false);
      expect("rotation" in shape).toBe(false);
    }
  });

  it("can be grouped, saved and ungrouped back to the identical document", () => {
    const grouped = applyPatch(legacy, planGroup(legacy, ["r1", "c1", "a1"], () => "G")!.patch);
    const reloaded = load(save(grouped));
    expect(reloaded.some((s) => s.type === "group")).toBe(true);
    const restored = load(save(reloaded.filter((s) => s.type !== "group").map((s) => ({ ...s, groupId: undefined })) as never));
    expect(restored).toEqual(JSON.parse(JSON.stringify(legacy)));
  });

  it("ignores group-like data from other builds without crashing", () => {
    const odd = [
      rect("a", 0, 0, 10, 10, { groupId: 42 as never }),
      { id: "g", type: "group" },
      { id: "h", type: "group", groupId: "h", points: [] },
      { type: "group" },
    ] as unknown as StoredElement[];
    expect(() => buildGroupIndex(odd)).not.toThrow();
    expect(buildGroupIndex(odd).groups.size).toBe(0);
  });
});
