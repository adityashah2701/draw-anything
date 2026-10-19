import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, groupRecord, node, rectangle, setup } from "../test-helpers";

const labelsAndLinks = (stored: readonly { id: string }[]) =>
  (stored as unknown as DrawingElement[])
    .filter((e) => (e.type as string) !== "group")
    .map((e) => ({ id: e.id, type: e.type, label: e.label, text: e.text, from: (e as { startConnection?: { elementId: string } }).startConnection?.elementId, to: (e as { endConnection?: { elementId: string } }).endConnection?.elementId, groupId: e.groupId }));

describe("align_elements", () => {
  const cards = () => [rectangle("a", 10, 0, 100, 50), rectangle("b", 80, 100, 160, 50), rectangle("c", 40, 230, 60, 50)];

  it.each([
    ["left", (b: ReturnType<typeof boxOf>) => b.x, 10],
    ["right", (b: ReturnType<typeof boxOf>) => b.x + b.w, 240],
    ["center", (b: ReturnType<typeof boxOf>) => b.x + b.w / 2, 125],
  ] as const)("aligns on the %s edge of the selection", async (mode, pick, expected) => {
    const s = setup({ elements: cards() });
    await s.ok("align_elements", { ids: ["a", "b", "c"], mode });
    for (const id of ["a", "b", "c"]) expect(pick(boxOf(find(s.mem.stored, id)))).toBeCloseTo(expected, 3);
  });

  it("aligns top, middle and bottom the same way", async () => {
    const s = setup({ elements: [rectangle("a", 0, 10, 50, 40), rectangle("b", 100, 60, 50, 100)] });
    await s.ok("align_elements", { ids: ["a", "b"], mode: "middle" });
    const mids = ["a", "b"].map((id) => boxOf(find(s.mem.stored, id))).map((b) => b.y + b.h / 2);
    expect(mids[0]).toBeCloseTo(mids[1], 3);
  });

  it("treats a group as one box and keeps its members' relative positions", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 50, 50, { groupId: "g" }), rectangle("b", 100, 0, 50, 50, { groupId: "g" }), groupRecord("g"), rectangle("c", 400, 200, 50, 50)] });
    await s.ok("align_elements", { ids: ["g", "c"], mode: "left" });
    expect(boxOf(find(s.mem.stored, "c")).x).toBe(0);
    expect(boxOf(find(s.mem.stored, "b")).x - boxOf(find(s.mem.stored, "a")).x).toBe(100);
  });

  it("keeps a locked element where it is and aligns the others to it", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 50, 50, { locked: true }), rectangle("b", 200, 100, 50, 50)] });
    const result = await s.ok("align_elements", { ids: ["a", "b"], mode: "right" });
    expect(boxOf(find(s.mem.stored, "a")).x).toBe(0);
    expect(result.skipped).toEqual([{ id: "a", reason: "locked" }]);
  });

  it("moves the connectors attached to aligned nodes along", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 400, 120)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("align_elements", { ids: ["a", "b"], mode: "top" });
    const arrow = find<DrawingElement>(s.mem.stored, "ab");
    expect(arrow.points.at(-1)!.y).toBe(39);
  });

  it("needs two separate things and valid ids", async () => {
    const s = setup({ elements: cards() });
    expect((await s.run("align_elements", { ids: ["a"], mode: "left" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("align_elements", { ids: ["a", "ghost"], mode: "left" })).error?.code).toBe("not_found");
    expect((await s.run("align_elements", { ids: ["a", "b"], mode: "diagonal" })).error?.code).toBe("invalid_arguments");
    expect((await s.ok("align_elements", { ids: ["a", "b"], mode: "left" })).ok).toBe(true);
    expect((await s.ok("align_elements", { ids: ["a", "b"], mode: "left" })).summary).toMatch(/already|nothing/i);
  });
});

describe("distribute_elements and set_element_spacing", () => {
  const row = () => [rectangle("a", 0, 0, 100, 50), rectangle("b", 130, 0, 100, 50), rectangle("c", 500, 0, 100, 50), rectangle("d", 640, 0, 60, 50)];
  const gaps = (s: ReturnType<typeof setup>, ids: string[]) => {
    const boxes = ids.map((id) => boxOf(find(s.mem.stored, id))).sort((p, q) => p.x - q.x);
    return boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
  };

  it("makes the gaps equal and leaves the outermost two where they were", async () => {
    const s = setup({ elements: row() });
    await s.ok("distribute_elements", { ids: ["a", "b", "c", "d"], axis: "horizontal" });
    const g = gaps(s, ["a", "b", "c", "d"]);
    expect(g[0]).toBeCloseTo(g[1], 3);
    expect(g[1]).toBeCloseTo(g[2], 3);
    expect(boxOf(find(s.mem.stored, "a")).x).toBe(0);
    expect(boxOf(find(s.mem.stored, "d")).x + boxOf(find(s.mem.stored, "d")).w).toBe(700);
  });

  it("needs three or more unlocked items", async () => {
    const s = setup({ elements: row() });
    expect((await s.run("distribute_elements", { ids: ["a", "b"], axis: "horizontal" })).error?.code).toBe("invalid_arguments");
    const locked = setup({ elements: [rectangle("a", 0, 0), rectangle("b", 200, 0, 100, 80, { locked: true }), rectangle("c", 500, 0, 100, 80, { locked: true })] });
    expect((await locked.run("distribute_elements", { ids: ["a", "b", "c"], axis: "horizontal" })).error?.code).toBe("invalid_state");
  });

  it("sets an exact gap between neighbours, vertical stacks included", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 100, 40), rectangle("b", 0, 90, 100, 40), rectangle("c", 0, 300, 100, 40)] });
    await s.ok("set_element_spacing", { ids: ["a", "b", "c"], axis: "vertical", gap: 24 });
    const boxes = ["a", "b", "c"].map((id) => boxOf(find(s.mem.stored, id)));
    expect(boxes[1].y - (boxes[0].y + boxes[0].h)).toBe(24);
    expect(boxes[2].y - (boxes[1].y + boxes[1].h)).toBe(24);
    expect(boxes[0].y).toBe(0);
    expect((await s.run("set_element_spacing", { ids: ["a", "b"], axis: "vertical", gap: -1 })).error?.code).toBe("invalid_arguments");
    expect((await s.ok("set_element_spacing", { ids: ["a", "b", "c"], axis: "vertical", gap: 24 })).summary).toMatch(/already|nothing/i);
  });
});

describe("auto_layout", () => {
  const flow = async () => {
    const s = setup({ elements: [node("client", "Client", 900, 700), node("api", "API", 10, 400), node("auth", "Auth", 500, 20), node("db", "DB", 200, 900)] });
    await s.ok("connect_elements", { connections: [{ from: "client", to: "api", label: "HTTPS" }, { from: "api", to: "auth" }, { from: "api", to: "db" }] });
    return s;
  };

  it("lays a flow out in ranks while keeping ids, labels, sizes and connections", async () => {
    const s = await flow();
    const before = labelsAndLinks(s.mem.stored);
    const sizes = ["client", "api", "auth", "db"].map((id) => ({ id, w: boxOf(find(s.mem.stored, id)).w, h: boxOf(find(s.mem.stored, id)).h }));
    const result = await s.ok("auto_layout", { algorithm: "layered", direction: "down", gap: 60 });
    const y = (id: string) => boxOf(find(s.mem.stored, id)).y;
    expect(y("client")).toBeLessThan(y("api"));
    expect(y("api")).toBeLessThan(y("auth"));
    expect(y("auth")).toBe(y("db"));
    expect(labelsAndLinks(s.mem.stored)).toEqual(before);
    expect(sizes.map(({ id }) => ({ id, w: boxOf(find(s.mem.stored, id)).w, h: boxOf(find(s.mem.stored, id)).h }))).toEqual(sizes);
    expect(result.affected.updated.length).toBeGreaterThan(4);
    expect((await s.ok("validate_diagram", { include: ["dangling_connector", "bad_anchor", "invalid_geometry"] })).data!.issues).toEqual([]);
  });

  it("supports the direction right, rows, columns, grids and circles", async () => {
    const s = await flow();
    await s.ok("auto_layout", { algorithm: "layered", direction: "right" });
    expect(boxOf(find(s.mem.stored, "client")).x).toBeLessThan(boxOf(find(s.mem.stored, "api")).x);
    await s.ok("auto_layout", { algorithm: "row", gap: 40 });
    expect(new Set(["client", "api", "auth", "db"].map((id) => boxOf(find(s.mem.stored, id)).y)).size).toBe(1);
    await s.ok("auto_layout", { algorithm: "column", gap: 40 });
    expect(new Set(["client", "api", "auth", "db"].map((id) => boxOf(find(s.mem.stored, id)).x)).size).toBe(1);
    await s.ok("auto_layout", { algorithm: "grid", columns: 2 });
    expect(new Set(["client", "api", "auth", "db"].map((id) => boxOf(find(s.mem.stored, id)).x)).size).toBe(2);
    await s.ok("auto_layout", { algorithm: "circle" });
    expect((await s.run("auto_layout", { algorithm: "spiral" })).error?.code).toBe("invalid_arguments");
  });

  it("arranges only the ids given and leaves locked elements where they are", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 700, 500), node("c", "C", 40, 800, { locked: true }), node("far", "Far", 3000, 3000)] });
    await s.ok("auto_layout", { ids: ["a", "b", "c"], algorithm: "row" });
    expect(boxOf(find(s.mem.stored, "c"))).toMatchObject({ x: 40, y: 800 });
    expect(boxOf(find(s.mem.stored, "far"))).toMatchObject({ x: 3000, y: 3000 });
  });

  it("refuses to run on a board that changed under the agent, and with too little to arrange", async () => {
    const s = await flow();
    await s.ok("get_document_state");
    s.mem.external([...s.mem.stored, rectangle("theirs", 0, 0)]);
    expect((await s.run("auto_layout", { algorithm: "row" })).error?.code).toBe("stale_document");
    const one = setup({ elements: [node("only", "Only", 0, 0)] });
    expect((await one.run("auto_layout", { algorithm: "row" })).error?.code).toBe("invalid_state");
  });

  it("is a single undo step", async () => {
    const s = await flow();
    const before = JSON.stringify(s.mem.stored);
    await s.ok("auto_layout", { algorithm: "layered" });
    await s.ok("undo_action");
    expect(JSON.stringify(s.mem.stored)).toBe(before);
  });
});

describe("tidy_diagram and apply_layout_preset", () => {
  it("snaps near-aligned nodes into rows, equalises gaps, and keeps what the diagram says", async () => {
    const s = setup({ elements: [node("a", "A", 0, 3), node("b", "B", 260, -4), node("c", "C", 590, 5), node("d", "D", 860, -2)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "one" });
    const before = labelsAndLinks(s.mem.stored);
    await s.ok("tidy_diagram", {});
    const ys = ["a", "b", "c", "d"].map((id) => boxOf(find(s.mem.stored, id)).y);
    expect(new Set(ys).size).toBe(1);
    const boxes = ["a", "b", "c", "d"].map((id) => boxOf(find(s.mem.stored, id)));
    const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
    expect(labelsAndLinks(s.mem.stored)).toEqual(before);
  });

  it("pulls overlapping nodes apart and leaves a tidy board alone", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 100, 20)] });
    await s.ok("tidy_diagram", { min_gap: 40 });
    const [a, b] = ["a", "b"].map((id) => boxOf(find(s.mem.stored, id)));
    const separated = b.x >= a.x + a.w + 39 || a.x >= b.x + b.w + 39 || b.y >= a.y + a.h + 39 || a.y >= b.y + b.h + 39;
    expect(separated).toBe(true);
    const tidy = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0)] });
    expect((await tidy.ok("tidy_diagram", {})).summary).toMatch(/nothing/i);
    expect(tidy.mem.historyDepth().undo).toBe(0);
  });

  it("applies named presets and rejects unknown ones", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 50, 400), node("c", "C", 800, 90)] });
    await s.ok("connect_elements", { connections: [{ from: "a", to: "b" }, { from: "b", to: "c" }] });
    await s.ok("apply_layout_preset", { preset: "flow_right" });
    const x = (id: string) => boxOf(find(s.mem.stored, id)).x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
    await s.ok("apply_layout_preset", { preset: "compact_grid" });
    await s.ok("apply_layout_preset", { preset: "tidy" });
    expect((await s.run("apply_layout_preset", { preset: "fancy" })).error?.code).toBe("invalid_arguments");
  });
});
