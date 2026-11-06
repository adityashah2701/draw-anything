import { describe, expect, it } from "vitest";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { getShapeAnchors } from "@/core/shapes/shape-runtime";
import { classifierSize } from "@/core/shapes/uml-classifier/layout";
import { lintDiagram } from "./lint";

describe("class diagrams", () => {
  it("flags an enum with no values and a class with no members, not an interface", () => {
    const parsed = parseDiagramCode('type class\nSpotType [shape: enum]\nTicket [shape: class]\nPayment [shape: interface, operations: "+pay(): void"]\nTicket > Payment');
    const rules = lintDiagram(parsed).map((f) => f.rule);
    expect(rules).toContain("class-empty-enum");
    expect(rules).toContain("class-empty-class");
    expect(lintDiagram(parseDiagramCode('type class\nSpotType [shape: enum, attributes: "COMPACT; LARGE"]\nTicket [shape: class, attributes: "-id: int"]\nTicket > SpotType')).map((f) => f.rule)).not.toContain("class-empty-enum");
  });

  it("gives a class one connection point per member on each side, and an interface no empty attribute box", () => {
    const shape = { id: "c", type: "uml-classifier", color: "#000", strokeWidth: 2, name: "Order", attributes: ["-id: int", "-total: Money"], operations: ["+pay(): void"], points: [{ x: 0, y: 0 }, { x: 200, y: 120 }] };
    const ids = getShapeAnchors(shape as never).map((a) => a.id);
    expect(ids.filter((id) => /-anchor-p\d+-left$/.test(id))).toHaveLength(3);
    expect(ids.filter((id) => /-anchor-p\d+-right$/.test(id))).toHaveLength(3);
    expect(classifierSize({ kind: "interface", name: "Payment", operations: ["+pay(): void"] }).height).toBeLessThan(classifierSize({ kind: "class", name: "Payment", operations: ["+pay(): void"] }).height);
  });
});
