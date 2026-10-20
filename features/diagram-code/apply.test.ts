import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { canvasDrift, loadFromCanvas, planApply, type ApplyPlan, type SyncState } from "./apply";
import { elementsFromDiagramCode } from "./canvas";

/** A tiny stand-in for the board: apply a patch the way the editor does. */
const applyPatch = (canvas: DrawingElement[], plan: ApplyPlan): DrawingElement[] => {
  const gone = new Set(plan.patch.remove);
  const updates = new Map(plan.patch.update.map((el) => [el.id, el]));
  return [...canvas.filter((el) => !gone.has(el.id)).map((el) => updates.get(el.id) ?? el), ...plan.patch.add];
};

const ready = (outcome: ReturnType<typeof planApply>) => {
  expect(outcome.status).toBe("ready");
  return (outcome as Extract<typeof outcome, { status: "ready" }>).plan;
};

/** Draw `code` onto an empty board and return the board plus the sync state. */
const draw = (code: string) => {
  const plan = ready(planApply({ code, canvas: [], generationId: "g1" }));
  return { canvas: applyPatch([], plan), sync: plan.sync };
};

const SHOP = `Web [kind: browser]
API [kind: api]
Orders [kind: service]
DB [kind: database]
Web > API: HTTPS
API > Orders
Orders > DB: SQL
`;

const nodeEl = (canvas: DrawingElement[], semanticId: string) => canvas.find((el) => el.ai?.role === "node" && el.ai.semanticId === semanticId)!;

describe("planApply: a new diagram", () => {
  it("adds every element and records what each declaration owns", () => {
    const { canvas, sync } = draw(SHOP);
    expect(canvas.filter((el) => el.ai?.role === "node")).toHaveLength(4);
    expect(canvas.filter((el) => el.ai?.role === "edge")).toHaveLength(3);
    expect(Object.values(sync.owned).sort()).toEqual(
      expect.arrayContaining(["node:web", "node:api", "edge:web>api#1", "edge:web>api#1~label", "edge:orders>db#1~label"]),
    );
    expect(Object.keys(sync.owned)).toHaveLength(canvas.length);
  });
});

describe("planApply: updating", () => {
  it("is a no-op when the code did not change", () => {
    const { canvas, sync } = draw(SHOP);
    const plan = ready(planApply({ code: SHOP, canvas, sync, generationId: "g2" }));
    expect(plan.patch).toEqual({ add: [], update: [], remove: [] });
    expect(plan.summary).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });

  it("keeps element ids, and touches only what changed, when a node and a connection are added", () => {
    const { canvas, sync } = draw(SHOP);
    const ids = new Map(canvas.map((el) => [el.ai?.semanticId, el.id]));
    const code = `${SHOP}Cache [kind: cache]\nOrders > Cache\n`;
    const plan = ready(planApply({ code, canvas, sync, generationId: "g2" }));
    expect(plan.patch.remove).toEqual([]);
    expect(plan.patch.add.map((el) => el.ai?.semanticId)).toEqual(expect.arrayContaining(["cache"]));
    const next = applyPatch(canvas, plan);
    // Every earlier node is still the same element.
    for (const semantic of ["web", "api", "orders", "db"]) expect(nodeEl(next, semantic).id).toBe(ids.get(semantic));
    // And the new elements are really on the board and connected to those same ids.
    const arrow = next.find((el) => el.ai?.role === "edge" && (el as { endConnection?: { elementId: string } }).endConnection?.elementId === nodeEl(next, "cache").id)!;
    expect((arrow as { startConnection?: { elementId: string } }).startConnection?.elementId).toBe(ids.get("orders"));
  });

  it("changing one label updates that node (and nothing else is rewritten as a replacement)", () => {
    const { canvas, sync } = draw(SHOP);
    const before = nodeEl(canvas, "api").id;
    const plan = ready(planApply({ code: SHOP.replace("API [kind: api]", 'API [kind: api, label: "Public API"]'), canvas, sync, generationId: "g2" }));
    expect(plan.patch.add).toEqual([]);
    expect(plan.patch.remove).toEqual([]);
    const updated = plan.patch.update.find((el) => el.id === before)!;
    expect(updated.label).toBe("Public API");
    const next = applyPatch(canvas, plan);
    expect(nodeEl(next, "api").label).toBe("Public API");
  });

  it("removes the elements of a deleted declaration and the connectors that touched it", () => {
    const { canvas, sync } = draw(SHOP);
    const code = "Web [kind: browser]\nAPI [kind: api]\nWeb > API: HTTPS\n";
    const plan = ready(planApply({ code, canvas, sync, generationId: "g2" }));
    const next = applyPatch(canvas, plan);
    expect(next.filter((el) => el.ai?.role === "node").map((el) => el.ai!.semanticId).sort()).toEqual(["api", "web"]);
    expect(next.filter((el) => el.ai?.role === "edge")).toHaveLength(1);
    expect(plan.patch.remove.length).toBeGreaterThan(0);
  });

  it("keeps the diagram where it is on the canvas", () => {
    const { canvas, sync } = draw(SHOP);
    const moved = canvas.map((el) => ({ ...el, points: el.points.map((p) => ({ x: p.x + 1000, y: p.y + 500 })) })) as DrawingElement[];
    const plan = ready(planApply({ code: `${SHOP}Cache [kind: cache]\nOrders > Cache\n`, canvas: moved, sync, generationId: "g2" }));
    const next = applyPatch(moved, plan);
    const minX = (els: DrawingElement[]) => Math.min(...els.flatMap((el) => el.points.map((p) => p.x)));
    expect(Math.abs(minX(next) - minX(moved))).toBeLessThan(1);
  });

  it("keeps a node the person dragged where it was dropped", () => {
    const { canvas, sync } = draw(SHOP);
    const dragged = canvas.map((el) => (el.ai?.role === "node" && el.ai.semanticId === "db" ? { ...el, points: el.points.map((p) => ({ x: p.x + 400, y: p.y + 40 })) } : el)) as DrawingElement[];
    const target = nodeEl(dragged, "db");
    const plan = ready(planApply({ code: `${SHOP}Cache [kind: cache]\nOrders > Cache\n`, canvas: dragged, sync, generationId: "g2" }));
    const next = applyPatch(dragged, plan);
    expect(nodeEl(next, "db").id).toBe(target.id);
    expect(nodeEl(next, "db").points[0].x).toBeCloseTo(target.points[0].x, 0);
    expect(nodeEl(next, "db").points[0].y).toBeCloseTo(target.points[0].y, 0);
  });

  it("restores an element that was deleted from the canvas but is still in the code, and says so", () => {
    const { canvas, sync } = draw(SHOP);
    const without = canvas.filter((el) => el.ai?.semanticId !== "orders");
    const plan = ready(planApply({ code: SHOP, canvas: without, sync, generationId: "g2" }));
    expect(plan.summary.restored).toBeGreaterThan(0);
    expect(applyPatch(without, plan).some((el) => el.ai?.semanticId === "orders")).toBe(true);
  });
});

describe("planApply: invalid code never touches the canvas", () => {
  it("reports errors and plans nothing", () => {
    const { canvas, sync } = draw(SHOP);
    for (const code of ["Web [kind: browser", "A > ", "Team {\n A\n", "", "// nothing\n"]) {
      const outcome = planApply({ code, canvas, sync, generationId: "g2" });
      expect(outcome.status, JSON.stringify(code)).toBe("invalid");
      if (outcome.status === "invalid") expect(outcome.diagnostics.every((d) => d.severity === "error")).toBe(true);
    }
  });

  it("a half-typed edit followed by the finished edit applies cleanly (last valid state in between)", () => {
    const { canvas, sync } = draw(SHOP);
    expect(planApply({ code: `${SHOP}Cache [kind: ca]`, canvas, sync, generationId: "g2" }).status).toBe("ready"); // an unknown kind is only a warning
    expect(planApply({ code: `${SHOP}Cache [kind: cache`, canvas, sync, generationId: "g2" }).status).toBe("invalid");
    const plan = ready(planApply({ code: `${SHOP}Cache [kind: cache]\n`, canvas, sync, generationId: "g2" }));
    expect(plan.patch.add.map((el) => el.ai?.semanticId)).toContain("cache");
  });
});

describe("planApply: three-way conflicts", () => {
  const edited = (canvas: DrawingElement[], semanticId: string, patch: Record<string, unknown>) =>
    canvas.map((el) => (el.ai?.role === "node" && el.ai.semanticId === semanticId ? ({ ...el, ...patch } as DrawingElement) : el));

  it("keeps a change made only on the canvas when the code leaves that field alone", () => {
    const { canvas, sync } = draw(SHOP);
    const tweaked = edited(canvas, "api", { fill: "#ffeeaa" });
    const plan = ready(planApply({ code: `${SHOP}Cache [kind: cache]\n`, canvas: tweaked, sync, generationId: "g2" }));
    expect(applyPatch(tweaked, plan).find((el) => el.ai?.semanticId === "api")!.fill).toBe("#ffeeaa");
  });

  it("takes a change made only in the code over an untouched canvas", () => {
    const { canvas, sync } = draw(SHOP);
    const plan = ready(planApply({ code: SHOP.replace("API [kind: api]", "API [kind: api, color: red]"), canvas, sync, generationId: "g2" }));
    expect(applyPatch(canvas, plan).find((el) => el.ai?.semanticId === "api")!.color).toBe("#dc2626");
  });

  it("reports a field both sides changed, writes nothing, and applies the chosen side", () => {
    const { canvas, sync } = draw(SHOP);
    const tweaked = edited(canvas, "api", { label: "Gateway (edited on canvas)" });
    const code = SHOP.replace("API [kind: api]", 'API [kind: api, label: "Public API"]');
    const outcome = planApply({ code, canvas: tweaked, sync, generationId: "g2" });
    expect(outcome.status).toBe("conflict");
    if (outcome.status !== "conflict") return;
    expect(outcome.conflicts).toEqual([expect.objectContaining({ key: "node:api", field: "label", canvas: "Gateway (edited on canvas)", code: "Public API" })]);

    const useCode = ready(planApply({ code, canvas: tweaked, sync, generationId: "g2", resolve: "code" }));
    expect(applyPatch(tweaked, useCode).find((el) => el.ai?.semanticId === "api")!.label).toBe("Public API");
    const useCanvas = ready(planApply({ code, canvas: tweaked, sync, generationId: "g2", resolve: "canvas" }));
    expect(applyPatch(tweaked, useCanvas).find((el) => el.ai?.semanticId === "api")!.label).toBe("Gateway (edited on canvas)");
  });

  it("preserves fields the code never sets (user-added)", () => {
    const { canvas, sync } = draw(SHOP);
    const decorated = edited(canvas, "api", { opacity: 0.4, locked: true });
    const plan = ready(planApply({ code: SHOP.replace("API [kind: api]", "API [kind: api, color: red]"), canvas: decorated, sync, generationId: "g2" }));
    const api = applyPatch(decorated, plan).find((el) => el.ai?.semanticId === "api") as unknown as Record<string, unknown>;
    expect(api.opacity).toBe(0.4);
    expect(api.locked).toBe(true);
  });
});

describe("loadFromCanvas", () => {
  const board = () => elementsFromDiagramCode(SHOP, { generationId: "orig", frameId: "f" }).elements;

  it("reads the code off the board and claims every element it came from", () => {
    const elements = board();
    const loaded = loadFromCanvas(elements, { generationId: "g1" })!;
    expect(loaded.nodeCount).toBe(4);
    expect(Object.keys(loaded.sync.owned).sort()).toEqual(elements.map((el) => el.id).sort());
    expect(Object.values(loaded.sync.owned).some((k) => k.startsWith("orphan:"))).toBe(false);
  });

  it("applying the loaded code unchanged changes nothing", () => {
    const elements = board();
    const loaded = loadFromCanvas(elements, { generationId: "g1" })!;
    const plan = ready(planApply({ code: loaded.code, canvas: elements, sync: loaded.sync, generationId: "g2" }));
    expect(plan.patch.add).toEqual([]);
    expect(plan.patch.remove).toEqual([]);
    expect(plan.patch.update).toEqual([]);
  });

  it("a small edit to loaded code updates the same elements", () => {
    const elements = board();
    const loaded = loadFromCanvas(elements, { generationId: "g1" })!;
    const code = `${loaded.code}Cache [kind: cache]\nOrders > Cache\n`;
    const plan = ready(planApply({ code, canvas: elements, sync: loaded.sync, generationId: "g2" }));
    expect(plan.patch.remove).toEqual([]);
    expect(plan.patch.add.filter((el) => el.ai?.role === "node")).toHaveLength(1);
    const next = applyPatch(elements, plan);
    for (const el of elements.filter((e) => e.ai?.role === "node")) expect(next.some((n) => n.id === el.id)).toBe(true);
  });

  it("works for shapes drawn by hand, whose ids are not slugs", () => {
    const hand = [
      { id: "Rect_1", type: "rectangle", points: [{ x: 0, y: 0 }, { x: 120, y: 60 }], color: "#000", strokeWidth: 2, label: "Client" },
      { id: "Rect_2", type: "rectangle", points: [{ x: 300, y: 0 }, { x: 420, y: 60 }], color: "#000", strokeWidth: 2, label: "Server" },
      { id: "Arrow_1", type: "arrow", points: [{ x: 120, y: 30 }, { x: 300, y: 30 }], color: "#000", strokeWidth: 2, arrowHeadEnd: true,
        startConnection: { elementId: "Rect_1", anchorId: "Rect_1-anchor-right" }, endConnection: { elementId: "Rect_2", anchorId: "Rect_2-anchor-left" } },
    ] as unknown as DrawingElement[];
    const loaded = loadFromCanvas(hand, { generationId: "g1" })!;
    expect(loaded.sync.owned).toMatchObject({ Rect_1: "node:client", Rect_2: "node:server", Arrow_1: "edge:client>server#1" });
    const plan = ready(planApply({ code: loaded.code.replaceAll("Client", "Customer"), canvas: hand, sync: loaded.sync, generationId: "g2" }));
    const ids = new Set(applyPatch(hand, plan).map((el) => el.id));
    expect(ids.has("Rect_2")).toBe(true); // Server kept its element
    expect(ids.has("Rect_1")).toBe(false); // Client was renamed: a new element replaces it
  });

  it("returns null when there is nothing to convert", () => {
    expect(loadFromCanvas([], { generationId: "g" })).toBeNull();
  });
});

describe("canvasDrift", () => {
  it("is empty right after a sync and reports edits and deletions afterwards", () => {
    const { canvas, sync } = draw(SHOP);
    expect(canvasDrift(canvas, sync)).toEqual({ edited: [], missing: [] });
    const api = nodeEl(canvas, "api");
    const orders = nodeEl(canvas, "orders");
    const changed = canvas.filter((el) => el.id !== orders.id).map((el) => (el.id === api.id ? ({ ...el, label: "Renamed" } as DrawingElement) : el));
    const drift = canvasDrift(changed, sync);
    expect(drift.edited).toEqual([api.id]);
    expect(drift.missing).toEqual([orders.id]);
  });

  it("does not count moving a node as an edit", () => {
    const { canvas, sync } = draw(SHOP);
    const moved = canvas.map((el) => (el.ai?.semanticId === "api" ? ({ ...el, points: el.points.map((p) => ({ x: p.x + 50, y: p.y })) } as DrawingElement) : el));
    expect(canvasDrift(moved, sync).edited).toEqual([]);
  });
});

// Keep the type import used even if a case above changes.
export type { SyncState };
