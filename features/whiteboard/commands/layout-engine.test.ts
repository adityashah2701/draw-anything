import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyPatch } from "@/core/groups/patch";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { EXAMPLES } from "@/features/ai/diagram-agent/prompt/examples";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { createCommandContext } from "./context";
import { planEngineLayout } from "./layout-engine";

beforeAll(() => initializeShapeRegistry());

const ctxOf = (stored: StoredElement[]) => {
  let n = 0;
  return createCommandContext(stored, { newId: () => `new-${(n += 1)}` });
};
const readme = readFileSync(join(process.cwd(), "docs/diagram-code/README.md"), "utf8");
const examples = [...readme.matchAll(/```diagram-code\n([\s\S]*?)```/g)].map((m) => m[1]);
const draw = (code: string, stamp?: "auto" | "user") =>
  elementsFromDiagramCode(code, { generationId: "g1", frameId: "f" }).elements.map((el) => (stamp && el.ai?.role === "node" ? ({ ...el, placement: stamp } as DrawingElement) : el));

const box = (id: string, x: number, y: number, extra: Partial<DrawingElement> = {}): DrawingElement =>
  ({ id, type: "rectangle", color: "#000000", strokeWidth: 2, label: id, points: [{ x, y }, { x: x + 140, y: y + 70 }], ...extra }) as DrawingElement;
const link = (id: string, from: string, to: string): DrawingElement =>
  ({ id, type: "arrow", color: "#000000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], startConnection: { elementId: from }, endConnection: { elementId: to } }) as DrawingElement;
const pointsOf = (list: readonly StoredElement[], id: string) => JSON.stringify((list.find((e) => e.id === id) as DrawingElement).points);

describe("laying out a diagram that has not been touched", () => {
  it.each([...examples.map((code, i) => [`readme ${i + 1}`, code] as const), ...EXAMPLES.map((e, i) => [`prompt ${i + 1}`, e.code] as const)])("%s: its own layout moves nothing (idempotent)", (_name, code) => {
    const stored = draw(code, "auto");
    const nodes = stored.filter((e) => e.ai?.role === "node").length;
    if (nodes < 2) return;
    const plan = planEngineLayout(ctxOf(stored), { mode: "adjust", engine: "architecture" });
    expect(plan.preview.moves, plan.preview.moves.map((m) => m.id).join(",")).toEqual([]);
    expect(plan.preview.stats.maxDisplacement).toBe(0);
  });
});

describe("the three modes", () => {
  const board = (): StoredElement[] => [
    box("a", 0, 0, { placement: "auto" }),
    box("b", 600, 400, { placement: "auto" }),
    box("c", 100, 900, { placement: "user" }),
    box("d", 900, 50, { locked: true, placement: "auto" }),
    link("ab", "a", "b"), link("bc", "b", "c"), link("cd", "c", "d"),
  ];

  it("preserve moves nothing that exists, in any engine", () => {
    for (const engine of ["architecture", "freeform"]) {
      const plan = planEngineLayout(ctxOf(board()), { mode: "preserve", engine });
      expect(plan.preview.moves).toEqual([]);
      expect(plan.patch).toBeNull();
    }
  });

  it("adjust moves only auto elements; the user's and the locked one stay byte for byte", () => {
    const before = board();
    const plan = planEngineLayout(ctxOf(before), { mode: "adjust", engine: "architecture" });
    expect(plan.preview.moves.length).toBeGreaterThan(0);
    expect(plan.preview.moves.every((m) => m.source === "auto")).toBe(true);
    const after = applyPatch(before, plan.patch!);
    expect(pointsOf(after, "c")).toBe(pointsOf(before, "c"));
    expect(pointsOf(after, "d")).toBe(pointsOf(before, "d"));
    // What moved is stamped auto by the layout, and nothing else carries a new stamp.
    for (const move of plan.preview.moves) expect((after.find((e) => e.id === move.id) as DrawingElement).placement).toBe("auto");
    expect((after.find((e) => e.id === "c") as DrawingElement).placement).toBe("user");
    expect(plan.preview.stats.heldFixed).toBe(2);
  });

  it("overwrite asks first, then moves the user's elements too, and still never the locked one", () => {
    const before = board();
    const asked = planEngineLayout(ctxOf(before), { mode: "overwrite", engine: "architecture" });
    expect(asked.preview.needsConfirmation).toBe(true);
    expect(asked.preview.userPlacedMoved).toBe(1);
    expect(asked.patch).toBeNull();
    const plan = planEngineLayout(ctxOf(before), { mode: "overwrite", engine: "architecture", confirm: true });
    const after = applyPatch(before, plan.patch!);
    expect(pointsOf(after, "d")).toBe(pointsOf(before, "d"));
    expect(pointsOf(after, "c")).not.toBe(pointsOf(before, "c"));
    expect((after.find((e) => e.id === "c") as DrawingElement).placement).toBe("auto");
  });

  it("freeform keeps everything and places only a new node, next to what it connects to", () => {
    const before: StoredElement[] = [box("a", 0, 0), box("b", 400, 0), box("z", 0, 0), link("az", "a", "z")];
    const plan = planEngineLayout(ctxOf(before), { mode: "adjust", engine: "freeform", newIds: ["z"] });
    expect(plan.preview.moves.map((m) => m.id)).toEqual(["z"]);
    const after = applyPatch(before, plan.patch!);
    expect(pointsOf(after, "a")).toBe(pointsOf(before, "a"));
    expect(pointsOf(after, "b")).toBe(pointsOf(before, "b"));
    expect((after.find((e) => e.id === "z") as DrawingElement).placement).toBe("auto");
  });

  it("a board with no stamps (every legacy element reads as user) is moved by nothing automatic", () => {
    const legacy: StoredElement[] = [box("a", 0, 0), box("b", 600, 400), link("ab", "a", "b")];
    for (const mode of ["preserve", "adjust"] as const) {
      const plan = planEngineLayout(ctxOf(legacy), { mode, engine: "architecture" });
      expect(plan.preview.moves).toEqual([]);
      expect(plan.patch).toBeNull();
    }
    expect(planEngineLayout(ctxOf(legacy), { mode: "overwrite", engine: "architecture" }).preview.needsConfirmation).toBe(true);
  });
});

describe("the layout record", () => {
  it("is stored when asked, and found again as the board's engine", () => {
    const before: StoredElement[] = draw("A > B\nB > C", "auto");
    const plan = planEngineLayout(ctxOf(before), { mode: "adjust", engine: "architecture", remember: true });
    const record = plan.patch!.add.find((e) => e.type === "layout");
    expect(record).toMatchObject({ type: "layout", engine: "architecture", algorithm: "layered", incremental: "adjust", scope: { kind: "diagram", id: "g1" } });
    const after = applyPatch(before, plan.patch!);
    // With the record stored, no engine needs to be named: the diagram's own is used.
    const again = planEngineLayout(ctxOf(after), { mode: "adjust" });
    expect(again.preview.engine).toBe("architecture");
  });

  it("falls back to freeform for a board with no record, which moves nothing", () => {
    const plan = planEngineLayout(ctxOf(draw("A > B", "auto")), { mode: "adjust" });
    expect(plan.preview.engine).toBe("freeform");
    expect(plan.preview.moves).toEqual([]);
  });
});

describe("zero displacement, over random boards", () => {
  // A small deterministic generator: the same seeds every run.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  it("never moves a user or locked element in preserve and adjust, nor a locked one in overwrite, for either engine", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = rng(seed);
      const count = 3 + Math.floor(r() * 8);
      const nodes: StoredElement[] = Array.from({ length: count }, (_, i) => {
        const roll = r();
        return box(`n${i}`, Math.round(r() * 1500), Math.round(r() * 1000), roll < 0.4 ? { placement: "auto" } : roll < 0.75 ? { placement: "user" } : roll < 0.9 ? { locked: true, placement: "auto" } : {});
      });
      const edges: StoredElement[] = [];
      for (let i = 1; i < count; i += 1) edges.push(link(`e${i}`, `n${Math.floor(r() * i)}`, `n${i}`));
      const board = [...nodes, ...edges];
      for (const engine of ["architecture", "freeform", "mind-map", "er", "uml", "bpmn", "sequence"]) {
        for (const mode of ["preserve", "adjust", "overwrite"] as const) {
          const plan = planEngineLayout(ctxOf(board), { mode, engine, confirm: true });
          const after = plan.patch ? applyPatch(board, plan.patch) : board;
          for (const node of nodes as DrawingElement[]) {
            const locked = node.locked === true;
            const fixed = locked || (mode !== "overwrite" && node.placement !== "auto");
            const everything = mode === "preserve";
            if (locked || fixed || everything) expect(pointsOf(after, node.id), `seed ${seed} ${engine} ${mode} ${node.id} (${node.placement ?? "legacy"}${locked ? ", locked" : ""})`).toBe(pointsOf(board, node.id));
          }
        }
      }
    }
  });

  it("gives the same answer for the same board, twice (deterministic)", () => {
    const board = draw("A > B\nB > C\nA > C\nC > D", "auto");
    const run = () => JSON.stringify(planEngineLayout(ctxOf(board), { mode: "overwrite", engine: "architecture", confirm: true }).preview.moves);
    expect(run()).toBe(run());
  });
});
