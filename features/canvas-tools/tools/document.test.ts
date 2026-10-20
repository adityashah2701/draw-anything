import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { sanitizeLoaded } from "../editor/editor-host";
import { find, groupRecord, idsOf, node, rectangle, setup } from "../test-helpers";

describe("undo_action and redo_action", () => {
  it("steps back and forward through the tool's own changes, one step per change", async () => {
    const s = setup();
    await s.ok("create_shape", { id: "a", shape: "rectangle" });
    await s.ok("create_shape", { id: "b", shape: "ellipse" });
    await s.ok("create_shape", { id: "c", shape: "diamond" });
    const undone = await s.ok("undo_action", { steps: 2 });
    expect(undone.data).toMatchObject({ steps: 2, requested: 2 });
    expect(idsOf(s.mem.stored)).toEqual(["a"]);
    expect(undone.affected.removed).toEqual(["b", "c"]);
    const redone = await s.ok("redo_action");
    expect(idsOf(s.mem.stored)).toEqual(["a", "b"]);
    expect(redone.summary).toContain("Redid 1 step");
  });

  it("says plainly when there is nothing to undo or redo", async () => {
    const s = setup();
    expect((await s.ok("undo_action")).summary).toBe("Nothing to undo.");
    expect((await s.ok("redo_action")).summary).toBe("Nothing to redo.");
    const partial = setup();
    await partial.ok("create_shape", { shape: "rectangle" });
    const two = await partial.ok("undo_action", { steps: 5 });
    expect(two.warnings?.[0]).toContain("Only 1 step");
    expect((await partial.run("undo_action", { steps: 0 })).error?.code).toBe("invalid_arguments");
  });

  it("is unavailable on a host without history", async () => {
    const s = setup({ capabilities: { history: false } });
    expect((await s.run("undo_action")).error?.code).toBe("unavailable");
  });
});

describe("clear_canvas", () => {
  const board = () => [node("a", "A", 0, 0), node("b", "B", 300, 0, { locked: true }), groupRecord("g")];

  it("needs confirm: true and the person's approval, and changes nothing without them", async () => {
    const s = setup({ elements: board(), approve: () => false });
    expect((await s.run("clear_canvas", {})).error?.code).toBe("invalid_arguments");
    expect((await s.run("clear_canvas", { confirm: false })).error?.code).toBe("invalid_arguments");
    expect((await s.run("clear_canvas", { confirm: true })).error?.code).toBe("confirmation_denied");
    expect(s.mem.stored).toHaveLength(3);
    expect(s.mem.calls.confirmations[0].message).toContain("2 locked".replace("2", "1"));
  });

  it("clears everything once approved, and one undo brings it all back", async () => {
    const s = setup({ elements: board() });
    const before = JSON.stringify(s.mem.stored);
    const result = await s.ok("clear_canvas", { confirm: true });
    expect(s.mem.stored).toEqual([]);
    expect(result.affected.removed.sort()).toEqual(["a", "b", "g"]);
    await s.ok("undo_action");
    expect(JSON.stringify(s.mem.stored)).toBe(before);
  });

  it("refuses on a board that changed since the agent looked, and reports an empty board", async () => {
    const s = setup({ elements: board() });
    await s.ok("get_document_state");
    s.mem.external([...s.mem.stored, rectangle("theirs", 0, 400)]);
    expect((await s.run("clear_canvas", { confirm: true })).error?.code).toBe("stale_document");
    const empty = setup();
    expect((await empty.ok("clear_canvas", { confirm: true })).summary).toContain("already empty");
  });

  it("fails closed on a host that cannot ask anyone", async () => {
    const s = setup({ elements: board(), capabilities: { confirm: false } });
    expect((await s.run("clear_canvas", { confirm: true })).error?.code).toBe("confirmation_denied");
    expect(s.mem.stored).toHaveLength(3);
  });
});

describe("export_diagram and save_document", () => {
  it("asks the host for the export with the options given and reports what was produced", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0)] });
    const result = await s.ok("export_diagram", { format: "svg", transparent: true, ids: ["a"] });
    expect(s.mem.calls.exports).toEqual([{ format: "svg", scale: 2, transparent: true, ids: ["a"] }]);
    expect(result.data).toMatchObject({ filename: "board.svg", mime: "image/svg+xml" });
    expect(s.mem.historyDepth().undo).toBe(0);
    expect((await s.run("export_diagram", { format: "gif" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("export_diagram", { format: "png", scale: 4 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("export_diagram", { format: "png", ids: ["ghost"] })).error?.code).toBe("not_found");
  });

  it("refuses to export an empty board", async () => {
    const s = setup();
    expect((await s.run("export_diagram", { format: "png" })).error?.code).toBe("invalid_state");
  });

  it("saves through the host and reports a failed save as a failure", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0)] });
    expect((await s.ok("save_document")).summary).toBe("Saved.");
    expect(s.mem.calls.saves).toBe(1);
    s.mem.host.save = async () => ({ saved: false, message: "The board could not be saved." });
    expect((await s.run("save_document")).error).toMatchObject({ code: "execution_failed", message: "The board could not be saved." });
    expect((await setup({ document: { canEdit: false } }).run("save_document")).error?.code).toBe("read_only");
  });
});

describe("load_document", () => {
  const library = { "other-board-1": { title: "Other", elements: [node("x", "Imported X", 0, 0), node("y", "Imported Y", 300, 0), groupRecord("g", { name: "G" })].map((e) => (e.id === "x" || e.id === "y" ? { ...e, groupId: "g" } : e)) as never } };

  it("merges another whiteboard beside the current content with fresh ids and nothing removed", async () => {
    const s = setup({ elements: [node("x", "Mine", 0, 0)], library });
    const result = await s.ok("load_document", { whiteboard_id: "other-board-1", mode: "merge" });
    expect(find(s.mem.stored, "x").label).toBe("Mine");
    expect(result.affected.created.length).toBe(3);
    expect(s.mem.stored.filter((e) => (e as DrawingElement).label?.startsWith("Imported"))).toHaveLength(2);
    expect(new Set(idsOf(s.mem.stored)).size).toBe(s.mem.stored.length);
    expect(s.mem.stored.filter((e) => e.type === "group")).toHaveLength(1);
  });

  it("replaces the board only with confirm: true and approval", async () => {
    const s = setup({ elements: [node("keep", "Keep", 0, 0)], library, approve: () => false });
    expect((await s.run("load_document", { whiteboard_id: "other-board-1", mode: "replace" })).error?.code).toBe("confirmation_required");
    expect((await s.run("load_document", { whiteboard_id: "other-board-1", mode: "replace", confirm: true })).error?.code).toBe("confirmation_denied");
    expect(idsOf(s.mem.stored)).toEqual(["keep"]);
    const approved = setup({ elements: [node("keep", "Keep", 0, 0)], library });
    await approved.ok("load_document", { whiteboard_id: "other-board-1", mode: "replace", confirm: true });
    expect(idsOf(approved.mem.stored).sort()).toEqual(["g", "x", "y"]);
    await approved.ok("undo_action");
    expect(idsOf(approved.mem.stored)).toEqual(["keep"]);
  });

  it("replaces an element that shares an id with the loaded one completely, leaving no stale keys", async () => {
    const s = setup({ elements: [node("x", "Old", 0, 0, { locked: true, hidden: true, opacity: 0.2 })], library });
    await s.ok("load_document", { whiteboard_id: "other-board-1", mode: "replace", confirm: true });
    const x = find<DrawingElement>(s.mem.stored, "x");
    expect(x.label).toBe("Imported X");
    expect(x.locked).toBeUndefined();
    expect(x.hidden).toBeUndefined();
    expect(x.opacity).toBeUndefined();
  });

  it("only reads boards the host allows, and says nothing about ones that do not exist", async () => {
    const s = setup({ library });
    const result = await s.run("load_document", { whiteboard_id: "someone-elses-board", mode: "merge" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("not_found");
    expect(result.error?.message).toContain("access");
    expect(s.mem.stored).toEqual([]);
    expect((await s.run("load_document", { whiteboard_id: "../../etc/passwd", mode: "merge" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("load_document", { whiteboard_id: "abcdefgh", content: "[]", mode: "merge" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("load_document", { mode: "merge" })).error?.code).toBe("invalid_arguments");
  });

  it("rejects an invalid document whole: nothing is added", async () => {
    const s = setup({ elements: [node("keep", "Keep", 0, 0)] });
    const broken = JSON.stringify([{ id: "z", type: "semantic-node", points: [{ x: "nope", y: 1 }, { x: 2, y: 3 }] }]);
    const result = await s.run("load_document", { content: broken, mode: "merge" });
    expect(result.ok).toBe(false);
    expect(idsOf(s.mem.stored)).toEqual(["keep"]);
    expect((await s.run("load_document", { content: "not json at all", mode: "merge" })).ok).toBe(false);
    expect((await s.run("load_document", { content: "[]", mode: "merge" })).error?.code).toBe("invalid_state");
  });

  it("sanitizeLoaded keeps the first of duplicate ids and drops things that are not elements", () => {
    const kept = sanitizeLoaded([node("a", "A", 0, 0), node("a", "Again", 5, 5), null, "text", { id: 5, type: "x" }, { id: "q", type: "rectangle" }, groupRecord("g")]);
    expect(idsOf(kept)).toEqual(["a", "g"]);
    expect((kept[0] as DrawingElement).label).toBe("A");
  });
});

describe("validate_and_repair_diagram", () => {
  const broken = () => [
    node("a", "A", 0, 0, { groupId: "ghost-group" }),
    node("b", "B", 400, 0),
    { id: "dangling", type: "arrow", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "#000", strokeWidth: 2, startConnection: { elementId: "a" }, endConnection: { elementId: "gone" } } as never,
    { ...rectangle("lbl", 0, 0), type: "text", text: "stray", points: [{ x: 0, y: 0 }], ai: { role: "edge-label", semanticId: "nothing-label" } } as never,
    groupRecord("empty"),
  ];

  it("fixes exactly the problems named and leaves the others reported", async () => {
    const s = setup({ elements: broken() });
    const before = await s.ok("validate_diagram");
    expect((before.data!.issues as Array<{ code: string }>).map((i) => i.code)).toEqual(expect.arrayContaining(["dangling_connector", "dangling_group_ref", "orphan_edge_label", "empty_group"]));
    const result = await s.ok("validate_and_repair_diagram", { codes: ["dangling_connector"] });
    expect(result.affected.removed).toEqual(["dangling"]);
    expect(idsOf(s.mem.stored)).toContain("lbl");
    expect(idsOf(s.mem.stored)).toContain("empty");
    const after = (await s.ok("validate_diagram")).data!.issues as Array<{ code: string }>;
    expect(after.map((i) => i.code)).not.toContain("dangling_connector");
    expect(after.map((i) => i.code)).toContain("orphan_edge_label");
  });

  it("can detach a dangling connector instead of removing it, and clears the other repairable kinds on request", async () => {
    const s = setup({ elements: broken() });
    await s.ok("validate_and_repair_diagram", { codes: ["dangling_connector"], dangling_connectors: "detach" });
    expect(find<DrawingElement & { endConnection?: unknown }>(s.mem.stored, "dangling").endConnection).toBeUndefined();
    await s.ok("validate_and_repair_diagram", { codes: ["dangling_group_ref", "orphan_edge_label", "empty_group"] });
    expect(idsOf(s.mem.stored).sort()).toEqual(["a", "b", "dangling"]);
    expect(find(s.mem.stored, "a").groupId).toBeUndefined();
  });

  it("reports and repairs an element that says it is in a frame that is not there", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { frameId: "ghost-frame" }), node("b", "B", 400, 0)] });
    const before = (await s.ok("validate_diagram")).data!.issues as Array<{ code: string; ids: string[] }>;
    expect(before.find((i) => i.code === "dangling_frame_ref")?.ids).toEqual(["a"]);
    await s.ok("validate_and_repair_diagram", { codes: ["dangling_frame_ref"] });
    expect(find(s.mem.stored, "a").frameId).toBeUndefined();
    const after = (await s.ok("validate_diagram")).data!.issues as Array<{ code: string }>;
    expect(after.map((i) => i.code)).not.toContain("dangling_frame_ref");
  });

  it("reports what it cannot fix and what is not there", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 50, 20)] });
    const overlap = await s.run("validate_and_repair_diagram", { codes: ["overlap"] });
    expect(overlap.error?.code).toBe("unsupported");
    const none = await s.ok("validate_and_repair_diagram", { codes: ["dangling_connector"] });
    expect(none.summary).toContain("Nothing to repair");
    expect((await s.run("validate_and_repair_diagram", { codes: [] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("validate_and_repair_diagram", { codes: ["make_it_pretty"] })).error?.code).toBe("invalid_arguments");
  });
});

describe("saved boards and serialization", () => {
  it("works on a board saved before nodeStyle, opacity, hidden and edge labels existed", async () => {
    const legacy = [
      { id: "n1", type: "semantic-node", points: [{ x: 0, y: 0 }, { x: 168, y: 78 }], color: "#1f2937", strokeWidth: 2, fill: "#eef2ff", label: "Legacy", ai: { semanticKind: "database" } },
      { id: "r1", type: "rectangle", points: [{ x: 300, y: 0 }, { x: 400, y: 60 }], color: "#000000", strokeWidth: 2 },
    ] as never;
    const s = setup({ elements: legacy });
    const state = await s.ok("get_document_state");
    expect((state.data!.elements as Array<{ id: string; icon?: string }>).find((e) => e.id === "n1")?.icon).toBe("database");
    await s.ok("update_semantic_node", { ids: ["n1"], icon_size: 32 });
    await s.ok("update_shape_style", { ids: ["r1"], opacity: 0.5, corner_radius: 8 });
    await s.ok("create_connector", { id: "c", from: "n1", to: "r1" });
    expect((await s.ok("validate_diagram")).data!.ok).toBe(true);
  });

  it("round-trips a diagram through serialize_diagram and import_diagram", async () => {
    const source = setup();
    await source.ok("import_diagram", { code: ["Client [kind: browser]", "API [kind: gateway]", "DB [kind: database]", "Client > API: HTTPS", "API > DB: SQL"].join("\n") });
    const code = String((await source.ok("serialize_diagram", { format: "diagram_code" })).data!.content);
    const copy = setup();
    await copy.ok("import_diagram", { code });
    const labels = (s: typeof source) => s.mem.stored.filter((e) => (e as DrawingElement).ai?.role === "node").map((e) => (e as DrawingElement).label).sort();
    expect(labels(copy)).toEqual(labels(source));
    expect(copy.mem.stored.filter((e) => e.type === "arrow")).toHaveLength(2);
    expect(copy.mem.stored.filter((e) => (e as DrawingElement).ai?.role === "edge-label").map((e) => (e as DrawingElement).text).sort()).toEqual(["HTTPS", "SQL"]);
  });
});
