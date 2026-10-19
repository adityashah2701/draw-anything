import { describe, expect, it } from "vitest";
import { isEffectivelyHidden } from "@/core/groups/visibility";
import { buildGroupIndex } from "@/core/groups/group-index";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, groupRecord, idsOf, node, rectangle, setup } from "../test-helpers";

type Styled = DrawingElement & { opacity?: number; cornerRadius?: number; nodeStyle?: Record<string, unknown> };

describe("update_shape_style", () => {
  it("changes only the properties given", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 100, 60, { fill: "#ffffff", strokeWidth: 2, label: "R" })] });
    const before = find<Styled>(s.mem.stored, "r");
    await s.ok("update_shape_style", { ids: ["r"], color: "blue", opacity: 0.4 });
    const after = find<Styled>(s.mem.stored, "r");
    expect(after.opacity).toBe(0.4);
    expect(after.color).not.toBe(before.color);
    expect({ ...after, color: before.color, opacity: undefined }).toEqual({ ...before, opacity: undefined });
  });

  it("sets fill, removes it with null, restores full opacity as no stored value, and radius per shape kind", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 100, 60, { fill: "#ffffff", opacity: 0.3 }), node("n", "N", 200, 0)] });
    await s.ok("update_shape_style", { ids: ["r", "n"], fill: null, opacity: 1, corner_radius: 12 });
    expect(find<Styled>(s.mem.stored, "r")).toMatchObject({ cornerRadius: 12 });
    expect(find<Styled>(s.mem.stored, "r").fill).toBeUndefined();
    expect(find<Styled>(s.mem.stored, "r")).not.toHaveProperty("opacity");
    expect(find<Styled>(s.mem.stored, "n").nodeStyle).toEqual({ cornerRadius: 12 });
    expect(find<Styled>(s.mem.stored, "n")).not.toHaveProperty("cornerRadius");
  });

  it("expands a group id to its members", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 50, 50, { groupId: "g" }), rectangle("b", 100, 0, 50, 50, { groupId: "g" }), groupRecord("g")] });
    const result = await s.ok("update_shape_style", { ids: ["g"], color: "#ff0000" });
    expect(result.affected.updated.sort()).toEqual(["a", "b"]);
  });

  it("reports an element that cannot take a property and applies the rest; fails when none can", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0), { ...rectangle("t", 300, 0), type: "text", text: "hi", points: [{ x: 300, y: 0 }] } as DrawingElement] });
    const mixed = await s.ok("update_shape_style", { ids: ["r", "t"], corner_radius: 8 });
    expect(mixed.affected.updated).toEqual(["r"]);
    expect(mixed.skipped).toEqual([{ id: "t", reason: expect.stringContaining("cannot take cornerRadius") }]);
    const none = await s.run("update_shape_style", { ids: ["t"], corner_radius: 8 });
    expect(none.error?.code).toBe("unsupported");
  });

  it("refuses locked elements unless told to leave them out", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0), rectangle("b", 200, 0, 100, 60, { locked: true })] });
    const refused = await s.run("update_shape_style", { ids: ["a", "b"], color: "red" });
    expect(refused.error).toMatchObject({ code: "locked", ids: ["b"] });
    const untouchedColor = find(s.mem.stored, "a").color;
    expect(untouchedColor).toBe(find(setup({ elements: [rectangle("a", 0, 0)] }).mem.stored, "a").color);
    const skipped = await s.ok("update_shape_style", { ids: ["a", "b"], color: "red", skip_locked: true });
    expect(skipped.affected.updated).toEqual(["a"]);
    expect(skipped.skipped).toEqual([{ id: "b", reason: "locked" }]);
    expect((await s.run("update_shape_style", { ids: ["b"], color: "red", skip_locked: true })).error?.code).toBe("locked");
  });

  it("validates colours and ranges, and reports an unchanged style as such", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 100, 60, { opacity: 0.5 })] });
    expect((await s.run("update_shape_style", { ids: ["a"], color: "not-a-colour" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_shape_style", { ids: ["a"], opacity: 2 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_shape_style", { ids: ["a"], stroke_width: 0 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_shape_style", { ids: ["a"] })).error?.code).toBe("invalid_arguments");
    const same = await s.ok("update_shape_style", { ids: ["a"], opacity: 0.5 });
    expect(same.summary).toMatch(/nothing changed/i);
    expect(same.affected.updated).toEqual([]);
    expect(s.mem.historyDepth().undo).toBe(0);
  });
});

describe("update_text", () => {
  it("edits a text element, a shape label and a node label, keeping line breaks", async () => {
    const s = setup({ elements: [{ ...rectangle("t", 0, 0), type: "text", text: "old", points: [{ x: 0, y: 0 }] } as DrawingElement, rectangle("r", 200, 0, 100, 60, { label: "Old" }), node("n", "Node", 400, 0)] });
    await s.ok("update_text", { ids: ["t"], text: "Line 1\r\nLine 2" });
    await s.ok("update_text", { ids: ["r", "n"], text: "Billing\nService" });
    expect(find(s.mem.stored, "t").text).toBe("Line 1\nLine 2");
    expect(find(s.mem.stored, "r").label).toBe("Billing\nService");
    expect(find(s.mem.stored, "n").label).toBe("Billing\nService");
  });

  it("clears a label with empty text but never empties a text element", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 100, 60, { label: "Gone" }), { ...rectangle("t", 200, 0), type: "text", text: "keep", points: [{ x: 200, y: 0 }] } as DrawingElement] });
    await s.ok("update_text", { ids: ["r"], text: "" });
    expect(find(s.mem.stored, "r").label).toBe("");
    const refused = await s.run("update_text", { ids: ["t"], text: "  " });
    expect(refused.error?.code).toBe("invalid_arguments");
    expect(find(s.mem.stored, "t").text).toBe("keep");
  });

  it("sends connector labels to the connector tool and rejects shapes without text", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), { ...rectangle("ln", 0, 300), type: "line", points: [{ x: 0, y: 300 }, { x: 50, y: 300 }] } as DrawingElement] });
    await s.ok("create_connector", { id: "c", from: "a", to: "b", label: "calls" });
    const label = await s.run("update_text", { ids: ["c-label"], text: "x" });
    expect(label.error?.code).toBe("unsupported");
    expect(label.error?.message).toContain("update_connector_label");
    const line = await s.run("update_text", { ids: ["ln"], text: "x" });
    expect(line.error?.code).toBe("unsupported");
  });

  it("changes typography alone, and applies to the targets that have text", async () => {
    const s = setup({ elements: [node("n", "Node", 0, 0), rectangle("r", 200, 0, 100, 60, { label: "R" })] });
    await s.ok("update_text", { ids: ["n", "r"], font_size: 24, font_weight: "700", font_style: "italic", color: "#112233" });
    expect(find(s.mem.stored, "n")).toMatchObject({ fontSize: 24, fontWeight: "700", fontStyle: "italic", color: "#112233" });
    expect(find(s.mem.stored, "r")).toMatchObject({ fontSize: 24, fontWeight: "700" });
    expect((await s.run("update_text", { ids: ["n"] })).error?.code).toBe("invalid_arguments");
  });

  it("is atomic across locked targets", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0, { locked: true })] });
    expect((await s.run("update_text", { ids: ["a", "b"], text: "New" })).error?.code).toBe("locked");
    expect(find(s.mem.stored, "a").label).toBe("A");
    await s.ok("update_text", { ids: ["a", "b"], text: "New", skip_locked: true });
    expect(find(s.mem.stored, "a").label).toBe("New");
    expect(find(s.mem.stored, "b").label).toBe("B");
  });
});

describe("update_icon", () => {
  it("replaces, hides and restores a node's icon without touching its label or size", async () => {
    const s = setup({ elements: [node("db", "Orders", 0, 0, { ai: { icon: "database", semanticKind: "database" } })] });
    const before = find(s.mem.stored, "db");
    await s.ok("update_icon", { ids: ["db"], icon: "logo-postgresql" });
    expect(find(s.mem.stored, "db").ai).toMatchObject({ icon: "logo-postgresql", semanticKind: "database" });
    expect(find(s.mem.stored, "db").label).toBe("Orders");
    expect(find<Styled>(s.mem.stored, "db").nodeStyle).toMatchObject({ originalIcon: "database" });
    await s.ok("update_icon", { ids: ["db"], action: "remove" });
    expect(find<Styled>(s.mem.stored, "db").nodeStyle).toMatchObject({ iconHidden: true });
    await s.ok("update_icon", { ids: ["db"], action: "restore" });
    const restored = find<Styled>(s.mem.stored, "db");
    expect(restored.ai).toMatchObject({ icon: "database" });
    expect(restored.nodeStyle).toBeUndefined();
    expect(boxOf(restored)).toEqual(boxOf(before));
  });

  it("replaces a standalone icon, and refuses shapes that have no icon", async () => {
    const s = setup({ elements: [{ ...rectangle("i", 0, 0, 64, 64), type: "icon", ai: { icon: "database" } } as DrawingElement, rectangle("r", 200, 0)] });
    await s.ok("update_icon", { ids: ["i"], icon: "message-broker" });
    expect(find(s.mem.stored, "i").ai?.icon).toBe("message-broker");
    expect((await s.run("update_icon", { ids: ["r"], icon: "database" })).error?.code).toBe("unsupported");
    expect((await s.run("update_icon", { ids: ["i"], icon: "no-such-icon-anywhere" })).error?.code).toBe("not_found");
    expect((await s.run("update_icon", { ids: ["i"] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_icon", { ids: ["i"], action: "replace" })).error?.code).toBe("invalid_arguments");
  });

  it("applies to several nodes in one undo step and respects locks", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0, { locked: true })] });
    expect((await s.run("update_icon", { ids: ["a", "b", "c"], icon: "database" })).error?.code).toBe("locked");
    const ok = await s.ok("update_icon", { ids: ["a", "b", "c"], icon: "database", skip_locked: true });
    expect(ok.affected.updated.sort()).toEqual(["a", "b"]);
    expect(s.mem.historyDepth().undo).toBe(1);
  });
});

describe("update_semantic_node", () => {
  it("changes label, icon, presentation and look together as one undo step", async () => {
    const s = setup({ elements: [node("n", "Old", 0, 0, { ai: { icon: "api" } })] });
    await s.ok("update_semantic_node", { ids: ["n"], label: "Billing\nAPI", icon: "database", icon_size: 32, icon_placement: "right", icon_color: "#ff0000", corner_radius: 16, fill: "#dbeafe", font_weight: "700", kind: "service" });
    const n = find<Styled>(s.mem.stored, "n");
    expect(n).toMatchObject({ label: "Billing\nAPI", fill: "#dbeafe", fontWeight: "700", ai: { icon: "database", semanticKind: "service" } });
    expect(n.nodeStyle).toMatchObject({ iconSize: 32, iconPlacement: "right", iconColor: "#ff0000", cornerRadius: 16 });
    expect(s.mem.historyDepth().undo).toBe(1);
    await s.ok("undo_action");
    expect(find(s.mem.stored, "n").label).toBe("Old");
  });

  it("resets settings to their defaults", async () => {
    const s = setup({ elements: [node("n", "N", 0, 0, { nodeStyle: { iconSize: 40, iconPlacement: "top", cornerRadius: 20 } })] });
    await s.ok("update_semantic_node", { ids: ["n"], reset: ["icon_size", "icon_placement", "corner_radius"] });
    expect(find<Styled>(s.mem.stored, "n").nodeStyle).toBeUndefined();
    await s.ok("update_semantic_node", { ids: ["n"], icon_visible: false });
    expect(find<Styled>(s.mem.stored, "n").nodeStyle).toEqual({ iconHidden: true });
    await s.ok("update_semantic_node", { ids: ["n"], icon_visible: true });
    expect(find<Styled>(s.mem.stored, "n").nodeStyle).toBeUndefined();
  });

  it("only edits semantic nodes, and rejects values outside the editor's limits", async () => {
    const s = setup({ elements: [node("n", "N", 0, 0), rectangle("r", 300, 0)] });
    expect((await s.run("update_semantic_node", { ids: ["n", "r"], label: "x" })).error?.code).toBe("unsupported");
    expect((await s.run("update_semantic_node", { ids: ["n"], icon_size: 5 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_semantic_node", { ids: ["n"], corner_radius: 99 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_semantic_node", { ids: ["n"] })).error?.code).toBe("invalid_arguments");
    expect(find(s.mem.stored, "n").label).toBe("N");
  });
});

describe("update_element", () => {
  it("combines a text change and a style change in one step", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 100, 60, { label: "Old" })] });
    await s.ok("update_element", { ids: ["r"], text: "New", fill: "#fef9c3", color: "#854d0e" });
    expect(find(s.mem.stored, "r")).toMatchObject({ label: "New", fill: "#fef9c3" });
    expect(s.mem.historyDepth().undo).toBe(1);
  });
});

describe("move_elements", () => {
  const board = () => [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0)];

  it("moves by an offset and the attached connector follows with its anchors intact", async () => {
    const s = setup({ elements: board() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("move_elements", { ids: ["b"], dx: 0, dy: 200 });
    expect(boxOf(find(s.mem.stored, "b"))).toMatchObject({ x: 300, y: 200 });
    const arrow = find<DrawingElement & { startConnection: { elementId: string }; endConnection: { elementId: string; anchorId?: string } }>(s.mem.stored, "ab");
    expect(arrow.endConnection.elementId).toBe("b");
    const end = arrow.points[arrow.points.length - 1];
    expect(end.y).toBeGreaterThanOrEqual(200);
    expect(end.y).toBeLessThanOrEqual(278);
  });

  it("moves to an absolute corner, treating several elements as one box", async () => {
    const s = setup({ elements: board() });
    const result = await s.ok("move_elements", { ids: ["a", "b"], x: 1000, y: 500 });
    expect(result.data).toMatchObject({ x: 1000, y: 500 });
    expect(boxOf(find(s.mem.stored, "a"))).toMatchObject({ x: 1000, y: 500 });
    expect(boxOf(find(s.mem.stored, "b"))).toMatchObject({ x: 1300, y: 500 });
    expect(boxOf(find(s.mem.stored, "c")).x).toBe(600);
  });

  it("moves a group as a unit, and nested groups too", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { groupId: "inner" }), node("b", "B", 300, 0, { groupId: "inner" }), node("c", "C", 600, 0, { groupId: "outer" }), groupRecord("inner", { groupId: "outer" }), groupRecord("outer")] });
    const result = await s.ok("move_elements", { ids: ["outer"], dx: 50, dy: 10 });
    expect(result.affected.updated.sort()).toEqual(["a", "b", "c"]);
    expect(boxOf(find(s.mem.stored, "c"))).toMatchObject({ x: 650, y: 10 });
  });

  it("rejects ambiguous or missing positions, locked elements and unknown ids", async () => {
    const s = setup({ elements: [...board().slice(0, 2), node("l", "L", 600, 0, { locked: true })] });
    expect((await s.run("move_elements", { ids: ["a"] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("move_elements", { ids: ["a"], dx: 1, x: 5 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("move_elements", { ids: ["l"], dx: 5 })).error?.code).toBe("locked");
    expect((await s.run("move_elements", { ids: ["ghost"], dx: 5 })).error?.code).toBe("not_found");
    expect((await s.run("move_elements", { ids: ["a"], dx: Number.POSITIVE_INFINITY })).error?.code).toBe("invalid_arguments");
    const partial = await s.ok("move_elements", { ids: ["a", "l"], dx: 5, skip_locked: true });
    expect(partial.skipped).toEqual([{ id: "l", reason: "locked" }]);
    expect(boxOf(find(s.mem.stored, "l")).x).toBe(600);
  });

  it("does nothing, and says so, when the element is already there", async () => {
    const s = setup({ elements: board() });
    const result = await s.ok("move_elements", { ids: ["a"], x: 0, y: 0 });
    expect(result.summary).toContain("Already there");
    expect(s.mem.historyDepth().undo).toBe(0);
  });
});

describe("resize_element", () => {
  it("sets the width and height of one element", async () => {
    const s = setup({ elements: [node("n", "N", 100, 100)] });
    const result = await s.ok("resize_element", { ids: ["n"], width: 240, height: 120 });
    expect(boxOf(find(s.mem.stored, "n"))).toEqual({ x: 100, y: 100, w: 240, h: 120 });
    expect(result.data).toMatchObject({ after: { width: 240, height: 120 } });
  });

  it("keeps the proportions when asked and moves the corner on request", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 200, 100)] });
    await s.ok("resize_element", { ids: ["r"], width: 400, keep_aspect_ratio: true });
    expect(boxOf(find(s.mem.stored, "r"))).toMatchObject({ w: 400, h: 200 });
    await s.ok("resize_element", { ids: ["r"], x: 50, y: 60 });
    expect(boxOf(find(s.mem.stored, "r"))).toMatchObject({ x: 50, y: 60, w: 400 });
  });

  it("makes several nodes the same size when called per node, and keeps connectors attached", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 400, 0, {}, { w: 220, h: 100 })] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    for (const id of ["a", "b"]) await s.ok("resize_element", { ids: [id], width: 200, height: 90 });
    expect(boxOf(find(s.mem.stored, "a"))).toMatchObject({ w: 200, h: 90 });
    expect(boxOf(find(s.mem.stored, "b"))).toMatchObject({ w: 200, h: 90 });
    const arrow = find<DrawingElement & { startConnection?: { elementId: string }; endConnection?: { elementId: string } }>(s.mem.stored, "ab");
    expect([arrow.startConnection?.elementId, arrow.endConnection?.elementId]).toEqual(["a", "b"]);
    expect(arrow.points[0].x).toBe(200);
  });

  it("scales a group together", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 100, 100, { groupId: "g" }), rectangle("b", 200, 0, 100, 100, { groupId: "g" }), groupRecord("g")] });
    await s.ok("resize_element", { ids: ["g"], width: 600 });
    expect(boxOf(find(s.mem.stored, "a"))).toMatchObject({ x: 0, w: 200 });
    expect(boxOf(find(s.mem.stored, "b"))).toMatchObject({ x: 400, w: 200 });
  });

  it("refuses locked elements, no-op calls and impossible sizes", async () => {
    const s = setup({ elements: [rectangle("r", 0, 0, 100, 100, { locked: true }), rectangle("q", 300, 0, 100, 100)] });
    expect((await s.run("resize_element", { ids: ["r"], width: 50 })).error?.code).toBe("locked");
    expect((await s.run("resize_element", { ids: ["q"] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("resize_element", { ids: ["q"], width: 0 })).error?.code).toBe("invalid_arguments");
    expect((await s.run("resize_element", { ids: ["q"], width: 1e9 })).error?.code).toBe("invalid_arguments");
    const same = await s.ok("resize_element", { ids: ["q"], width: 100 });
    expect(same.summary).toContain("Nothing changed");
    expect(same.affected.updated).toEqual([]);
    expect(s.mem.historyDepth().undo).toBe(0);
  });
});

describe("rotate_elements", () => {
  it("sets one shape's angle, and turns a selection about its centre", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0, 100, 40), rectangle("b", 200, 0, 100, 40)] });
    await s.ok("rotate_elements", { ids: ["a"], degrees: 30 });
    expect(find<DrawingElement>(s.mem.stored, "a").rotation).toBe(30);
    await s.ok("rotate_elements", { ids: ["a"], degrees: 0 });
    expect(find<DrawingElement>(s.mem.stored, "a")).not.toHaveProperty("rotation");
    const before = boxOf(find(s.mem.stored, "b"));
    await s.ok("rotate_elements", { ids: ["a", "b"], degrees: 90 });
    expect(boxOf(find(s.mem.stored, "b"))).not.toEqual(before);
    expect(find<DrawingElement>(s.mem.stored, "b").rotation).toBe(90);
  });

  it("rejects mode set on several elements, unrotatable targets and locked ones", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0), rectangle("b", 200, 0), rectangle("l", 400, 0, 100, 80, { locked: true }), { ...rectangle("t", 600, 0), type: "text", text: "x", points: [{ x: 600, y: 0 }] } as DrawingElement] });
    expect((await s.run("rotate_elements", { ids: ["a", "b"], degrees: 10, mode: "set" })).error?.code).toBe("invalid_arguments");
    expect((await s.run("rotate_elements", { ids: ["l"], degrees: 10 })).error?.code).toBe("locked");
    expect((await s.run("rotate_elements", { ids: ["t"], degrees: 10 })).error?.code).toBe("unsupported");
    expect((await s.run("rotate_elements", { ids: ["a"], degrees: 400 })).error?.code).toBe("invalid_arguments");
  });
});

describe("lock, hide, show and order", () => {
  it("locks and unlocks, including a group and what is nested in it, and is idempotent", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { groupId: "g" }), node("b", "B", 300, 0, { groupId: "g" }), groupRecord("g")] });
    await s.ok("lock_elements", { ids: ["g"] });
    expect(find<DrawingElement>(s.mem.stored, "g" as never).locked).toBe(true);
    expect((await s.run("move_elements", { ids: ["a"], dx: 5 })).error?.code).toBe("locked");
    expect((await s.ok("lock_elements", { ids: ["g"] })).summary).toContain("Already locked");
    await s.ok("unlock_elements", { ids: ["a"] });
    expect((await s.ok("move_elements", { ids: ["a"], dx: 5 })).ok).toBe(true);
    expect((await s.run("lock_elements", { ids: ["ghost"] })).error?.code).toBe("not_found");
  });

  it("hides and shows elements; a connector with a hidden end is hidden with it; the data stays", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("hide_elements", { ids: ["b"] });
    expect(find<DrawingElement>(s.mem.stored, "b").hidden).toBe(true);
    expect(isEffectivelyHidden(buildGroupIndex(s.mem.stored), "ab")).toBe(true);
    expect(s.mem.stored).toHaveLength(4 - 1 + 0 || 3);
    const hidden = await s.ok("find_elements", { hidden: true });
    expect((hidden.data!.elements as Array<{ id: string }>).map((e) => e.id)).toContain("b");
    await s.ok("show_elements", { ids: ["b"] });
    expect(find<DrawingElement>(s.mem.stored, "b")).not.toHaveProperty("hidden");
    await s.ok("hide_elements", { ids: ["a", "b"] });
    await s.ok("show_elements", { all: true });
    expect(s.mem.stored.some((e) => e.hidden)).toBe(false);
    expect((await s.run("show_elements", {})).error?.code).toBe("invalid_arguments");
  });

  it("does not hide a locked element", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { locked: true })] });
    const result = await s.ok("hide_elements", { ids: ["a"] });
    expect(result.skipped).toEqual([{ id: "a", reason: "locked" }]);
    expect(find<DrawingElement>(s.mem.stored, "a")).not.toHaveProperty("hidden");
  });

  it("restacks: front, back, and one step", async () => {
    const s = setup({ elements: [rectangle("a", 0, 0), rectangle("b", 10, 0), rectangle("c", 20, 0)] });
    await s.ok("reorder_elements", { ids: ["a"], move: "front" });
    expect(idsOf(s.mem.stored)).toEqual(["b", "c", "a"]);
    await s.ok("reorder_elements", { ids: ["a"], move: "backward" });
    expect(idsOf(s.mem.stored)).toEqual(["b", "a", "c"]);
    await s.ok("reorder_elements", { ids: ["c"], move: "back" });
    expect(idsOf(s.mem.stored)).toEqual(["c", "b", "a"]);
    expect((await s.ok("reorder_elements", { ids: ["c"], move: "back" })).summary).toContain("Already");
    expect((await s.run("reorder_elements", { ids: ["a"], move: "sideways" })).error?.code).toBe("invalid_arguments");
  });
});

describe("delete_elements", () => {
  const diagram = async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "x" });
    await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
    return s;
  };

  it("deletes the node and its connectors and their labels, and keeps everything else", async () => {
    const s = await diagram();
    const result = await s.ok("delete_elements", { ids: ["b"] });
    expect(result.data).toMatchObject({ connectorsRemoved: expect.arrayContaining(["ab", "bc"]), labelsRemoved: ["ab-label"] });
    expect(idsOf(s.mem.stored)).toEqual(["a", "c"]);
    expect(find(s.mem.stored, "a").label).toBe("A");
    expect((await s.ok("validate_diagram")).data!.ok).toBe(true);
  });

  it("deleting a connector alone never removes the elements it joined", async () => {
    const s = await diagram();
    await s.ok("delete_elements", { ids: ["bc"] });
    expect(idsOf(s.mem.stored)).toEqual(["a", "b", "c", "ab", "ab-label"]);
  });

  it("removes a group that loses its last member and keeps one that still has members", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { groupId: "g" }), node("b", "B", 300, 0, { groupId: "g" }), node("c", "C", 600, 0, { groupId: "h" }), groupRecord("g"), groupRecord("h")] });
    await s.ok("delete_elements", { ids: ["c"] });
    expect(idsOf(s.mem.stored)).toEqual(["a", "b", "g"]);
    await s.ok("delete_elements", { ids: ["a"] });
    expect(idsOf(s.mem.stored)).toEqual(["b", "g"]);
  });

  it("refuses locked elements or leaves them out when told to", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0, { locked: true })] });
    expect((await s.run("delete_elements", { ids: ["a", "b"] })).error?.code).toBe("locked");
    expect(s.mem.stored).toHaveLength(2);
    const result = await s.ok("delete_elements", { ids: ["a", "b"], skip_locked: true });
    expect(result.skipped).toEqual([{ id: "b", reason: "locked" }]);
    expect(idsOf(s.mem.stored)).toEqual(["b"]);
  });

  it("requires confirmation for a large deletion, then asks the person", async () => {
    const many = Array.from({ length: 30 }, (_, i) => rectangle(`r${i}`, i * 150, 0));
    const declined = setup({ elements: many, approve: () => false });
    const ids = many.map((m) => m.id);
    expect((await declined.run("delete_elements", { ids })).error?.code).toBe("confirmation_required");
    expect((await declined.run("delete_elements", { ids, confirm: true })).error?.code).toBe("confirmation_denied");
    expect(declined.mem.stored).toHaveLength(30);
    const approved = setup({ elements: many });
    expect((await approved.run("delete_elements", { ids, confirm: true })).ok).toBe(true);
    expect(approved.mem.stored).toHaveLength(0);
    expect(approved.mem.calls.confirmations).toEqual([{ tool: "delete_elements", message: expect.stringContaining("30") }]);
  });

  it("refuses to run on a board someone else changed since the agent last looked", async () => {
    const s = await diagram();
    await s.ok("get_document_state");
    s.mem.external([...s.mem.stored, rectangle("theirs", 0, 400)]);
    expect((await s.run("delete_elements", { ids: ["a"] })).error?.code).toBe("stale_document");
    expect(s.mem.stored.some((e) => e.id === "a")).toBe(true);
  });

  it("is a single undo step that brings everything back", async () => {
    const s = await diagram();
    const before = JSON.stringify(s.mem.stored);
    const depth = s.mem.historyDepth().undo;
    await s.ok("delete_elements", { ids: ["b"] });
    expect(s.mem.historyDepth().undo).toBe(depth + 1);
    await s.ok("undo_action");
    expect(JSON.stringify(s.mem.stored)).toBe(before);
  });
});
