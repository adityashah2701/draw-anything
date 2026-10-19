import { describe, expect, it } from "vitest";
import { boxOf, find, node, setup } from "./test-helpers";

const board = () => [node("users", "Users", 300, 0), node("cdn", "CDN", 300, 150), node("gw", "Gateway", 300, 300), node("auth", "Auth", 100, 450), node("orders", "Orders", 500, 450), node("db", "Orders DB", 500, 600)];

const drawn = async () => {
  const s = setup({ elements: board() });
  for (const [id, from, to] of [["u", "users", "cdn"], ["c", "cdn", "gw"], ["g1", "gw", "auth"], ["g2", "gw", "orders"], ["od", "orders", "db"]]) await s.ok("create_connector", { id, from, to });
  await s.ok("create_group", { ids: ["auth", "orders"], name: "Services", id: "svc" });
  await s.ok("create_frame_or_section", { title: "Services", ids: ["auth", "orders"], id: "fr" });
  return s;
};

describe("editing an existing diagram", () => {
  it("warns when a new node lands on existing ones", async () => {
    const s = await drawn();
    const result = await s.ok("create_semantic_node", { id: "cache", label: "Redis Cache", kind: "cache", x: 500, y: 525 });
    expect(result.warnings?.join(" ")).toMatch(/overlaps .*Orders.*Orders DB/);
    const clear = await s.ok("create_semantic_node", { id: "far", label: "Far away", x: 1200, y: 0 });
    expect(clear.warnings ?? []).toEqual([]);
  });

  it("inserts a node between two connected ones after making room, with every connector attached and nothing overlapping", async () => {
    const s = await drawn();
    await s.ok("move_elements", { ids: ["db"], dx: 0, dy: 150 });
    const made = await s.ok("create_semantic_node", { id: "cache", label: "Redis Cache", kind: "cache", x: 500, y: 600 });
    expect(made.warnings ?? []).toEqual([]);
    await s.ok("delete_connector", { ids: ["od"] });
    await s.ok("create_connector", { id: "oc", from: "orders", to: "cache" });
    await s.ok("create_connector", { id: "cd", from: "cache", to: "db" });
    const check = await s.ok("validate_diagram", {});
    expect((check.data as { issues: unknown[] }).issues).toEqual([]);
    for (const id of ["oc", "cd"]) {
      const arrow = find<{ startConnection?: { elementId: string }; endConnection?: { elementId: string } } & ReturnType<typeof find>>(s.mem.stored, id);
      expect(arrow.startConnection?.elementId && arrow.endConnection?.elementId).toBeTruthy();
    }
  });

  it("fit_frame brings a frame back around members that moved or were added", async () => {
    const s = await drawn();
    const before = find(s.mem.stored, "fr").points;
    await s.ok("move_elements", { ids: ["orders"], dx: 0, dy: 300 });
    expect(find(s.mem.stored, "fr").points).toEqual(before);
    await s.ok("fit_frame", { frame: "fr", ids: ["auth", "orders"] });
    const frame = boxOf(find(s.mem.stored, "fr") as never);
    for (const id of ["auth", "orders"]) {
      const b = boxOf(find(s.mem.stored, id) as never);
      expect(b.x).toBeGreaterThanOrEqual(frame.x);
      expect(b.y + b.h).toBeLessThanOrEqual(frame.y + frame.h);
    }
    expect(find(s.mem.stored, "fr-label").points[0].y).toBeCloseTo(frame.y + 8);
  });

  it("refuses to fit something that is not a frame", async () => {
    const s = await drawn();
    const result = await s.run("fit_frame", { frame: "auth", ids: ["orders"] });
    expect(result.ok).toBe(false);
  });
});

describe("frame headings", () => {
  const headingBox = (s: Awaited<ReturnType<typeof drawn>>) => {
    const label = find<any>(s.mem.stored, "fr-label");
    return { x: label.points[0].x, y: label.points[0].y, size: label.fontSize ?? 0 };
  };

  it("sizes the heading like a node caption, not a poster title", async () => {
    const s = await drawn();
    expect(headingBox(s).size).toBeLessThanOrEqual(18);
  });

  it("moves the heading out of the way of a connector that crosses the top-left of the frame", async () => {
    const s = setup({ elements: [node("gw", "Gateway", 100, -200), node("auth", "Auth", 100, 100), node("orders", "Orders", 500, 100)] });
    await s.ok("create_connector", { id: "g1", from: "gw", to: "auth" });
    await s.ok("create_frame_or_section", { title: "Backend services", ids: ["auth", "orders"], id: "fr" });
    const label = find<any>(s.mem.stored, "fr-label");
    const frame = find<any>(s.mem.stored, "fr");
    expect(label.points[0].x).toBeGreaterThan(Math.min(...frame.points.map((p: { x: number }) => p.x)) + 16);
    const check = await s.ok("validate_diagram", {});
    expect(JSON.stringify((check.data as { issues: unknown[] }).issues)).not.toContain("connector_through_heading");
  });

  it("warns when the members sit far apart, and the validator names a connector through a heading", async () => {
    const s = setup({ elements: [node("gw", "Gateway", 100, -200), node("auth", "Auth", 100, 100), node("orders", "Orders", 1500, 100)] });
    const made = await s.ok("create_frame_or_section", { title: "Services", ids: ["auth", "orders"], id: "fr" });
    expect(made.warnings?.join(" ")).toMatch(/much larger/);
    await s.ok("create_connector", { id: "g1", from: "gw", to: "auth" });
    const label = find<any>(s.mem.stored, "fr-label");
    label.points[0] = { x: 100 + 70, y: label.points[0].y };
    const check = await s.ok("validate_diagram", {});
    expect(JSON.stringify((check.data as { issues: unknown[] }).issues)).toContain("connector_through_heading");
  });
});

describe("connectors after edits", () => {
  const stale = async () => {
    const s = await drawn();
    // a connector whose end drifted off its shape, as after a move that did not re-route it
    const od = find(s.mem.stored, "od") as unknown as { points: Array<{ x: number; y: number }> };
    const broken = { ...od, points: [od.points[0], { x: od.points[0].x, y: od.points[0].y + 400 }] };
    s.mem.stored.splice(s.mem.stored.findIndex((e) => e.id === "od"), 1, broken as never);
    return s;
  };

  it("validate_diagram reports a connector that no longer reaches its shape", async () => {
    const s = await stale();
    const check = await s.ok("validate_diagram", {});
    expect((check.data as { issues: Array<{ code: string; ids: string[] }> }).issues).toContainEqual(expect.objectContaining({ code: "stale_connector", ids: ["od"] }));
  });

  it("a move or a layout brings floating connector ends back instead of reporting success over them", async () => {
    const s = await stale();
    await s.ok("move_elements", { ids: ["users"], dx: 0, dy: -40 });
    const check = await s.ok("validate_diagram", {});
    expect((check.data as { issues: Array<{ code: string }> }).issues.map((i) => i.code)).not.toContain("stale_connector");
  });

  it("validate_and_repair_diagram can repair a stale connector", async () => {
    const s = await stale();
    await s.ok("validate_and_repair_diagram", { codes: ["stale_connector"] });
    const check = await s.ok("validate_diagram", {});
    expect((check.data as { issues: Array<{ code: string }> }).issues.map((i) => i.code)).not.toContain("stale_connector");
  });
});
