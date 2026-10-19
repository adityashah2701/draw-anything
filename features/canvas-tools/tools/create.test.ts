import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, groupRecord, idsOf, node, rectangle, setup } from "../test-helpers";

describe("create_shape", () => {
  it.each([
    ["rectangle", 160, 100],
    ["ellipse", 160, 100],
    ["diamond", 140, 100],
    ["pill", 160, 60],
    ["triangle", 120, 100],
  ] as const)("draws a %s with its default size at the given corner", async (shape, w, h) => {
    const s = setup();
    const result = await s.ok("create_shape", { id: "s", shape, x: 40, y: 50 });
    expect(result.affected.created).toEqual(["s"]);
    expect(boxOf(find(s.mem.stored, "s"))).toEqual({ x: 40, y: 50, w, h });
    expect(find(s.mem.stored, "s").type).toBe(shape);
  });

  it("styles the shape: outline, fill, stroke width, label, font, opacity, radius and rotation", async () => {
    const s = setup();
    await s.ok("create_shape", { id: "r", shape: "rectangle", x: 0, y: 0, width: 200, height: 90, label: "Line one\nLine two", color: "red", fill: "#e0f2fe", stroke_width: 4, font_size: 22, opacity: 0.5, corner_radius: 0, rotation: 15 });
    const r = find<DrawingElement & { cornerRadius?: number }>(s.mem.stored, "r");
    expect(r).toMatchObject({ label: "Line one\nLine two", fill: "#e0f2fe", strokeWidth: 4, fontSize: 22, opacity: 0.5, cornerRadius: 0, rotation: 15 });
    expect(r.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("stores nothing for full opacity and no fill, so an untouched shape matches one drawn by hand", async () => {
    const s = setup();
    await s.ok("create_shape", { id: "a", shape: "rectangle", x: 0, y: 0, opacity: 1, fill: null });
    const a = find(s.mem.stored, "a");
    expect(a).not.toHaveProperty("opacity");
    expect(a.fill).toBeUndefined();
  });

  it("draws a line and a freehand stroke from points, and rejects bad ones", async () => {
    const s = setup();
    await s.ok("create_shape", { id: "l", shape: "line", points: [{ x: 0, y: 0 }, { x: 100, y: 40 }] });
    await s.ok("create_shape", { id: "f", shape: "freehand", points: [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 12, y: 3 }] });
    expect(find(s.mem.stored, "f").points).toHaveLength(3);
    expect((await s.run("create_shape", { shape: "freehand" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "line", points: [{ x: 0, y: 0 }] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "line", points: [{ x: 0, y: Number.NaN }, { x: 1, y: 1 }] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "rectangle", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] })).error?.code).toBe("invalid_arguments");
  });

  it("says what a shape cannot take instead of dropping it silently", async () => {
    const s = setup();
    const noFill = await s.run("create_shape", { shape: "line", x: 0, y: 0, fill: "#ff0000" });
    expect(noFill.error).toMatchObject({ code: "unsupported" });
    expect((await s.run("create_shape", { shape: "ellipse", corner_radius: 4 })).error?.code).toBe("unsupported");
    expect((await s.run("create_shape", { shape: "line", label: "x" })).error?.code).toBe("unsupported");
    expect((await s.run("create_shape", { shape: "line", rotation: 10 })).error?.code).toBe("unsupported");
    expect(s.mem.stored).toHaveLength(0);
  });

  it("refuses an id that is already used, and rejects malformed ids and numbers", async () => {
    const s = setup({ elements: [rectangle("taken", 0, 0)] });
    expect((await s.run("create_shape", { id: "taken", shape: "rectangle" })).error).toMatchObject({ code: "conflict", ids: ["taken"] });
    expect((await s.run("create_shape", { id: "bad id!", shape: "rectangle" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "rectangle", width: -5 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "rectangle", x: 1e9 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_shape", { shape: "star" })).error?.code).toBe("invalid_arguments");
  });

  it("places an unplaced shape beside the existing content, never on top of it", async () => {
    const s = setup({ elements: [rectangle("a", 100, 100, 200, 100)] });
    await s.ok("create_shape", { id: "b", shape: "rectangle" });
    expect(boxOf(find(s.mem.stored, "b")).x).toBeGreaterThanOrEqual(300);
    expect(boxOf(find(s.mem.stored, "b")).y).toBe(100);
  });

  it("is one undo step, and undo removes exactly what it made", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0)] });
    await s.ok("create_shape", { id: "b", shape: "ellipse" });
    expect(s.mem.historyDepth().undo).toBe(1);
    await s.ok("undo_action");
    expect(idsOf(s.mem.stored)).toEqual(["a"]);
  });
});

describe("create_text", () => {
  it("keeps line breaks and normalises CRLF", async () => {
    const s = setup();
    await s.ok("create_text", { id: "t", text: "Title\r\nSecond line\n\nThird", x: 10, y: 20, font_size: 28, font_weight: "700", font_style: "italic", color: "#123456", opacity: 0.8 });
    expect(find(s.mem.stored, "t")).toMatchObject({ type: "text", text: "Title\nSecond line\n\nThird", fontSize: 28, fontWeight: "700", fontStyle: "italic", color: "#123456", opacity: 0.8 });
    expect(find(s.mem.stored, "t").points).toEqual([{ x: 10, y: 20 }]);
  });

  it("rejects empty or whitespace-only text and bad fonts", async () => {
    const s = setup();
    expect((await s.run("create_text", { text: "" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_text", { text: "  \n " })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_text", { text: "x", font_size: 2 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_text", { text: "x", font_weight: "heavy" })).error?.code).toBe("invalid_arguments");
    expect(s.mem.stored).toHaveLength(0);
  });
});

describe("create_icon", () => {
  it("places a registry icon by id or alias, sized and tinted", async () => {
    const s = setup();
    await s.ok("create_icon", { id: "i", icon: "database", x: 10, y: 10, size: 48, color: "#2563eb" });
    expect(find(s.mem.stored, "i")).toMatchObject({ type: "icon", ai: { icon: "database" }, color: "#2563eb" });
    expect(boxOf(find(s.mem.stored, "i"))).toEqual({ x: 10, y: 10, w: 48, h: 48 });
  });

  it("finds a brand icon once the library is loaded, and a caption makes it a diagram node", async () => {
    const s = setup();
    await s.ok("create_icon", { id: "k", icon: "logo-postgresql", caption: "Orders\nDB", x: 0, y: 0 });
    expect(find(s.mem.stored, "k")).toMatchObject({ label: "Orders\nDB", ai: { icon: "logo-postgresql", role: "node" } });
  });

  it("names the closest icons when the name is unknown, and changes nothing", async () => {
    const s = setup();
    const result = await s.run("create_icon", { icon: "kafkaa-queue" });
    expect(result.error?.code).toBe("not_found");
    expect(result.error?.message).toContain("search_icons");
    expect(s.mem.stored).toHaveLength(0);
  });
});

describe("create_semantic_node", () => {
  it("fits the node to its label and keeps multi-line labels", async () => {
    const s = setup();
    await s.ok("create_semantic_node", { id: "a", label: "API", x: 0, y: 0 });
    await s.ok("create_semantic_node", { id: "b", label: "A much longer service name that has to wrap onto several lines", x: 0, y: 200 });
    await s.ok("create_semantic_node", { id: "c", label: "Line 1\nLine 2", x: 0, y: 400 });
    const [a, b, c] = ["a", "b", "c"].map((id) => boxOf(find(s.mem.stored, id)));
    expect(a.w).toBeGreaterThanOrEqual(168);
    expect(b.w).toBeGreaterThan(a.w);
    expect(b.h).toBeGreaterThan(a.h);
    expect(find(s.mem.stored, "c").label).toBe("Line 1\nLine 2");
    expect(c.h).toBeGreaterThanOrEqual(78);
  });

  it("takes kind colours, an icon and presentation settings, all validated", async () => {
    const s = setup();
    await s.ok("create_semantic_node", { id: "db", label: "Orders", kind: "database", icon: "logo-postgresql", x: 0, y: 0, icon_size: 40, icon_placement: "top", icon_color: "#ff0000", corner_radius: 20, font_weight: "700", opacity: 0.9 });
    const db = find<DrawingElement & { nodeStyle?: Record<string, unknown> }>(s.mem.stored, "db");
    expect(db.ai).toMatchObject({ icon: "logo-postgresql", semanticKind: "database", role: "node", semanticId: "db" });
    expect(db.nodeStyle).toEqual({ iconSize: 40, iconPlacement: "top", iconColor: "#ff0000", cornerRadius: 20 });
    expect(db).toMatchObject({ fontWeight: "700", opacity: 0.9 });
    expect(db.fill).toBeTruthy();
    expect((await s.run("create_semantic_node", { label: "x", icon_size: 500 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_semantic_node", { label: "x", icon_placement: "middle" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_semantic_node", { label: "x", kind: "Not A Kind" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_semantic_node", { label: "x", icon: "nope-nope-nope" })).error?.code).toBe("not_found");
  });

  it("enlarges a node smaller than its content allows and says so", async () => {
    const s = setup();
    const result = await s.ok("create_semantic_node", { id: "tiny", label: "T", x: 0, y: 0, width: 20, height: 10 });
    expect(result.warnings?.[0]).toContain("enlarged");
    expect(boxOf(find(s.mem.stored, "tiny")).w).toBeGreaterThan(20);
  });

  it("honours fill: null as no fill", async () => {
    const s = setup();
    await s.ok("create_semantic_node", { id: "n", label: "N", fill: null, x: 0, y: 0 });
    expect(find(s.mem.stored, "n").fill).toBeUndefined();
  });
});

describe("create_group", () => {
  it("groups existing elements under a name without moving them or breaking connectors", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const untouched = JSON.stringify(s.mem.stored.filter((e) => e.id === "c"));
    const result = await s.ok("create_group", { id: "g", ids: ["a", "b"], name: "Backend" });
    expect(result.data).toMatchObject({ id: "g", members: expect.arrayContaining(["a", "b"]) });
    expect(find(s.mem.stored, "g")).toMatchObject({ type: "group", name: "Backend" });
    expect(find(s.mem.stored, "a").groupId).toBe("g");
    expect(find(s.mem.stored, "ab")).toMatchObject({ startConnection: { elementId: "a" }, endConnection: { elementId: "b" } });
    expect(boxOf(find(s.mem.stored, "a"))).toEqual({ x: 0, y: 0, w: 168, h: 78 });
    expect(JSON.stringify(s.mem.stored.filter((e) => e.id === "c"))).toBe(untouched);
  });

  it("nests groups, refuses fewer than two, locked members and unknown ids", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0, { locked: true })] });
    await s.ok("create_group", { id: "inner", ids: ["a", "b"], name: "Inner" });
    const outer = await s.run("create_group", { id: "outer", ids: ["inner", "c"], name: "Outer" });
    expect(outer.error?.code).toBe("invalid_state");
    const s2 = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0)] });
    await s2.ok("create_group", { id: "inner", ids: ["a", "b"], name: "Inner" });
    await s2.ok("create_group", { id: "outer", ids: ["inner", "c"], name: "Outer" });
    expect(find(s2.mem.stored, "inner").groupId).toBe("outer");
    expect((await s2.run("create_group", { ids: ["a"], name: "Solo" })).error?.code).toBe("invalid_state");
    expect((await s2.run("create_group", { ids: ["a", "ghost"], name: "X" })).error?.code).toBe("not_found");
    expect((await s2.run("create_group", { ids: ["a", "c"], name: "" })).error?.code).toBe("invalid_arguments");
  });
});

describe("create_frame_or_section", () => {
  it("wraps elements in a titled frame behind them without moving anything", async () => {
    const s = setup({ elements: [node("a", "A", 100, 100), node("b", "B", 400, 100)] });
    const result = await s.ok("create_frame_or_section", { id: "fr", title: "Services", ids: ["a", "b"] });
    expect(result.affected.created).toEqual(["fr", "fr-label"]);
    expect(idsOf(s.mem.stored).slice(0, 2)).toEqual(["fr", "fr-label"]);
    const frame = boxOf(find(s.mem.stored, "fr"));
    expect(frame.x).toBeLessThan(100);
    expect(frame.x + frame.w).toBeGreaterThan(568);
    expect(find(s.mem.stored, "fr")).toMatchObject({ isGuide: true, ai: { role: "group" } });
    expect(find(s.mem.stored, "fr-label")).toMatchObject({ text: "Services", ai: { role: "group-label" } });
    expect(boxOf(find(s.mem.stored, "a"))).toMatchObject({ x: 100, y: 100 });
  });

  it("makes an empty frame from bounds and needs ids or bounds", async () => {
    const s = setup();
    await s.ok("create_frame_or_section", { id: "e", title: "Zone", bounds: { x: 0, y: 0, width: 300, height: 200 } });
    expect(boxOf(find(s.mem.stored, "e"))).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect((await s.run("create_frame_or_section", { title: "Nothing" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("create_frame_or_section", { id: "e", title: "Again", bounds: { x: 0, y: 0, width: 5, height: 5 } })).error?.code).toBe("conflict");
  });
});

describe("duplicate_elements", () => {
  it("copies nodes with the connectors and labels between them, leaving the originals alone", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("z", "Z", 700, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "calls" });
    await s.ok("create_connector", { id: "bz", from: "b", to: "z" });
    const before = JSON.stringify(s.mem.stored);
    const result = await s.ok("duplicate_elements", { ids: ["a", "b"] });
    const idMap = result.data!.idMap as Record<string, string>;
    expect(Object.keys(idMap).sort()).toEqual(["a", "ab", "ab-label", "b"]);
    expect(JSON.stringify(s.mem.stored.slice(0, 6))).toBe(before);
    const copyArrow = find<DrawingElement & { startConnection: { elementId: string }; endConnection: { elementId: string } }>(s.mem.stored, idMap.ab);
    expect(copyArrow.startConnection.elementId).toBe(idMap.a);
    expect(copyArrow.endConnection.elementId).toBe(idMap.b);
    const copyLabel = find(s.mem.stored, idMap["ab-label"]);
    expect(copyLabel.ai).toMatchObject({ role: "edge-label", semanticId: `${idMap.ab}-label` });
    expect(boxOf(find(s.mem.stored, idMap.a)).x).toBe(24);
    // the connector to the element that was not copied is not duplicated
    expect(Object.keys(idMap)).not.toContain("bz");
  });

  it("clones groups with their members and refuses nothing it cannot copy silently", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { groupId: "g" }), node("b", "B", 300, 0, { groupId: "g" }), groupRecord("g", { name: "G" })] });
    const result = await s.ok("duplicate_elements", { ids: ["g"], offset_steps: 3 });
    const created = result.affected.created;
    expect(created.length).toBe(3);
    const records = s.mem.stored.filter((e) => e.type === "group");
    expect(records).toHaveLength(2);
    expect((await s.run("duplicate_elements", { ids: ["ghost"] })).error?.code).toBe("not_found");
  });
});

describe("import_diagram", () => {
  const code = ["Client [kind: browser]", "API [kind: gateway]", "DB [kind: database]", "Client > API: HTTPS", "API > DB: SQL"].join("\n");

  it("adds a laid-out diagram beside existing content and leaves every existing element exactly as it was", async () => {
    const existing = [node("keep", "Keep me", 0, 0)];
    const s = setup({ elements: existing });
    const before = JSON.stringify(s.mem.stored[0]);
    const result = await s.ok("import_diagram", { code });
    expect(JSON.stringify(s.mem.stored[0])).toBe(before);
    const created = result.affected.created.map((id) => find(s.mem.stored, id));
    expect(created.filter((e) => e.ai?.role === "node")).toHaveLength(3);
    expect(created.filter((e) => e.type === "arrow")).toHaveLength(2);
    expect(Math.min(...created.map((e) => boxOf(e).x))).toBeGreaterThanOrEqual(168);
    expect(new Set(idsOf(s.mem.stored)).size).toBe(s.mem.stored.length);
    const validation = await s.ok("validate_diagram");
    expect((validation.data!.issues as Array<{ severity: string }>).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("honours x and y, and the connectors are attached to the new nodes", async () => {
    const s = setup();
    await s.ok("import_diagram", { code, x: 500, y: 300 });
    const nodes = s.mem.stored.filter((e) => (e as DrawingElement).ai?.role === "node");
    expect(Math.min(...nodes.map((e) => boxOf(e as DrawingElement).x))).toBe(500);
    const arrows = s.mem.stored.filter((e) => e.type === "arrow") as Array<DrawingElement & { startConnection: { elementId: string }; endConnection: { elementId: string } }>;
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const a of arrows) expect([nodeIds.has(a.startConnection.elementId), nodeIds.has(a.endConnection.elementId)]).toEqual([true, true]);
  });

  it("rejects code with errors, quoting the line, and changes nothing", async () => {
    const s = setup({ elements: [node("keep", "Keep me", 0, 0)] });
    const result = await s.run("import_diagram", { code: "A [kind: service\nB > " });
    expect(result.error?.code).toBe("invalid_arguments");
    expect(result.error?.message).toMatch(/line \d/);
    expect(idsOf(s.mem.stored)).toEqual(["keep"]);
    expect((await s.run("import_diagram", { code: "// nothing here" })).ok).toBe(false);
  });
});
