import { afterEach, describe, expect, it, vi } from "vitest";
import { listOutlineVariants, outlineVariantIds } from "@/core/shapes/outline/variants";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { loadFromCanvas, planApply, type ApplyPlan } from "./apply";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { compileDiagramCode } from "./language/compile";
import { completeAt } from "./language/tooling/complete";
import { SHAPES, resolveShape, shapeNames } from "./language/vocab";
import { serializeDiagramCode } from "./serialize";

const IDS = outlineVariantIds();
const draft = (code: string) => elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
const node = (elements: DrawingElement[], id: string) => elements.find((el) => el.ai?.role === "node" && el.ai.semanticId === id)!;
const applyPlan = (canvas: DrawingElement[], plan: ApplyPlan): DrawingElement[] => {
  const gone = new Set(plan.patch.remove);
  const updates = new Map(plan.patch.update.map((el) => [el.id, el]));
  return [...canvas.filter((el) => !gone.has(el.id)).map((el) => updates.get(el.id) ?? el), ...plan.patch.add];
};
const ready = (outcome: ReturnType<typeof planApply>) => {
  expect(outcome.status).toBe("ready");
  return (outcome as Extract<typeof outcome, { status: "ready" }>).plan;
};

afterEach(() => vi.restoreAllMocks());

describe("outline shapes in the language", () => {
  it("accepts exactly the registry's variants, with no diagnostics", () => {
    for (const id of IDS) {
      expect(resolveShape(id)).toBe(id);
      expect(compileDiagramCode(`A [shape: ${id}]`).diagnostics, id).toEqual([]);
    }
    expect(shapeNames()).toEqual(expect.arrayContaining(IDS));
    expect(SHAPES.filter((s) => IDS.includes(s.name)).map((s) => s.summary).every(Boolean)).toBe(true);
  });

  it("completes them and documents them from the registry", () => {
    const result = completeAt("A [shape: ", 10, { nodeNames: ["A"], iconIds: [], inHeader: false });
    const labels = (result?.items ?? []).map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(IDS));
  });

  it("lists the real variants when a shape is unknown", () => {
    const [d] = compileDiagramCode("A [shape: teapot]").diagnostics;
    expect(d.code).toBe("shape/unsupported");
    expect(d.severity).toBe("warning");
    for (const id of IDS) expect(d.message).toContain(id);
  });

  it("suggests the likely variant for a typo", () => {
    expect(compileDiagramCode("A [shape: cylindr]").diagnostics[0].suggestion).toBe("cylinder");
    expect(compileDiagramCode("A [shape: hexagn]").diagnostics[0].suggestion).toBe("hexagon");
  });

  it.each(IDS)("%s: code -> canvas -> code keeps the shape", (id) => {
    const { elements } = draft(`type architecture\nStore [shape: ${id}, color: blue]\nWeb\nWeb > Store`);
    const el = node(elements, "store");
    expect(el).toMatchObject({ type: "outline", variant: id, label: "Store" });
    const { graph } = graphFromElements(elements);
    expect(graph.nodes.find((n) => n.label === "Store")?.shape).toBe(id);
    expect(serializeDiagramCode(graph)).toContain(`shape: ${id}`);
    // and back again: the regenerated code draws the same variant
    const again = draft(serializeDiagramCode(graph));
    expect(node(again.elements, "store")).toMatchObject({ type: "outline", variant: id });
  });

  it("reads each variant's connectors to the node's own anchors", () => {
    const { elements } = draft("Store [shape: cloud]\nWeb\nWeb > Store");
    const arrow = elements.find((el) => el.type === "arrow") as DrawingElement & { endConnection?: { elementId: string } };
    expect(arrow.endConnection?.elementId).toBe(node(elements, "store").id);
  });

  it("applies a shape change to the board in place, as one patch", () => {
    const first = ready(planApply({ code: "Store [shape: diamond]\nWeb\nWeb > Store", canvas: [], generationId: "g1" }));
    const canvas = applyPlan([], first);
    expect(node(canvas, "store").type).toBe("diamond");
    const base = first.sync;
    const next = ready(planApply({ code: "Store [shape: cylinder]\nWeb\nWeb > Store", canvas, generationId: "g1", sync: base }));
    const after = applyPlan(canvas, next);
    expect(node(after, "store")).toMatchObject({ type: "outline", variant: "cylinder", id: node(canvas, "store").id });
    // a board edit of the variant reads back into the code
    const edited = after.map((el) => (el.id === node(after, "store").id ? ({ ...el, variant: "hexagon" } as DrawingElement) : el));
    expect(loadFromCanvas(edited, { layout: false, generationId: "g2" })?.code).toContain("shape: hexagon");
  });

  it("draws a node whose variant the code does not know as an ordinary node, with the warning", () => {
    const { elements, issues } = draft("Store [shape: teapot]");
    expect(node(elements, "store").type).toBe("semantic-node");
    expect(issues.some((i) => /teapot/.test(i.message))).toBe(true);
  });

  it("reads a board element with an unknown variant as a plain node, never crashing", () => {
    const { elements } = draft("Store [shape: cylinder]");
    const unknown = elements.map((el) => (el.type === "outline" ? ({ ...el, variant: "teapot" } as DrawingElement) : el));
    const { graph } = graphFromElements(unknown);
    expect(graph.nodes.find((n) => n.label === "Store")?.shape).toBeUndefined();
    expect(() => serializeDiagramCode(graph)).not.toThrow();
  });

  it("registry order drives docs: every variant has a vocabulary entry", () => {
    for (const v of listOutlineVariants()) expect(SHAPES.find((s) => s.name === v.id)?.summary).toContain(v.description);
  });
});
