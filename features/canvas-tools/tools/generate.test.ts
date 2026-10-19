import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, idsOf, node, setup } from "../test-helpers";

const generated = (): DrawingElement[] => [
  node("g1", "API", 0, 0, { ai: { semanticId: "api", role: "node" } }),
  node("g2", "DB", 300, 0, { ai: { semanticId: "db", role: "node" } }),
];

const withGenerator = (outcome: () => { elements: DrawingElement[]; warnings?: string[] } | Promise<never>, board: DrawingElement[] = []) =>
  setup({ elements: board, groups: ["generate", "memory", "document"], generate: outcome as never });

describe("generate_diagram", () => {
  it("adds the generated diagram beside what is on the board, as one undoable step, and leaves the rest alone", async () => {
    const existing = node("old", "Existing", 0, 0);
    const s = withGenerator(() => ({ elements: generated(), warnings: ["one label was shortened"] }), [existing]);
    const result = await s.ok("generate_diagram", { description: "an API with a database", diagram_type: "architecture" });
    expect(s.mem.calls.generates).toEqual([{ description: "an API with a database", diagramType: "architecture" }]);
    expect(idsOf(s.mem.stored)).toEqual(["old", "g1", "g2"]);
    expect(find(s.mem.stored, "old")).toEqual(existing);
    const gen = boxOf(find(s.mem.stored, "g1"));
    expect(gen.x).toBeGreaterThan(boxOf(existing).x + boxOf(existing).w); // beside, not on top
    expect(boxOf(find(s.mem.stored, "g2")).x - gen.x).toBe(300); // layout kept
    expect(result.affected.created).toEqual(["g1", "g2"]);
    expect(result.warnings).toEqual(["one label was shortened"]);
    expect(result.summary).toContain("2 nodes");

    await s.ok("undo_action");
    expect(idsOf(s.mem.stored)).toEqual(["old"]);
  });

  it("selects the new nodes and starts at the viewport on an empty board", async () => {
    const s = withGenerator(() => ({ elements: generated() }));
    await s.ok("generate_diagram", { description: "an API with a database" });
    expect(s.mem.selection).toEqual(["g1", "g2"]);
    expect(boxOf(find(s.mem.stored, "g1")).x).toBe(80);
  });

  it("changes nothing when generation fails, returns nothing, or returns something broken", async () => {
    const failing = withGenerator(() => Promise.reject(new Error("model timed out")));
    const failed = await failing.run("generate_diagram", { description: "an API with a database" });
    expect(failed.ok).toBe(false);
    expect(failed.error?.code).toBe("execution_failed");
    expect(failed.error?.message).toContain("Nothing was added");
    expect(failing.mem.stored).toEqual([]);

    const empty = withGenerator(() => ({ elements: [] }));
    expect((await empty.run("generate_diagram", { description: "an API with a database" })).error?.code).toBe("execution_failed");

    const broken = withGenerator(() => ({ elements: [{ id: "x", type: "rectangle", points: [{ x: Number.NaN, y: 0 }] } as unknown as DrawingElement, { id: "", type: "rectangle", points: [] } as unknown as DrawingElement] }));
    expect((await broken.run("generate_diagram", { description: "an API with a database" })).ok).toBe(false);
    expect(broken.mem.stored).toEqual([]);
  });

  it("refuses ids that collide with the board, without half-adding", async () => {
    const s = withGenerator(() => ({ elements: generated() }), [node("g1", "Mine", 0, 0)]);
    const result = await s.run("generate_diagram", { description: "an API with a database" });
    expect(result.ok).toBe(false);
    expect(idsOf(s.mem.stored)).toEqual(["g1"]);
    expect(find(s.mem.stored, "g1").label).toBe("Mine");
  });

  it("is unavailable without a generator, refused for a viewer, and strict about its arguments", async () => {
    const none = setup({ groups: ["generate"] });
    expect((await none.run("generate_diagram", { description: "an API with a database" })).error?.code).toBe("unavailable");

    const viewer = setup({ groups: ["generate"], generate: () => ({ elements: generated() }), document: { canEdit: false } });
    expect((await viewer.run("generate_diagram", { description: "an API with a database" })).ok).toBe(false);
    expect(viewer.mem.calls.generates).toEqual([]);

    const s = withGenerator(() => ({ elements: generated() }));
    expect((await s.run("generate_diagram", { description: "x" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("generate_diagram", { description: "an API", model: "gpt" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("generate_diagram", { description: "an API", diagram_type: "pie" })).error?.code).toBe("invalid_arguments");
    expect(s.mem.calls.generates).toEqual([]);
  });
});

describe("remember", () => {
  it("saves a short note and says when it is already known", async () => {
    const s = setup({ groups: ["memory"] });
    const first = await s.ok("remember", { kind: "preference", text: "Databases are drawn in blue." });
    expect(first.summary).toContain("Remembered (preference)");
    expect(s.mem.calls.remembered).toEqual([{ kind: "preference", text: "Databases are drawn in blue." }]);
    const again = await s.ok("remember", { kind: "preference", text: "databases are drawn in blue." });
    expect(again.summary).toBe("Already remembered.");
    expect(s.mem.calls.remembered).toHaveLength(1);
    expect(s.mem.stored).toEqual([]); // memory never touches the board
  });

  it.each([
    ["an API key", "The key is sk-abcdefghijklmnopqrstuvwxyz123456"],
    ["a password", "password: hunter2hunter2"],
    ["a long token", "Use A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2"],
  ])("refuses to store %s", async (_name, text) => {
    const s = setup({ groups: ["memory"] });
    const result = await s.run("remember", { kind: "fact", text });
    expect(result.error?.code).toBe("invalid_arguments");
    expect(s.mem.calls.remembered).toEqual([]);
  });

  it("validates its arguments, needs edit access and the memory capability", async () => {
    const s = setup({ groups: ["memory"] });
    expect((await s.run("remember", { kind: "secret", text: "something" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("remember", { kind: "fact", text: "x".repeat(301) })).error?.code).toBe("invalid_arguments");
    expect((await s.run("remember", { kind: "fact", text: "ok then", extra: 1 })).error?.code).toBe("invalid_arguments");
    expect((await setup({ groups: ["memory"], capabilities: { memory: false } }).run("remember", { kind: "fact", text: "ok then" })).error?.code).toBe("unavailable");
    const viewer = setup({ groups: ["memory"], document: { canEdit: false } });
    expect((await viewer.run("remember", { kind: "fact", text: "ok then" })).ok).toBe(false);
    expect(viewer.mem.calls.remembered).toEqual([]);
  });
});
