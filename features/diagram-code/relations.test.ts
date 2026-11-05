import { describe, expect, it } from "vitest";
import type { ArrowShape, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { compileDiagramCode } from "./language/compile";
import { completeAt } from "./language/tooling/complete";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode } from "./serialize";

const draw = (code: string) => elementsFromDiagramCode(code, { generationId: "g", frameId: "f" }).elements;
const arrows = (els: DrawingElement[]) => els.filter((e) => e.type === "arrow" || e.type === "arrow-bidirectional") as ArrowShape[];
const codes = (source: string) => compileDiagramCode(source).diagnostics.map((d) => d.code);

describe("relations in diagram code", () => {
  it("reads a relation, its notation and the end values, in the plan's own form", () => {
    const parsed = parseDiagramCode("Order > Item [relation: composition, from: 1, to: 0..*]");
    expect(parsed.edges[0].relation).toEqual({ kind: "composition", start: { multiplicity: "1" }, end: { multiplicity: "0..*" } });
    const er = parseDiagramCode("Student > Department: [relation: er-relationship, notation: chen, from: many, to: one]").edges[0].relation;
    expect(er).toEqual({ kind: "er-relationship", notation: "chen", start: { cardinality: "many" }, end: { cardinality: "one" } });
  });

  it("keeps sides and end values apart: from and to take a side or an end value by what the value is", () => {
    const edge = parseDiagramCode("A > B: [from: right, to: left, relation: association, from-end: 1, to-end: 0..*]").edges[0];
    expect(edge).toMatchObject({ fromSide: "right", toSide: "left", relation: { kind: "association", start: { multiplicity: "1" }, end: { multiplicity: "0..*" } } });
    // A plain side leaves the connection without a relation, as before.
    expect(parseDiagramCode("A > B: [from: right]").edges[0].relation).toBeUndefined();
  });

  it("gives end values alone the meaning of an association, and swaps them with a reversed connector", () => {
    expect(parseDiagramCode("A > B [from: 1, to: *]").edges[0].relation).toEqual({ kind: "association", start: { multiplicity: "1" }, end: { multiplicity: "*" } });
    const reversed = parseDiagramCode("A < B [relation: composition, from: 1, to: 0..*]").edges[0];
    expect(reversed).toMatchObject({ from: "b", to: "a", relation: { start: { multiplicity: "0..*" }, end: { multiplicity: "1" } } });
  });

  it("rejects what is not a cardinality or a multiplicity, with a diagnostic and the rest kept", () => {
    expect(codes("A > B [relation: composition, to: 3..]")).toContain("property/invalid-value");
    expect(codes("A > B [relation: er-relationship, to: many-ish]")).toContain("property/invalid-value");
    expect(codes("A > B [relation: composition, to: 0..*]")).toEqual([]);
    expect(codes("A > B [relation: teleport]")).toContain("property/invalid-value");
    expect(parseDiagramCode("A > B [relation: composition, to: 3..]").edges[0].relation).toEqual({ kind: "composition" });
  });

  it("reports ends a relation cannot show, and a notation that does not apply, without dropping the connection", () => {
    expect(codes("A > B [relation: generalization, from: 1]")).toContain("relation/ends-ignored");
    expect(codes("A > B [relation: association, notation: chen]")).toContain("relation/notation-ignored");
    expect(parseDiagramCode("A > B [relation: generalization, from: 1]").edges).toHaveLength(1);
  });

  it("reports a generalization between non-classifiers, and still draws it", () => {
    const code = "Approved? [shape: diamond]\nStart [shape: pill]\nApproved? > Start [relation: generalization]";
    expect(codes(code)).toContain("relation/incompatible");
    expect(arrows(draw(code))).toHaveLength(1);
    expect(codes("Dog\nAnimal\nDog > Animal [relation: generalization]")).toEqual([]);
  });

  it("completes the relation, notation and end values", () => {
    const labels = (src: string) => (completeAt(src, src.length, { nodeNames: ["A", "B"], iconIds: [], inHeader: false })?.items ?? []).map((i) => i.label);
    expect(labels("A > B: [relation: ")).toEqual(expect.arrayContaining(["generalization", "composition", "sync-message"]));
    expect(labels("A > B: [notation: ")).toEqual(expect.arrayContaining(["crows-foot", "chen"]));
    expect(labels("A > B: [to: ")).toEqual(expect.arrayContaining(["right", "many", "zero-or-many"]));
  });
});

describe("relations on the canvas and back", () => {
  it("draws a relation as structured data on the arrow, and a plain connection with none", () => {
    const els = arrows(draw("A > B [relation: composition, from: 1, to: 0..*]\nC > D"));
    expect(els[0].relation).toEqual({ kind: "composition", start: { multiplicity: "1" }, end: { multiplicity: "0..*" } });
    const plain = els[1] as unknown as Record<string, unknown>;
    expect("relation" in plain).toBe(false);
  });

  it("survives canvas to code to canvas", () => {
    const first = draw("A > B [relation: composition, from: 1, to: 0..*]\nC > D [relation: er-relationship, notation: chen, from: one, to: many]\nE > F [relation: sync-message]\nG > H [relation: association, from-role: owner, to-role: items]");
    const code = serializeDiagramCode(graphFromElements(first).graph);
    expect(code).toContain("relation: composition");
    expect(code).toContain("to: 0..*");
    expect(code).toContain("notation: chen");
    const second = arrows(draw(code));
    expect(second.map((a) => a.relation)).toEqual(arrows(first).map((a) => a.relation));
  });

  it("writes an end value as from-end when the same end already names a side, and reads it back", () => {
    const first = draw("A > B [relation: association, from: 1, to: 0..*]");
    const code = serializeDiagramCode(graphFromElements(first, { layout: true }).graph);
    expect(code).toMatch(/from-end: 1/);
    expect(code).toMatch(/to-end: 0\.\.\*/);
    expect(arrows(draw(code))[0].relation).toEqual(arrows(first)[0].relation);
  });

  it("keeps a reversed connection's meaning: the whole stays the source", () => {
    const first = draw("A < B [relation: composition, from: 1, to: 0..*]");
    const a = arrows(first)[0];
    // B > A with the diamond at B (the whole), so the start end is B's.
    expect(a.startConnection?.elementId).toMatch(/-b$/);
    expect(a.relation).toEqual({ kind: "composition", start: { multiplicity: "0..*" }, end: { multiplicity: "1" } });
    const again = arrows(draw(serializeDiagramCode(graphFromElements(first).graph)));
    expect(again[0].relation).toEqual(a.relation);
  });
});
