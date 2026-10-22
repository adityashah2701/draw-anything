import { describe, expect, it } from "vitest";
import { MAX_REVIEWS } from "../review";
import { boxOf, find, node, rectangle, setup } from "../test-helpers";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface Slot { index: number; x: number; y: number; width: number; height: number }
interface Plan { sizes: Record<string, { width: number; height: number }>; slots: Slot[]; lanes: number; ranks: number; bounds: { width: number; height: number }; view: { fitsAt100: boolean; fitZoom: number; readable: boolean; smallestTextPx: number }; gaps: { rank: number; lane: number } }
interface Review { verdict: "good" | "needs_work"; findings: Array<{ code: string; ids: string[]; severity: string }>; attempt: number; next: string; view?: { allVisible: boolean; fitZoom: number } }

const codes = (review: Review) => review.findings.map((f) => f.code);

describe("plan_layout", () => {
  it("sizes each role to its text and gives every node a slot in one shared grid", async () => {
    const { ok } = setup();
    const plan = (await ok("plan_layout", {
      nodes: [
        { label: "Start", kind: "terminal" },
        { label: "Validate the incoming order payload", kind: "process" },
        { label: "Is the customer verified and in good standing?", kind: "decision" },
        { label: "Ship", kind: "process" },
      ],
      lanes: 1,
    })).data as unknown as Plan;
    expect(plan.slots).toHaveLength(4);
    // A longer label makes a bigger box, and one size is shared by every node of a role.
    expect(plan.sizes.process.width).toBeGreaterThanOrEqual(168);
    expect(plan.slots[1].width).toBe(plan.slots[3].width);
    expect(plan.sizes.decision.width).toBeGreaterThan(plan.sizes.terminal.width);
    // One column, even gaps: the centres share a line and ranks are one step apart.
    const centres = plan.slots.map((s) => s.x + s.width / 2);
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
    const tops = plan.slots.map((s) => s.y);
    const bottoms = plan.slots.map((s) => s.y + s.height);
    for (let i = 1; i < 4; i += 1) expect(Math.round(tops[i] - bottoms[i - 1])).toBeGreaterThanOrEqual(plan.gaps.rank - 1);
  });

  it("draws exactly where it planned and review finds nothing to fix", async () => {
    const { ok } = setup();
    const plan = (await ok("plan_layout", { nodes: [{ label: "Request" }, { label: "Check the cache for a stored answer" }, { label: "Respond" }] })).data as unknown as Plan;
    const labels = ["Request", "Check the cache for a stored answer", "Respond"];
    for (const [i, slot] of plan.slots.entries()) {
      await ok("create_semantic_node", { id: `n${i}`, label: labels[i], x: slot.x + 3, y: slot.y + 5, width: slot.width, height: slot.height, snap: false });
    }
    const state = await ok("get_document_state");
    const drawn = (state.data!.elements as Array<{ id: string; x: number; y: number; w: number; h: number }>);
    plan.slots.forEach((slot, i) => expect(drawn.find((e) => e.id === `n${i}`)).toMatchObject({ x: slot.x + 3, y: slot.y + 5, w: slot.width, h: slot.height }));
    await ok("create_connector", { from: "n0", to: "n1" });
    await ok("create_connector", { from: "n1", to: "n2" });
    const review = (await ok("review_layout")).data as unknown as Review;
    expect(codes(review).filter((c) => c === "label_clipped" || c === "overlap")).toEqual([]);
  });

  it("folds a long chain into lanes instead of letting it shrink to nothing, and says when it cannot", async () => {
    const { ok } = setup({ viewport: { zoom: 1, pan: { x: 0, y: 0 }, width: 1000, height: 700 } });
    const many = Array.from({ length: 24 }, (_, i) => ({ label: `Step ${i + 1} of the long pipeline` }));
    const plan = (await ok("plan_layout", { nodes: many })).data as unknown as Plan;
    expect(plan.lanes).toBeGreaterThan(1);
    expect(plan.view.fitZoom).toBeGreaterThan(0.4);
    const forced = (await ok("plan_layout", { nodes: many, lanes: 1 })).data as unknown as Plan;
    expect(forced.view.fitZoom).toBeLessThan(plan.view.fitZoom);
    expect(forced.view.readable).toBe(false);
  });

  it("measures against the visible canvas, not the whole window: a covered side panel shrinks it", async () => {
    const nodes = Array.from({ length: 3 }, (_, i) => ({ label: `Service ${i}` }));
    const wide = (await setup({ viewport: { zoom: 1, pan: { x: 0, y: 0 }, width: 1000, height: 900 } }).ok("plan_layout", { nodes, direction: "right", lanes: 1 })).data as unknown as Plan;
    const covered = (await setup({ viewport: { zoom: 1, pan: { x: 0, y: 0 }, width: 1000, height: 900, coveredRight: 600 } }).ok("plan_layout", { nodes, direction: "right", lanes: 1 })).data as unknown as Plan;
    expect(wide.view.fitsAt100).toBe(true);
    expect(covered.view.fitsAt100).toBe(false);
    expect(covered.view.fitZoom).toBeLessThan(wide.view.fitZoom);
  });
});

describe("review_layout", () => {
  it("reports labels that cannot fit, overlaps, uneven sizes and unlabelled structure with ids", async () => {
    const tight = node("tight", "A very long label that cannot possibly fit in this small box", 0, 0, {}, { w: 90, h: 40 });
    const { ok } = setup({ elements: [tight, rectangle("a", 400, 0, 100, 100), rectangle("b", 450, 20, 100, 100)] });
    const review = (await ok("review_layout")).data as unknown as Review;
    expect(review.verdict).toBe("needs_work");
    expect(review.findings.find((f) => f.code === "label_clipped")?.ids).toContain("tight");
    expect(review.findings.find((f) => f.code === "overlap")?.ids).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("finds connectors that cross, but not ones that meet at a node", async () => {
    const { ok } = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 0, 400), node("c", "C", -300, 200), node("d", "D", 400, 200)] });
    await ok("create_connector", { id: "x1", from: "a", to: "b" });
    await ok("create_connector", { id: "x2", from: "c", to: "d" });
    const crossing = (await ok("review_layout")).data as unknown as Review;
    expect(crossing.findings.find((f) => f.code === "connector_crossing")?.ids).toEqual(expect.arrayContaining(["x1", "x2"]));

    const star = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 400, 0), node("c", "C", 400, 200)] });
    await star.ok("create_connector", { from: "a", to: "b" });
    await star.ok("create_connector", { from: "a", to: "c" });
    expect(codes((await star.ok("review_layout")).data as unknown as Review)).not.toContain("connector_crossing");
  });

  it("uses the real view: content outside it is flagged, and text that would be unreadable when fitted is a warning", async () => {
    const far = setup({ elements: [node("a", "A", 5000, 5000)] });
    const off = (await far.ok("review_layout")).data as unknown as Review;
    expect(off.view?.allVisible).toBe(false);
    expect(codes(off)).toContain("off_screen");

    const spread = Array.from({ length: 6 }, (_, i) => node(`n${i}`, `Node ${i}`, i * 1500, (i % 2) * 1500));
    const tiny = (await setup({ elements: spread }).ok("review_layout")).data as unknown as Review;
    expect(codes(tiny)).toContain("too_small_to_read");
    expect(tiny.verdict).toBe("needs_work");
  });

  it("is a bounded loop: it counts reviews and tells the agent to stop, whatever is left", async () => {
    const { ok } = setup({ elements: [rectangle("a", 0, 0), rectangle("b", 40, 10)] });
    const attempts: Review[] = [];
    for (let i = 0; i < MAX_REVIEWS; i += 1) {
      attempts.push((await ok("review_layout")).data as unknown as Review);
      await ok("move_elements", { ids: ["b"], dx: 5, dy: 0 }); // a repeat on an unchanged board is answered from the earlier review, not counted
    }
    expect(attempts.map((r) => r.attempt)).toEqual([1, 2, 3]);
    expect(attempts[0].next).toMatch(/review_layout again/);
    expect(attempts[MAX_REVIEWS - 1].next).toMatch(/Do not refine further/);
  });

  it("changes nothing and is good for a clean board", async () => {
    const { ok, mem } = setup({ elements: [node("a", "API", 0, 0), node("b", "DB", 248, 0)] });
    await ok("create_connector", { from: "a", to: "b" });
    const before = JSON.stringify(mem.stored);
    const review = (await ok("review_layout")).data as unknown as Review;
    expect(review.verdict).toBe("good");
    expect(JSON.stringify(mem.stored)).toBe(before);
  });
});

describe("agent geometry", () => {
  it("keeps exact coordinates with snap: false, and snaps by default only within a few units of a neighbour", async () => {
    const { ok, mem } = setup({ elements: [node("anchor", "Anchor", 0, 0)] });
    await ok("create_semantic_node", { id: "exact", label: "Exact", x: 7, y: 205, width: 168, height: 78, snap: false });
    expect(boxOf(find<DrawingElement>(mem.stored, "exact"))).toMatchObject({ x: 7, y: 205 });
    await ok("create_shape", { id: "box", shape: "rectangle", x: 5, y: 400, width: 100, height: 60, snap: false });
    expect(boxOf(find<DrawingElement>(mem.stored, "box"))).toMatchObject({ x: 5, y: 400 });
    const snapping = setup({ elements: [node("anchor", "Anchor", 0, 0)] });
    await snapping.ok("create_semantic_node", { id: "snapped", label: "Snapped", x: 6, y: 600, width: 168, height: 78 });
    expect(boxOf(find<DrawingElement>(snapping.mem.stored, "snapped")).x).toBe(0);
  });
});

describe("bringing new content into view", () => {
  const code = "A -> B -> C";
  const view = { zoom: 1, pan: { x: 0, y: 0 }, width: 1200, height: 800 };

  it("moves the view when imported content lands outside it, and says so", async () => {
    const { ok, mem } = setup({ viewport: view });
    const result = await ok("import_diagram", { code, x: 6000, y: 6000 });
    expect(mem.calls.fits).toHaveLength(1);
    expect(mem.calls.fits[0]!.minX).toBeGreaterThan(5000);
    expect(result.summary).toMatch(/view was moved/);
    expect(result.data).toMatchObject({ viewMoved: true });
  });

  it("leaves the view alone when the content is visible or the caller asks to keep it", async () => {
    const visible = setup({ viewport: view });
    await visible.ok("import_diagram", { code, x: 100, y: 100 });
    expect(visible.mem.calls.fits).toHaveLength(0);
    const keep = setup({ viewport: view });
    await keep.ok("import_diagram", { code, x: 6000, y: 6000, keep_view: true });
    expect(keep.mem.calls.fits).toHaveLength(0);
  });

  it("accounts for the part of the canvas a side panel covers", async () => {
    const { ok, mem } = setup({ viewport: { ...view, coveredRight: 700 } });
    await ok("import_diagram", { code, x: 650, y: 100 });
    expect(mem.calls.fits).toHaveLength(1);
  });
});
