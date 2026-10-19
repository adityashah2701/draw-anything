import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, idsOf, node, rectangle, setup } from "../test-helpers";

type Arrow = DrawingElement & {
  startConnection?: { elementId: string; anchorId?: string };
  endConnection?: { elementId: string; anchorId?: string };
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  routingMode?: string;
};

const pair = () => [node("a", "A", 0, 0), node("b", "B", 400, 0), node("c", "C", 400, 300)];

describe("create_connector", () => {
  it("attaches both ends at anchors on the facing sides, with the path ending on them", async () => {
    const s = setup({ elements: pair() });
    const result = await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const arrow = find<Arrow>(s.mem.stored, "ab");
    expect(arrow.startConnection).toMatchObject({ elementId: "a", anchorId: expect.stringContaining("right") });
    expect(arrow.endConnection).toMatchObject({ elementId: "b", anchorId: expect.stringContaining("left") });
    expect(arrow.points[0]).toMatchObject({ x: 168, y: 39 });
    expect(arrow.points[arrow.points.length - 1]).toMatchObject({ x: 400, y: 39 });
    expect(result.data).toMatchObject({ created: ["ab"], connectors: [{ id: "ab", from: "a", to: "b", fromSide: "right", toSide: "left" }] });
    expect(arrow).toMatchObject({ arrowHeadEnd: true, routingMode: "orthogonal" });
  });

  it("uses the sides asked for, the type and the look", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ac", from: "a", to: "c", from_side: "bottom", to_side: "left", type: "arrow-bidirectional", dashed: true, color: "#dc2626", stroke_width: 3, routing: "straight" });
    const arrow = find<Arrow>(s.mem.stored, "ac");
    expect(arrow.type).toBe("arrow-bidirectional");
    expect(arrow).toMatchObject({ dashed: true, strokeWidth: 3, arrowHeadStart: true, arrowHeadEnd: true, routingMode: "straight" });
    expect(arrow.startConnection?.anchorId).toContain("bottom");
    expect(arrow.endConnection?.anchorId).toContain("left");
    expect(arrow.points).toHaveLength(2);
  });

  it("routes around a shape standing between the two", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("wall", "Wall", 300, -20, {}, { w: 120, h: 120 }), node("b", "B", 600, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const arrow = find<Arrow>(s.mem.stored, "ab");
    expect(arrow.points.length).toBeGreaterThan(2);
    for (const p of arrow.points) expect(!(p.x > 300 && p.x < 420 && p.y > -20 && p.y < 100)).toBe(true);
  });

  it("adds a label that sits clear of the shapes and is linked to the connector", async () => {
    const s = setup({ elements: pair() });
    const result = await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "HTTPS\nport 443" });
    expect(result.affected.created).toEqual(["ab", "ab-label"]);
    expect(find(s.mem.stored, "ab-label")).toMatchObject({ type: "text", text: "HTTPS\nport 443", ai: { role: "edge-label", semanticId: "ab-label" } });
  });

  it("does not add a second connector for the same direction (a retry is safe) unless asked", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const again = await s.ok("create_connector", { id: "ab2", from: "a", to: "b" });
    expect(again.affected.created).toEqual([]);
    expect(again.data).toMatchObject({ alreadyConnected: [{ id: "ab" }] });
    expect(again.warnings?.[0]).toContain("already connected");
    const reverse = await s.ok("create_connector", { id: "ba", from: "b", to: "a" });
    expect(reverse.affected.created).toEqual(["ba"]);
    const dup = await s.ok("create_connector", { id: "ab3", from: "a", to: "b", allow_duplicate: true });
    expect(dup.affected.created).toEqual(["ab3"]);
  });

  it("rejects missing elements, the same element twice, unconnectable shapes and a taken id", async () => {
    const s = setup({ elements: [...pair(), { ...rectangle("t", 0, 400), type: "text", text: "hi", points: [{ x: 0, y: 400 }] } as DrawingElement] });
    expect((await s.run("create_connector", { from: "a", to: "ghost" })).error).toMatchObject({ code: "not_found", ids: ["ghost"] });
    expect((await s.run("create_connector", { from: "a", to: "a" })).error?.code).toBe("invalid_state");
    expect((await s.run("create_connector", { from: "a", to: "t" })).error?.code).toBe("unsupported");
    expect((await s.run("create_connector", { id: "a", from: "a", to: "b" })).error?.code).toBe("conflict");
    expect((await s.run("create_connector", { from: "a", to: "b", from_side: "middle" })).error?.code).toBe("invalid_arguments");
    expect(idsOf(s.mem.stored)).toEqual(["a", "b", "c", "t"]);
  });

  it("connects to a locked element (it is not edited) and survives undo", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { locked: true }), node("b", "B", 400, 0)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    expect(find<DrawingElement>(s.mem.stored, "a").locked).toBe(true);
    await s.ok("undo_action");
    expect(idsOf(s.mem.stored)).toEqual(["a", "b"]);
  });
});

describe("connect_elements", () => {
  it("connects several pairs in one step, skipping pairs that are already connected", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const result = await s.ok("connect_elements", { connections: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "queries" }, { from: "a", to: "c", dashed: true }] });
    expect(result.data!.created).toHaveLength(2);
    expect(result.data!.alreadyConnected).toEqual([expect.objectContaining({ id: "ab" })]);
    expect(result.affected.created).toHaveLength(3);
    expect(s.mem.historyDepth().undo).toBe(2);
  });

  it("is all or nothing: one bad pair creates none", async () => {
    const s = setup({ elements: pair() });
    const result = await s.run("connect_elements", { connections: [{ from: "a", to: "b" }, { from: "b", to: "ghost" }] });
    expect(result.error?.code).toBe("not_found");
    expect(idsOf(s.mem.stored)).toEqual(["a", "b", "c"]);
  });

  it("refuses an empty list and the same id used twice", async () => {
    const s = setup({ elements: pair() });
    expect((await s.run("connect_elements", { connections: [] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("connect_elements", { connections: [{ id: "x", from: "a", to: "b" }, { id: "x", from: "b", to: "c" }] })).error?.code).toBe("conflict");
  });
});

describe("update_connector", () => {
  const withArrow = async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "x" });
    return s;
  };

  it("changes type, dashing, colour and routing and keeps the attachments", async () => {
    const s = await withArrow();
    await s.ok("update_connector", { ids: ["ab"], type: "arrow-bidirectional", dashed: true, color: "#16a34a", routing: "straight" });
    const arrow = find<Arrow>(s.mem.stored, "ab");
    expect(arrow).toMatchObject({ type: "arrow-bidirectional", dashed: true, routingMode: "straight", arrowHeadStart: true });
    expect(arrow.points).toHaveLength(2);
    expect([arrow.startConnection?.elementId, arrow.endConnection?.elementId]).toEqual(["a", "b"]);
    await s.ok("update_connector", { ids: ["ab"], routing: "orthogonal", head_start: false });
    expect(find<Arrow>(s.mem.stored, "ab").arrowHeadStart).toBe(false);
  });

  it("re-attaches an end to another element and side, moving the label with it", async () => {
    const s = await withArrow();
    const labelBefore = boxOf(find(s.mem.stored, "ab-label"));
    await s.ok("update_connector", { ids: ["ab"], to: { id: "c", side: "top" } });
    const arrow = find<Arrow>(s.mem.stored, "ab");
    expect(arrow.endConnection).toMatchObject({ elementId: "c" });
    expect(arrow.endConnection?.anchorId).toContain("top");
    expect(arrow.points[arrow.points.length - 1]).toMatchObject({ x: 484, y: 300 });
    expect(boxOf(find(s.mem.stored, "ab-label"))).not.toEqual(labelBefore);
  });

  it("rejects non-connectors, locked connectors, nothing to change and bad re-attachments", async () => {
    const s = await withArrow();
    expect((await s.run("update_connector", { ids: ["a"], dashed: true })).error?.code).toBe("invalid_state");
    expect((await s.run("update_connector", { ids: ["ab"] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("update_connector", { ids: ["ab"], to: { id: "ghost" } })).error?.code).toBe("not_found");
    expect((await s.run("update_connector", { ids: ["ab", "ab"], to: { id: "c" } })).error?.code).toBe("invalid_arguments");
    await s.ok("lock_elements", { ids: ["ab"] });
    expect((await s.run("update_connector", { ids: ["ab"], dashed: true })).error?.code).toBe("locked");
  });
});

describe("update_connector_label", () => {
  it("sets, changes and removes a label, idempotently", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const set = await s.ok("update_connector_label", { id: "ab", text: "login" });
    expect(set.affected.created).toEqual(["ab-label"]);
    expect((await s.ok("update_connector_label", { id: "ab", text: "login" })).summary).toContain("already");
    await s.ok("update_connector_label", { id: "ab", text: "sign in\nstep 1" });
    expect(find(s.mem.stored, "ab-label").text).toBe("sign in\nstep 1");
    const removed = await s.ok("update_connector_label", { id: "ab", text: "" });
    expect(removed.affected.removed).toEqual(["ab-label"]);
    expect((await s.ok("update_connector_label", { id: "ab", text: "  " })).summary).toContain("no label");
  });

  it("follows the connector when a node it joins moves", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "x" });
    const before = boxOf(find(s.mem.stored, "ab-label"));
    await s.ok("move_elements", { ids: ["b"], dy: 250 });
    expect(boxOf(find(s.mem.stored, "ab-label"))).not.toEqual(before);
  });

  it("rejects non-connectors, unknown ids and locked connectors", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    expect((await s.run("update_connector_label", { id: "a", text: "x" })).error?.code).toBe("invalid_state");
    expect((await s.run("update_connector_label", { id: "ghost", text: "x" })).error?.code).toBe("not_found");
    await s.ok("lock_elements", { ids: ["ab"] });
    expect((await s.run("update_connector_label", { id: "ab", text: "x" })).error?.code).toBe("locked");
  });
});

describe("reroute_connector", () => {
  it("repairs a path that no longer reaches its anchors after the element moved outside the router", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    // a collaborator (or an old build) moved b without re-routing the connector
    s.mem.external(s.mem.stored.map((e) => (e.id === "b" ? ({ ...e, points: [{ x: 400, y: 200 }, { x: 568, y: 278 }] } as DrawingElement) : e)));
    const result = await s.ok("reroute_connector", { ids: ["ab"] });
    expect(result.affected.updated).toEqual(["ab"]);
    const end = find<Arrow>(s.mem.stored, "ab").points.at(-1)!;
    expect(end.y).toBeGreaterThanOrEqual(200);
    expect(end.x).toBe(400);
  });

  it("keeps manual bends unless asked to forget them, and says when nothing needed to change", async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const result = await s.ok("reroute_connector", {});
    expect(result.summary).toContain("already right");
    expect(result.affected.updated).toEqual([]);
    expect((await s.run("reroute_connector", { ids: ["a"] })).error?.code).toBe("invalid_state");
    expect((await s.run("reroute_connector", { ids: ["ghost"] })).error?.code).toBe("not_found");
  });
});

describe("disconnect_elements and delete_connector", () => {
  const linked = async () => {
    const s = setup({ elements: pair() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "x" });
    await s.ok("create_connector", { id: "ba", from: "b", to: "a" });
    await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
    return s;
  };

  it("removes the connectors between two elements (either direction) and their labels, never the elements", async () => {
    const s = await linked();
    const result = await s.ok("disconnect_elements", { a: "a", b: "b" });
    expect(result.data!.disconnected).toEqual(expect.arrayContaining(["ab", "ba"]));
    expect(result.affected.removed.sort()).toEqual(["ab", "ab-label", "ba"]);
    expect(idsOf(s.mem.stored).sort()).toEqual(["a", "b", "bc", "c"]);
  });

  it("can be limited to one direction, or detach instead of remove", async () => {
    const s = await linked();
    await s.ok("disconnect_elements", { a: "a", b: "b", directed: true });
    expect(idsOf(s.mem.stored)).toContain("ba");
    expect(idsOf(s.mem.stored)).not.toContain("ab");
    await s.ok("disconnect_elements", { a: "b", b: "c", result: "detach" });
    const bc = find<Arrow>(s.mem.stored, "bc");
    expect(bc.startConnection).toBeUndefined();
    expect(bc.endConnection).toBeUndefined();
    expect(bc.points.length).toBeGreaterThanOrEqual(2);
  });

  it("is a no-op for elements that are not connected, and fails for unknown or locked", async () => {
    const s = await linked();
    expect((await s.ok("disconnect_elements", { a: "a", b: "c" })).summary).toContain("not connected");
    expect((await s.run("disconnect_elements", { a: "a", b: "ghost" })).error?.code).toBe("not_found");
    await s.ok("lock_elements", { ids: ["ab", "ba"] });
    expect((await s.run("disconnect_elements", { a: "a", b: "b" })).error?.code).toBe("locked");
  });

  it("delete_connector removes connectors and labels only", async () => {
    const s = await linked();
    const result = await s.ok("delete_connector", { ids: ["ab"] });
    expect(result.affected.removed.sort()).toEqual(["ab", "ab-label"]);
    expect(idsOf(s.mem.stored).filter((id) => ["a", "b", "c"].includes(id))).toEqual(["a", "b", "c"]);
    expect((await s.run("delete_connector", { ids: ["a"] })).error?.code).toBe("invalid_state");
    expect((await s.run("delete_connector", { ids: ["ghost"] })).error?.code).toBe("not_found");
    await s.ok("lock_elements", { ids: ["bc"] });
    expect((await s.run("delete_connector", { ids: ["bc"] })).error?.code).toBe("locked");
  });
});
