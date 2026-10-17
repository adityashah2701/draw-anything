import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode } from "./serialize";

const SHOP = `
type architecture
title Shop

Backend {
  API [kind: api]
  Orders [kind: service]
  Orders DB [kind: database]
}
Web App [kind: browser]

Web App > API: HTTPS
API > Orders
Orders --> Orders DB: SQL
`;
const compile = (code: string, generationId = "gen-1") =>
  elementsFromDiagramCode(code, { generationId, frameId: "frame-1" });

const meaning = (code: string) => {
  const p = parseDiagramCode(code);
  const label = new Map(p.nodes.map((n) => [n.id, n.label]));
  return {
    nodes: p.nodes.map((n) => `${n.label}:${n.kind ?? ""}`).sort(),
    edges: p.edges.map((e) => `${label.get(e.from)}>${label.get(e.to)}|${e.label ?? ""}|${e.dashed ? "d" : ""}`).sort(),
    groups: p.groups.map((g) => `${g.label}=[${g.nodeIds.map((id) => label.get(id)).sort()}]`).sort(),
  };
};

describe("elementsFromDiagramCode", () => {
  it("draws nodes, connectors, group frames and connector labels", () => {
    const { elements, issues } = compile(SHOP);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(elements.filter((e) => e.type === "semantic-node").map((e) => e.label).sort()).toEqual([
      "API", "Orders", "Orders DB", "Web App",
    ]);
    expect(elements.filter((e) => e.type === "arrow")).toHaveLength(3);
    expect(elements.filter((e) => e.ai?.role === "group")).toHaveLength(1);
    expect(elements.some((e) => e.ai?.role === "edge-label" && e.text === "HTTPS")).toBe(true);
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
    expect(elements.every((e) => e.ai?.generationId === "gen-1")).toBe(true);
  });

  it("uses a fresh id space per generation, so a second paste never collides", () => {
    const a = compile(SHOP, "gen-a").elements.map((e) => e.id);
    const b = compile(SHOP, "gen-b").elements.map((e) => e.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("draws nothing and explains why when the code has errors", () => {
    const result = compile("Team {\n  A > B\n");
    expect(result.elements).toEqual([]);
    expect(result.issues.some((i) => i.severity === "error" && i.line === 1)).toBe(true);
  });

  it("asks for at least one node", () => {
    const result = compile("// nothing here\n");
    expect(result.elements).toEqual([]);
    expect(result.issues[0]).toMatchObject({ severity: "error" });
  });

  it("clamps an oversized diagram and says so, instead of failing", () => {
    const code = Array.from({ length: 60 }, (_, i) => `N${i} > N${i + 1}`).join("\n");
    const result = compile(code);
    expect(result.elements.filter((e) => e.type === "semantic-node")).toHaveLength(40);
    expect(result.issues.some((i) => i.severity === "warning" && /dropped/i.test(i.message))).toBe(true);
  });

  it("keeps warnings from the parser alongside the drawing", () => {
    const result = compile("A [wibble: 1] > B");
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("graphFromElements", () => {
  it("reads a generated diagram back, including frames and connector labels", () => {
    const { elements } = compile(SHOP);
    const { graph, consumedIds } = graphFromElements(elements);
    expect(graph.nodes.map((n) => n.label).sort()).toEqual(["API", "Orders", "Orders DB", "Web App"]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.find((e) => e.label === "HTTPS")).toBeDefined();
    expect(graph.edges.find((e) => e.dashed)).toBeDefined();
    expect(graph.groups).toHaveLength(1);
    expect(graph.groups[0].nodeIds).toHaveLength(3);
    expect(graph.diagramType).toBe("architecture");
    // every generated element is accounted for, so "Update" can replace them all
    expect(consumedIds.sort()).toEqual(elements.map((e) => e.id).sort());
  });

  it("round-trips: code -> canvas -> code means the same thing", () => {
    const { elements } = compile(SHOP);
    const { graph } = graphFromElements(elements);
    expect(meaning(serializeDiagramCode(graph))).toEqual(meaning(SHOP));
  });

  const shape = (over: Partial<DrawingElement> & { id: string; type: string }) =>
    ({ points: [{ x: 0, y: 0 }, { x: 100, y: 60 }], color: "#000", strokeWidth: 2, ...over }) as DrawingElement;

  it("understands shapes the user drew by hand", () => {
    const elements: DrawingElement[] = [
      shape({ id: "r1", type: "rectangle", label: "Client" }),
      shape({ id: "d1", type: "diamond", label: "Valid?", points: [{ x: 300, y: 0 }, { x: 400, y: 80 }] }),
      shape({ id: "c1", type: "circle", points: [{ x: 600, y: 0 }, { x: 680, y: 80 }] }),
      shape({ id: "t1", type: "text", text: "a note", points: [{ x: 0, y: 200 }] }),
      shape({ id: "a1", type: "arrow", startConnection: { elementId: "r1" }, endConnection: { elementId: "d1" }, arrowHeadEnd: true } as never),
      shape({ id: "a2", type: "arrow", startConnection: { elementId: "d1" }, arrowHeadEnd: true } as never), // dangling
    ];
    const { graph, consumedIds } = graphFromElements(elements);
    expect(graph.nodes.map((n) => n.label)).toEqual(["Client", "Valid?", "Shape 1"]);
    expect(graph.nodes.find((n) => n.label === "Valid?")!.kind).toBe("decision");
    expect(graph.edges).toHaveLength(1);
    expect(consumedIds.sort()).toEqual(["a1", "c1", "d1", "r1"]); // note and dangling arrow stay put
  });

  it("only reads what it is given (a selection)", () => {
    const { elements } = compile("A > B\nC > D");
    const firstTwo = elements.filter((e) => ["A", "B"].includes(e.label ?? "") || (e.type === "arrow" && e.ai?.semanticId?.endsWith("edge-1")));
    const { graph } = graphFromElements(firstTwo);
    expect(graph.nodes.map((n) => n.label).sort()).toEqual(["A", "B"]);
  });

  it("reverses a connector that only has an arrowhead at its start", () => {
    const elements = [
      shape({ id: "r1", type: "rectangle", label: "A" }),
      shape({ id: "r2", type: "rectangle", label: "B" }),
      shape({ id: "a1", type: "arrow", startConnection: { elementId: "r1" }, endConnection: { elementId: "r2" }, arrowHeadStart: true, arrowHeadEnd: false } as never),
    ];
    const { graph } = graphFromElements(elements);
    expect(graph.edges[0]).toMatchObject({ from: "r2", to: "r1" });
  });

  it("returns an empty graph for an empty or irrelevant canvas", () => {
    expect(graphFromElements([]).graph.nodes).toEqual([]);
    const text = graphFromElements([shape({ id: "t", type: "text", text: "hi", points: [{ x: 0, y: 0 }] })]);
    expect(text.graph.nodes).toEqual([]);
    expect(text.consumedIds).toEqual([]);
  });
});

describe("node colours survive the canvas", () => {
  const roundTrip = (code: string) => {
    const { elements } = compile(code);
    return graphFromElements(elements).graph.nodes;
  };

  it("reads an explicit color back, so regenerating the code keeps it", () => {
    const nodes = roundTrip("type flowchart\nReview [color: #ff0066]\nShip [color: green]\nReview > Ship");
    expect(nodes.find((n) => n.label === "Review")?.color).toBe("#ff0066");
    expect(nodes.find((n) => n.label === "Ship")?.color).toBe("#16a34a");
    expect(serializeDiagramCode({ nodes, edges: [], groups: [] })).toContain("color: #ff0066");
  });

  it("does not invent a color for nodes that only have their kind's colours", () => {
    const nodes = roundTrip("type architecture\nAPI [kind: api]\nDB [kind: database]\nAPI > DB");
    expect(nodes.every((n) => n.color === undefined)).toBe(true);
  });

  it("keeps a custom colour on a diamond and a pill", () => {
    const nodes = roundTrip("type flowchart\nOK? [shape: diamond, color: #7c3aed]\nStart [shape: pill, color: #0d9488]\nStart > OK?");
    expect(nodes.find((n) => n.label === "OK?")?.color).toBe("#7c3aed");
    expect(nodes.find((n) => n.label === "Start")?.color).toBe("#0d9488");
  });
});
