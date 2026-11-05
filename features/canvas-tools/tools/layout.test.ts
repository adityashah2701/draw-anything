import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { find, node, setup } from "../test-helpers";

const board = () => [
  node("a", "A", 0, 0, { placement: "auto" }),
  node("b", "B", 900, 500, { placement: "auto" }),
  node("c", "C", 100, 1000, { placement: "user" }),
];
const withConnectors = async () => {
  const s = setup({ elements: board() });
  await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
  await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
  return s;
};
const pts = (s: Awaited<ReturnType<typeof withConnectors>>, id: string) => JSON.stringify(find<DrawingElement>(s.mem.stored, id).points);

describe("layout_diagram", () => {
  it("previews by default: says what would move and changes nothing", async () => {
    const s = await withConnectors();
    const before = JSON.stringify(s.mem.stored);
    const result = await s.ok("layout_diagram", { mode: "adjust", engine: "architecture" });
    expect(result.summary).toMatch(/^Preview \(not applied\)/);
    expect((result.data as { preview: { moves: unknown[] } }).preview.moves.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.mem.stored)).toBe(before);
  });

  it("applies adjust as one change that moves only what a layout placed", async () => {
    const s = await withConnectors();
    const c = pts(s, "c");
    await s.ok("layout_diagram", { mode: "adjust", engine: "architecture", apply: true });
    expect(pts(s, "c")).toBe(c);
    expect(find<DrawingElement>(s.mem.stored, "a").placement).toBe("auto");
  });

  it("needs the person's confirmation to overwrite what they placed, and says how much it would move", async () => {
    const s = await withConnectors();
    const refused = await s.run("layout_diagram", { mode: "overwrite", engine: "architecture", apply: true });
    expect(refused.ok).toBe(false);
    expect(refused.error?.code).toBe("confirmation_required");
    expect(pts(s, "c")).toBe(JSON.stringify(find<DrawingElement>(board(), "c").points));
  });

  it("is a preview-only no-op without an engine on a board that has no layout record", async () => {
    const s = await withConnectors();
    const result = await s.ok("layout_diagram", { mode: "adjust", apply: true });
    expect(result.summary).toMatch(/nothing would move|Nothing to apply/);
  });
});

describe("diagrams the tools draw", () => {
  const stamp = (s: ReturnType<typeof setup>, id: string) => (find<DrawingElement>(s.mem.stored, id) as DrawingElement).placement;
  const nodesOf = (s: ReturnType<typeof setup>) => (s.mem.stored as DrawingElement[]).filter((e) => e.ai?.role === "node");

  it("a new diagram is placed by a layout (auto) and stored with its layout record", async () => {
    const s = setup({});
    await s.ok("import_diagram", { code: "type architecture\nWeb > API\nAPI > DB" });
    const nodes = nodesOf(s);
    expect(nodes.length).toBe(3);
    expect(nodes.every((n) => n.placement === "auto")).toBe(true);
    const records = s.mem.stored.filter((e) => e.type === "layout");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ engine: "architecture", algorithm: "layered", incremental: "adjust", scope: { kind: "diagram", id: nodes[0].ai!.generationId } });
  });

  it("a node whose code gives x and y is the person's (user), the others auto", async () => {
    const s = setup({});
    await s.ok("import_diagram", { code: "Web [x: 100, y: 100]\nAPI\nWeb > API" });
    const byLabel = Object.fromEntries(nodesOf(s).map((n) => [n.label, n.placement]));
    expect(byLabel).toEqual({ Web: "user", API: "auto" });
  });

  it("a diagram that already exists gets no record from an edit, and a node a person moved stays theirs", async () => {
    const s = setup({});
    await s.ok("import_diagram", { code: "Web > API" });
    const before = s.mem.stored.filter((e) => e.type === "layout").length;
    const web = nodesOf(s).find((n) => n.label === "Web")!;
    // A person drags Web: stamped user by the storage rule.
    s.mem.stored.splice(0, s.mem.stored.length, ...(s.mem.stored as DrawingElement[]).map((e) => (e.id === web.id ? { ...e, placement: "user" as const } : e)));
    await s.ok("apply_diagram_code", { code: "Web > API\nAPI > DB" });
    expect(s.mem.stored.filter((e) => e.type === "layout")).toHaveLength(before);
    expect(stamp(s, web.id)).toBe("user");
  });
});
