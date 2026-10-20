import { describe, expect, it } from "vitest";
import { MAX_GRAPH_NODES } from "@/features/ai/schemas";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode } from "./serialize";

const norm = (label: string) => label.replace(/\s+/g, " ").trim();
const labelsOf = (elements: DrawingElement[]) => graphFromElements(elements).graph.nodes.map((n) => norm(n.label)).sort();

describe("canvas -> code -> canvas keeps every fixture intact", () => {
  for (const [name, doc] of Object.entries(LAYOUT_FIXTURES)) {
    it(`${name}: the generated code parses cleanly and rebuilds the same diagram`, () => {
      const elements = compileAIDiagramToCanvas(doc, "frame");
      const { graph } = graphFromElements(elements);
      const code = serializeDiagramCode(graph);
      const parsed = parseDiagramCode(code);
      expect(parsed.issues, code).toEqual([]);
      expect(parsed.nodes).toHaveLength(graph.nodes.length);
      expect(parsed.edges).toHaveLength(graph.edges.length);

      const rebuilt = elementsFromDiagramCode(code, { generationId: "g2", frameId: "f2" });
      expect(rebuilt.issues.filter((i) => i.severity === "error")).toEqual([]);
      const original = labelsOf(elements);
      const again = labelsOf(rebuilt.elements);
      if (graph.nodes.length <= MAX_GRAPH_NODES) {
        // Line breaks inside a label become spaces in code (see the test below), so labels are compared by words.
        expect(again).toEqual(original);
        expect(rebuilt.elements.filter((e) => e.type === "arrow")).toHaveLength(elements.filter((e) => e.type === "arrow").length);
      } else {
        // Over the node limit the code path clamps and says so; nothing else may change.
        expect(again).toHaveLength(MAX_GRAPH_NODES);
        expect(again.every((l) => original.includes(l))).toBe(true);
        expect(rebuilt.issues.map((i) => i.message).join(" ")).toMatch(/Dropped \d+ node\(s\) beyond the limit of 40/);
      }
    });
  }

  it("explicit line breaks in a label survive the code view as \\n escapes", () => {
    const code = serializeDiagramCode({ nodes: [{ id: "a", label: "Payments\nand refunds" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }], groups: [] });
    expect(code).toContain('label: "Payments\\nand refunds"');
    expect(parseDiagramCode(code).nodes[0].label).toBe("Payments\nand refunds");
    const edge = serializeDiagramCode({ nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b", label: "first\nsecond" }], groups: [] });
    expect(parseDiagramCode(edge).edges[0].label).toBe("first\nsecond");
  });
});

describe("labels full of connector-like text survive the code view (existing boards)", () => {
  const nasty = ["Auth - Login", "Read -- Write", "A <> B", "a --> b", "x > y", " - ", "Plan: Q3 [draft]", "// not a comment", '"quoted"', "end }"];

  it("keeps each label as one node and the connections between them", () => {
    const nodes = nasty.map((label, i) => ({ id: `n${i}`, label }));
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
    const code = serializeDiagramCode({ nodes, edges, groups: [] });
    const parsed = parseDiagramCode(code);
    expect(parsed.issues.filter((i) => i.severity === "error"), code).toEqual([]);
    expect(parsed.nodes.map((n) => n.label.replace(/\s+/g, " ").replace(/"/g, "'").trim())).toEqual(
      nasty.map((l) => l.replace(/\s+/g, " ").replace(/"/g, "'").trim() || "Untitled"),
    );
    expect(parsed.edges).toHaveLength(edges.length);
  });
});

describe("legacy boards (no shape, colour or line fields)", () => {
  it("read back as ordinary arrows and nodes", () => {
    const legacy = [
      { id: "a", type: "rectangle", points: [{ x: 0, y: 0 }, { x: 100, y: 60 }], color: "#000", strokeWidth: 2, label: "A" },
      { id: "b", type: "rectangle", points: [{ x: 300, y: 0 }, { x: 400, y: 60 }], color: "#000", strokeWidth: 2, label: "B" },
      {
        id: "x",
        type: "arrow",
        points: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        color: "#000",
        strokeWidth: 2,
        arrowHeadEnd: true,
        startConnection: { elementId: "a", anchorId: "a-right" },
        endConnection: { elementId: "b", anchorId: "b-left" },
      },
    ] as unknown as DrawingElement[];
    const { graph } = graphFromElements(legacy);
    expect(graph.edges).toEqual([{ from: "a", to: "b", label: undefined, dashed: undefined, bidirectional: undefined, plain: undefined }]);
    expect(serializeDiagramCode(graph)).not.toMatch(/shape:|color:/);
  });

  it("a line drawn without an arrowhead comes back as a plain line", () => {
    const line = [
      { id: "a", type: "rectangle", points: [{ x: 0, y: 0 }, { x: 100, y: 60 }], color: "#000", strokeWidth: 2, label: "A" },
      { id: "b", type: "rectangle", points: [{ x: 300, y: 0 }, { x: 400, y: 60 }], color: "#000", strokeWidth: 2, label: "B" },
      {
        id: "x",
        type: "arrow",
        points: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        color: "#000",
        strokeWidth: 2,
        arrowHeadEnd: false,
        startConnection: { elementId: "a", anchorId: "a-right" },
        endConnection: { elementId: "b", anchorId: "b-left" },
      },
    ] as unknown as DrawingElement[];
    const code = serializeDiagramCode(graphFromElements(line).graph);
    expect(code).toMatch(/A - B/);
    expect(parseDiagramCode(code).edges[0].plain).toBe(true);
  });
});
