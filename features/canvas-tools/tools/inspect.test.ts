import { describe, expect, it } from "vitest";
import { groupRecord, node, rectangle, setup } from "../test-helpers";

const board = () => [
  node("api", "API Gateway", 0, 0, { ai: { icon: "api" } }),
  node("db", "Orders DB", 300, 0, { ai: { icon: "logo-postgresql", semanticKind: "database" } }),
  rectangle("note", 0, 200, 120, 80, { label: "Locked note", locked: true }),
  node("hid", "Hidden", 300, 200, { hidden: true }),
];

describe("get_document_state", () => {
  it("summarises the board with ids, positions, counts and a revision", async () => {
    const { ok } = setup({ elements: board(), selection: ["api"] });
    const state = await ok("get_document_state");
    expect(state.data).toMatchObject({ counts: { elements: 4, connectors: 0, groups: 0, hidden: 1 }, selection: ["api"] });
    const elements = state.data!.elements as Array<{ id: string; label?: string; x?: number; icon?: string; locked?: boolean; hidden?: boolean }>;
    expect(elements.find((e) => e.id === "db")).toMatchObject({ label: "Orders DB", x: 300, icon: "logo-postgresql" });
    expect(elements.find((e) => e.id === "note")?.locked).toBe(true);
    expect(elements.find((e) => e.id === "hid")?.hidden).toBe(true);
    expect(state.data!.revision).toBe(state.revision);
    expect(state.affected).toEqual({ created: [], updated: [], removed: [] });
  });

  it("lists groups with their members and truncates long boards honestly", async () => {
    const many = Array.from({ length: 30 }, (_, i) => node(`n${i}`, `Node ${i}`, i * 200, 0));
    const { ok } = setup({ elements: [...many, groupRecord("g1", { name: "Backend" })].map((e, i) => (i < 2 ? { ...e, groupId: "g1" } : e)) as never });
    const state = await ok("get_document_state", { limit: 10 });
    expect((state.data!.elements as unknown[]).length).toBe(10);
    expect(state.data!.truncated).toBe(true);
    expect(state.data!.groups).toEqual([expect.objectContaining({ id: "g1", name: "Backend", children: ["n0", "n1"] })]);
  });

  it("is a read: nothing changes and nothing is added to history", async () => {
    const { ok, mem } = setup({ elements: board() });
    const before = JSON.stringify(mem.stored);
    await ok("get_document_state");
    expect(JSON.stringify(mem.stored)).toBe(before);
    expect(mem.historyDepth().undo).toBe(0);
  });
});

describe("get_element_details", () => {
  it("returns style, icon, editable properties and attached connectors", async () => {
    const { ok } = setup({ elements: board() });
    await ok("create_connector", { id: "c1", from: "api", to: "db", label: "reads" });
    const details = await ok("get_element_details", { ids: ["api", "c1"] });
    const [api, c1] = details.data!.elements as Array<Record<string, unknown>>;
    expect(api).toMatchObject({ id: "api", fullLabel: "API Gateway", attachedConnectors: ["c1"] });
    expect(api.editable).toContain("fill");
    expect((c1 as { connector: { routing: string } }).connector.routing).toBe("orthogonal");
    expect(c1.label).toBe("reads");
  });

  it("fails with the unknown ids named", async () => {
    const { run } = setup({ elements: board() });
    const result = await run("get_element_details", { ids: ["api", "ghost"] });
    expect(result.error).toMatchObject({ code: "not_found", ids: ["ghost"] });
  });
});

describe("find_elements", () => {
  const { run } = setup();
  void run;
  it("filters by text, type, icon, lock state and connection, all together", async () => {
    const s = setup({ elements: board() });
    await s.ok("create_connector", { id: "c1", from: "api", to: "db" });
    const byText = await s.ok("find_elements", { query: "orders" });
    expect((byText.data!.elements as Array<{ id: string }>).map((e) => e.id)).toEqual(["db"]);
    const byIcon = await s.ok("find_elements", { icon: "logo-postgresql" });
    expect((byIcon.data!.elements as Array<{ id: string }>).map((e) => e.id)).toEqual(["db"]);
    const locked = await s.ok("find_elements", { locked: true });
    expect((locked.data!.elements as Array<{ id: string }>).map((e) => e.id)).toEqual(["note"]);
    const linked = await s.ok("find_elements", { connected_to: "api" });
    expect((linked.data!.elements as Array<{ id: string }>).map((e) => e.id).sort()).toEqual(["c1", "db"]);
    const none = await s.ok("find_elements", { query: "nothing like this" });
    expect(none.summary).toBe("No element matches.");
  });

  it("finds by area, group and hidden state, and caps the result", async () => {
    const s = setup({ elements: [...board(), groupRecord("g", { name: "G" })].map((e) => (e.id === "api" || e.id === "db" ? { ...e, groupId: "g" } : e)) as never });
    expect(((await s.ok("find_elements", { in_group: "g" })).data!.elements as unknown[]).length).toBe(2);
    expect(((await s.ok("find_elements", { in_bounds: { x: 290, y: 190, width: 400, height: 200 } })).data!.elements as Array<{ id: string }>).map((e) => e.id)).toEqual(["hid"]);
    expect(((await s.ok("find_elements", { hidden: true })).data!.elements as Array<{ id: string }>).map((e) => e.id)).toEqual(["hid"]);
    expect(((await s.ok("find_elements", { types: ["semantic-node"], limit: 1 })).data!.elements as unknown[]).length).toBe(1);
  });
});

describe("selection tools", () => {
  it("get_selection reports what is selected and resolves @selection in other tools", async () => {
    const s = setup({ elements: board(), selection: ["api", "db"] });
    const sel = await s.ok("get_selection");
    expect(sel.data!.selection).toEqual(["api", "db"]);
    const moved = await s.ok("move_elements", { ids: ["@selection"], dx: 10 });
    expect(moved.affected.updated.sort()).toEqual(["api", "db"]);
  });

  it("@selection with nothing selected is an error, not a guess", async () => {
    const s = setup({ elements: board() });
    const result = await s.run("move_elements", { ids: ["@selection"], dx: 10 });
    expect(result.error?.code).toBe("not_found");
    expect(result.error?.message).toContain("nothing is selected");
  });

  it("select_elements replaces or adds, expands a group and never edits the board", async () => {
    const s = setup({ elements: [...board(), groupRecord("g")].map((e) => (e.id === "api" || e.id === "db" ? { ...e, groupId: "g" } : e)) as never });
    await s.ok("select_elements", { ids: ["g"] });
    expect(s.mem.selection.sort()).toEqual(["api", "db"]);
    await s.ok("select_elements", { ids: ["note"], add: true });
    expect(s.mem.selection.sort()).toEqual(["api", "db", "note"]);
    await s.ok("select_elements", { ids: ["note"] });
    expect(s.mem.selection).toEqual(["note"]);
    expect(s.mem.historyDepth().undo).toBe(0);
    await s.ok("clear_selection");
    expect(s.mem.selection).toEqual([]);
    expect((await s.run("select_elements", { ids: ["ghost"] })).error?.code).toBe("not_found");
  });

  it("selection tools are unavailable on a host without selection", async () => {
    const s = setup({ elements: board(), capabilities: { selection: false } });
    expect((await s.run("get_selection")).error?.code).toBe("unavailable");
  });
});

describe("search_icons, validate_diagram, serialize_diagram, zoom_to_fit", () => {
  it("search_icons answers several terms at once from the registry", async () => {
    const s = setup();
    const result = await s.ok("search_icons", { query: "postgres, kafka" });
    const found = result.data!.results as Array<{ term: string; icons: Array<{ id: string }> }>;
    expect(found.map((f) => f.term)).toEqual(["postgres", "kafka"]);
    expect(found[0].icons.length).toBeGreaterThan(0);
  });

  it("validate_diagram reports problems with ids and whether they are repairable", async () => {
    const s = setup({ elements: [...board(), { id: "dangling", type: "arrow", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "#000", strokeWidth: 2, startConnection: { elementId: "api" }, endConnection: { elementId: "gone" } } as never] });
    const result = await s.ok("validate_diagram");
    const issues = result.data!.issues as Array<{ code: string; ids: string[]; repairable: boolean }>;
    expect(issues).toContainEqual(expect.objectContaining({ code: "dangling_connector", ids: ["dangling"], repairable: true }));
    expect(result.data!.ok).toBe(false);
    const filtered = await s.ok("validate_diagram", { include: ["unlabeled_node"] });
    expect((filtered.data!.issues as unknown[]).every((i) => (i as { code: string }).code === "unlabeled_node")).toBe(true);
  });

  it("serialize_diagram returns diagram code and JSON for the whole board or some elements", async () => {
    const s = setup({ elements: board() });
    await s.ok("create_connector", { id: "c1", from: "api", to: "db", label: "reads" });
    const code = await s.ok("serialize_diagram", { format: "diagram_code" });
    expect(code.data).toMatchObject({ format: "diagram_code", truncated: false });
    expect(String(code.data!.content)).toContain("API Gateway");
    expect(String(code.data!.content)).toContain("reads");
    const json = await s.ok("serialize_diagram", { format: "json", ids: ["api"] });
    expect(JSON.parse(String(json.data!.content))).toEqual([expect.objectContaining({ id: "api" })]);
  });

  it("zoom_to_fit asks the host to fit the diagram and changes nothing on the board", async () => {
    const s = setup({ elements: board() });
    await s.ok("zoom_to_fit");
    await s.ok("zoom_to_fit", { ids: ["api"] });
    expect(s.mem.calls.fits).toHaveLength(2);
    expect(s.mem.calls.fits[1]).toMatchObject({ minX: 0, minY: 0 });
    expect(s.mem.historyDepth().undo).toBe(0);
  });
});
