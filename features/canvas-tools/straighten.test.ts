import { describe, expect, it } from "vitest";
import { call, reply, scriptedRun } from "./agent/test-support";
import { boxOf, find, node, setup } from "./test-helpers";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

/** The flowchart from the bug report: a column whose nodes differ in width, sit left-aligned, and have uneven gaps. */
const column = () => [
  node("start", "Lamp doesn't work", 0, 0, {}, { w: 260, h: 80 }),
  node("plugged", "Lamp plugged in?", -20, 200, { ai: { semanticKind: "decision" } }, { w: 300, h: 90 }),
  node("burned", "Bulb burned out?", -22, 310, { ai: { semanticKind: "decision" } }, { w: 296, h: 90 }),
  node("repair", "Repair lamp", 0, 520, {}, { w: 240, h: 80 }),
];
const chain = [["a", "start", "plugged"], ["b", "plugged", "burned"], ["c", "burned", "repair"]];

const centreX = (shape: DrawingElement) => boxOf(shape).x + boxOf(shape).w / 2;
const gaps = (shapes: DrawingElement[]) => shapes.slice(1).map((s, i) => boxOf(s).y - (boxOf(shapes[i]).y + boxOf(shapes[i]).h));
const straight = (arrow: DrawingElement) => arrow.points.every((p) => Math.abs(p.x - arrow.points[0].x) < 0.6);

const drawn = async () => {
  const s = setup({ elements: column() });
  for (const [id, from, to] of chain) await s.ok("create_connector", { id, from, to });
  return s;
};

describe("straight connectors and even gaps", () => {
  it("the validator reports the kinks and the uneven gaps, naming tidy_diagram", async () => {
    const s = await drawn();
    const issues = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string; message: string }> }).issues;
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["misaligned_connection", "uneven_spacing"]));
    expect(issues.find((i) => i.code === "misaligned_connection")?.message).toMatch(/tidy_diagram/);
  });

  it("tidy_diagram puts connected nodes on one centre line, one even gap apart, with straight connectors", async () => {
    const s = await drawn();
    await s.ok("tidy_diagram", {});
    const nodes = ["start", "plugged", "burned", "repair"].map((id) => find<DrawingElement>(s.mem.stored, id));
    for (const n of nodes) expect(centreX(n)).toBeCloseTo(centreX(nodes[0]), 0);
    const g = gaps(nodes);
    for (const value of g) expect(value).toBeCloseTo(g[0], 0);
    expect(g[0]).toBeGreaterThanOrEqual(40);
    expect(g[0]).toBeLessThanOrEqual(110);
    for (const [id] of chain) expect(straight(find<DrawingElement>(s.mem.stored, id))).toBe(true);
    const after = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string }> }).issues;
    expect(after.filter((i) => i.code === "misaligned_connection" || i.code === "uneven_spacing")).toEqual([]);
  });

  it("an exact gap can be asked for", async () => {
    const s = await drawn();
    await s.ok("tidy_diagram", { gap: 72 });
    const nodes = ["start", "plugged", "burned", "repair"].map((id) => find<DrawingElement>(s.mem.stored, id));
    for (const value of gaps(nodes)) expect(value).toBeCloseTo(72, 0);
  });

  it("a node too far from its neighbour to be a slip is left where it is sideways", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 400, 200)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("tidy_diagram", {});
    expect(boxOf(find<DrawingElement>(s.mem.stored, "b")).x).toBe(400);
  });

  it("a connector label keeps its room: a labelled gap is never made smaller than it is", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 0, 300), node("c", "C", 0, 440)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b", label: "Yes" });
    await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
    await s.ok("tidy_diagram", {});
    const [a, b] = ["a", "b"].map((id) => boxOf(find<DrawingElement>(s.mem.stored, id)));
    expect(b.y - (a.y + a.h)).toBeGreaterThanOrEqual(300 - 78);
  });

  it("a locked node stays and the others line up with it", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 30, 200, { locked: true }), node("c", "C", 5, 400)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
    await s.ok("tidy_diagram", {});
    const [a, b, c] = ["a", "b", "c"].map((id) => find<DrawingElement>(s.mem.stored, id));
    expect(boxOf(b).x).toBe(30);
    expect(centreX(a)).toBeCloseTo(centreX(b), 0);
    expect(centreX(c)).toBeCloseTo(centreX(b), 0);
  });

  it("an even, straight board is left alone", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 0, 160), node("c", "C", 0, 320)] });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    await s.ok("create_connector", { id: "bc", from: "b", to: "c" });
    const before = JSON.stringify(s.mem.stored);
    const issues = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string }> }).issues;
    expect(issues.filter((i) => i.code === "misaligned_connection" || i.code === "uneven_spacing")).toEqual([]);
    await s.run("tidy_diagram", {});
    expect(JSON.stringify(s.mem.stored)).toBe(before);
  });
});

describe("the agent's own placement", () => {
  it("a node asked for a few units off a neighbour's edge or centre lands exactly on it", async () => {
    const s = setup({ elements: [node("a", "Orders", 100, 100)] });
    await s.ok("create_semantic_node", { id: "b", label: "Orders DB", x: 104, y: 300 });
    expect(boxOf(find<DrawingElement>(s.mem.stored, "b")).x).toBe(100);
  });

  it("never snaps a node onto another one", async () => {
    const s = setup({ elements: [node("a", "Orders", 100, 100)] });
    await s.ok("create_semantic_node", { id: "b", label: "Orders DB", x: 104, y: 110 });
    const b = boxOf(find<DrawingElement>(s.mem.stored, "b"));
    expect(b.x).toBe(104);
    expect(b.y).toBe(110);
  });

  it("a run that places nodes by hand gets them straightened once before the final check, and only those nodes move", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Add a Cache and a Database under the Gateway",
      board: { elements: [node("gw", "Gateway", 300, 0), node("keep", "Untouched", 900, 7), node("keep2", "Also untouched", 912, 190)] },
      script: [
        reply("", [call("create_semantic_node", { id: "cache", label: "Cache", x: 322, y: 150, width: 120, height: 70 })]),
        reply("", [call("create_semantic_node", { id: "db", label: "Database", x: 280, y: 420, width: 200, height: 70 })]),
        reply("", [call("create_connector", { id: "c1", from: "gw", to: "cache" }), call("create_connector", { id: "c2", from: "cache", to: "db" })]),
        reply("Added both."),
      ],
    });
    expect(run.status).toBe("done");
    const [gw, cache, db] = ["gw", "cache", "db"].map((id) => find<DrawingElement>(mem.stored, id));
    expect(centreX(cache)).toBeCloseTo(centreX(db), 0);
    for (const id of ["c1", "c2"]) expect(straight(find<DrawingElement>(mem.stored, id))).toBe(true);
    expect(boxOf(find<DrawingElement>(mem.stored, "keep")).y).toBe(7);
    expect(boxOf(find<DrawingElement>(mem.stored, "keep2")).x).toBe(912);
    expect(gw).toBeDefined();
  });
});

describe("change_shape keeps the centre", () => {
  it("a diamond has the same centre and size as the box it replaced", async () => {
    const s = setup({ elements: [node("d", "Decision?", 40, 60, { ai: { semanticKind: "decision" } }, { w: 220, h: 90 })] });
    const before = boxOf(find<DrawingElement>(s.mem.stored, "d"));
    await s.ok("change_shape", { ids: ["d"], shape: "diamond" });
    const after = boxOf(find<DrawingElement>(s.mem.stored, "d"));
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 5);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 5);
  });
});
