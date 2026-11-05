import { describe, expect, it } from "vitest";
import { MARKER_IDS } from "@/core/shapes/outline/markers";
import type { DrawingElement, OutlineShape } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { compileDiagramCode } from "./language/compile";
import { completeAt } from "./language/tooling/complete";
import { serializeDiagramCode } from "./serialize";

const draw = (code: string) => elementsFromDiagramCode(code, { generationId: "g", frameId: "f" }).elements;
const nodeOf = (elements: DrawingElement[], id: string) => elements.find((el) => el.ai?.role === "node" && el.ai.semanticId === id) as OutlineShape;

describe("border, marker and stack in the language", () => {
  it("draws a plain shape through its base outline and carries the parameters", () => {
    const els = draw("Gate [shape: diamond, border: double, marker: plus]\nEvent [shape: pill, border: thick, marker: clock]\nStore [stack: true]");
    expect(nodeOf(els, "gate")).toMatchObject({ type: "outline", variant: "rhombus", border: "double", marker: "plus" });
    expect(nodeOf(els, "event")).toMatchObject({ type: "outline", variant: "ring", border: "thick", marker: "clock" });
    // A plain node keeps its icon and kind: a stack is a modifier of it, not a different shape.
    expect(nodeOf(els, "store")).toMatchObject({ type: "semantic-node", nodeStyle: { stack: true } });
    expect(draw("Q [shape: diamond, stack: true]").find((e) => e.ai?.semanticId === "q")).toMatchObject({ type: "outline", variant: "rhombus", stack: true });
  });

  it("reads a status as its colour", () => {
    const els = draw("Dead letters [kind: queue, status: error]\nOk [status: success]");
    expect(nodeOf(els, "dead-letters").color).toBe("#dc2626");
    expect(nodeOf(els, "ok").color).toBe("#16a34a");
    expect(compileDiagramCode("A [status: loud]").diagnostics.map((d) => d.code)).toContain("property/invalid-value");
  });

  it("applies them to an outline shape as it is", () => {
    expect(nodeOf(draw("Db [shape: cylinder, stack: true]"), "db")).toMatchObject({ variant: "cylinder", stack: true });
  });

  it("stores nothing when a node has none, so old diagrams are unchanged", () => {
    const el = nodeOf(draw("A [shape: cylinder]\nB [shape: diamond]"), "a") as unknown as Record<string, unknown>;
    for (const key of ["border", "marker", "stack"]) expect(key in el).toBe(false);
  });

  it("reads them back into code that draws the same thing", () => {
    const first = draw("Gate [shape: diamond, border: double, marker: plus]\nEvent [shape: pill, marker: dot]\nStore [stack: true]");
    const code = serializeDiagramCode(graphFromElements(first).graph);
    expect(code).not.toMatch(/Store \[.*shape/);
    expect(code).toContain("border: double"); // no entry draws a double diamond with a plus, so the parameters are written
    expect(code).toContain("marker: plus");
    expect(code).toContain("shape: initial-state"); // a ring with a dot has a name
    expect(code).toContain("stack: true");
    const second = draw(code);
    for (const id of ["gate", "event", "store"]) {
      const [a, b] = [nodeOf(first, id), nodeOf(second, id)];
      const look = (n: OutlineShape & { nodeStyle?: { stack?: boolean } }) => ({ type: n.type, variant: n.variant, border: n.border, marker: n.marker, stack: n.stack ?? n.nodeStyle?.stack });
      expect(look(b)).toEqual(look(a));
    }
  });

  it("warns about a value it does not know and keeps the rest", () => {
    const { diagnostics } = compileDiagramCode("A [border: wavy, marker: skull, stack: maybe, shape: diamond]");
    expect(diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["property/invalid-value"]));
    expect(diagnostics.filter((d) => d.code === "property/invalid-value")).toHaveLength(3);
    const el = nodeOf(draw("A [border: wavy, marker: skull, shape: diamond]"), "a") as unknown as Record<string, unknown>;
    expect(el.type).toBe("diamond");
  });

  it("completes the values", () => {
    const labels = (code: string) => (completeAt(code, code.length, { nodeNames: ["A"], iconIds: [], inHeader: false })?.items ?? []).map((i) => i.label);
    expect(labels("A [border: ")).toEqual(["double", "thick"]);
    expect(labels("A [marker: ")).toEqual(expect.arrayContaining([...MARKER_IDS]));
  });

  it("reads a parametric shape name as its base outline and parameters, and writes the name back", () => {
    const els = draw("Wait [shape: timer-event]\nSplit [shape: xor]\nStart [shape: start-event]\nCustom [shape: parallel-gateway, border: thick]");
    expect(nodeOf(els, "wait")).toMatchObject({ type: "outline", variant: "ring", border: "double", marker: "clock" });
    expect(nodeOf(els, "split")).toMatchObject({ type: "outline", variant: "rhombus", marker: "cross" });
    const start = nodeOf(els, "start") as unknown as Record<string, unknown>;
    expect(start).toMatchObject({ type: "outline", variant: "ring" });
    for (const key of ["border", "marker", "stack"]) expect(key in start).toBe(false);
    expect(nodeOf(els, "custom")).toMatchObject({ variant: "rhombus", marker: "plus", border: "thick" }); // an explicit property wins
    const code = serializeDiagramCode(graphFromElements(els).graph);
    expect(code).toContain("shape: timer-event");
    expect(code).toContain("shape: exclusive-gateway");
    expect(code).toContain("shape: start-event");
    const again = draw(code);
    for (const id of ["wait", "split", "start", "custom"]) {
      const [a, b] = [nodeOf(els, id), nodeOf(again, id)];
      expect({ v: b.variant, bo: b.border, m: b.marker, s: b.stack }).toEqual({ v: a.variant, bo: a.border, m: a.marker, s: a.stack });
    }
  });
});
