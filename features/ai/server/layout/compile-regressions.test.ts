import { describe, expect, it } from "vitest";
import { compileAIDiagramDetailed, compileAIDiagramToCanvas, sizeDiagramNode } from "@/features/ai/server/canvas-compiler";
import { graphFromElements, elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import { findMovedNodes } from "@/features/diagram-code/pins";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { LAYOUT_FIXTURES } from "./fixtures";
import { fixtureDocument } from "./fixtures/base";
import { measureLayout, nodeBox } from "./metrics";
import type { PlacementEngine } from "./types";

const fixtures = Object.entries(LAYOUT_FIXTURES);
const nodesOf = (els: DrawingElement[]) => els.filter((e) => e.type === "semantic-node");
const centre = (e: DrawingElement) => {
  const b = nodeBox(e);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};

describe("dynamic node sizing", () => {
  it("sizes a node from its label: short stays 168 x 78, long and multiline get taller", () => {
    const short = sizeDiagramNode({ id: "a", label: "API", kind: "service" }, "balanced");
    const long = sizeDiagramNode({ id: "b", label: "Primary PostgreSQL database cluster (eu-west-1)", kind: "database" }, "balanced");
    const multi = sizeDiagramNode({ id: "c", label: "Send one-time code\nby SMS or authenticator app", kind: "mobile" }, "balanced");
    expect([short.width, short.height]).toEqual([168, 78]);
    expect(long.height).toBeGreaterThan(78);
    expect(multi.lineCount).toBeGreaterThanOrEqual(2);
  });

  it("decision nodes stay at least 92 tall", () => {
    expect(sizeDiagramNode({ id: "d", label: "OK?", kind: "decision" }, "balanced").height).toBeGreaterThanOrEqual(92);
  });

  it.each(fixtures)("%s: no label is shrunk below its requested size or cut, and no two nodes overlap", (_name, doc) => {
    const m = measureLayout(compileAIDiagramToCanvas(doc, "f"), doc.groups);
    expect(m.labelsShrunk).toBe(0);
    expect(m.labelsCut).toBe(0);
    expect(m.nodeOverlaps).toBe(0);
  });

  it.each(fixtures)("%s: every node box is exactly as wide and tall as sizeDiagramNode says", (_name, doc) => {
    const els = nodesOf(compileAIDiagramToCanvas(doc, "f"));
    for (const el of els) {
      const node = doc.nodes.find((n) => n.id === el.ai!.semanticId)!;
      const size = sizeDiagramNode(node, doc.styleHints.density);
      const b = nodeBox(el);
      expect(b.maxX - b.minX).toBeCloseTo(size.width, 6);
      expect(b.maxY - b.minY).toBeCloseTo(size.height, 6);
    }
  });
});

describe("layering with cycles", () => {
  // start -> a -> b -> c -> d, with a retry edge d -> a. Nodes behind the loop used to get an
  // arbitrary row (index / 4) because a topological sort never finishes a cycle.
  const loop = fixtureDocument({
    id: "loop", diagramType: "flowchart", prompt: "loop",
    nodes: ["start", "a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), kind: "service" as const })),
    edges: [{ from: "start", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "a" }],
  });

  it("puts the forward chain in successive rows even though a loop-back edge exists", () => {
    const ys = ["start", "a", "b", "c", "d"].map((id) => nodeBox(nodesOf(compileAIDiagramToCanvas(loop, "f")).find((e) => e.ai!.semanticId === id)!).minY);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it("handles a graph that is nothing but a cycle, a self loop, and a two-node cycle", () => {
    const doc = fixtureDocument({
      id: "cyc", diagramType: "flowchart", prompt: "cycles",
      nodes: ["a", "b", "c", "x", "y"].map((id) => ({ id, label: id, kind: "service" as const })),
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, { from: "x", to: "y" }, { from: "y", to: "x" }, { from: "a", to: "a" }],
    });
    const els = compileAIDiagramToCanvas(doc, "f");
    expect(nodesOf(els)).toHaveLength(5);
    expect(measureLayout(els).nodeOverlaps).toBe(0);
  });
});

describe("parallel and opposite edges", () => {
  it("draws every one of several edges between the same pair, each with its own label", () => {
    const doc = fixtureDocument({
      id: "par", diagramType: "architecture", prompt: "parallel",
      nodes: [{ id: "a", label: "A", kind: "service" }, { id: "b", label: "B", kind: "service", layer: "data" }],
      edges: [{ from: "a", to: "b", label: "authorize" }, { from: "a", to: "b", label: "capture" }, { from: "b", to: "a", label: "result" }],
    });
    const result = compileAIDiagramDetailed(doc, "f");
    expect(result.elements.filter((e) => e.type === "arrow")).toHaveLength(3);
    expect(result.elements.filter((e) => e.ai?.role === "edge-label")).toHaveLength(3);
    expect(measureLayout(result.elements).labelsColliding).toBe(0);
  });

  it("never draws a request and its response on top of each other", () => {
    // Reported from the app: "auth success" and "HTTP request" shared one line, so one was invisible.
    const doc = fixtureDocument({
      id: "pair", diagramType: "flowchart", prompt: "pair",
      nodes: [{ id: "a", label: "Gateway", kind: "gateway" }, { id: "b", label: "Auth", kind: "authentication", layer: "data" }],
      edges: [{ from: "a", to: "b", label: "HTTP request" }, { from: "b", to: "a", label: "auth success" }],
    });
    const els = compileAIDiagramToCanvas(doc, "f");
    const m = measureLayout(els);
    expect(m.edgeOverlaps).toBe(0);
    const [first, second] = els.filter((e) => e.type === "arrow");
    expect(JSON.stringify(first.points)).not.toBe(JSON.stringify([...second.points].reverse()));
    expect(m.labelsColliding).toBe(0);
  });

  it("gives a third edge between the same pair yet another side", () => {
    const doc = fixtureDocument({
      id: "three", diagramType: "flowchart", prompt: "three",
      nodes: [{ id: "a", label: "A", kind: "service" }, { id: "b", label: "B", kind: "service", layer: "data" }],
      edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }, { from: "b", to: "a" }],
    });
    const arrows = compileAIDiagramToCanvas(doc, "f").filter((e) => e.type === "arrow");
    const sides = new Set(arrows.map((a) => a.startConnection!.anchorId!.split("-").pop()));
    expect(sides.size).toBe(3);
    expect(measureLayout(arrows).edgeOverlaps).toBe(0);
  });
});

describe("persistence and compatibility", () => {
  it.each(fixtures)("%s: the compiled board survives save and reload unchanged", (_name, doc) => {
    const els = compileAIDiagramToCanvas(doc, "f");
    const parsed = parseSavedContent(JSON.stringify({ elements: els }));
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") expect(parsed.elements).toEqual(JSON.parse(JSON.stringify(els)));
  });

  it.each(fixtures)("%s: reading the diagram back off the canvas recovers its nodes, edges and groups", (_name, doc) => {
    const { graph } = graphFromElements(compileAIDiagramToCanvas(doc, "f"));
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(doc.nodes.map((n) => n.id).sort());
    expect(graph.edges).toHaveLength(doc.edges.length);
    expect(graph.groups.length).toBe(doc.groups.filter((g) => g.nodeIds.length >= 2).length);
  });

  it("adds no new stored fields: every element keeps the shape older boards use", () => {
    const keys = new Set(compileAIDiagramToCanvas(LAYOUT_FIXTURES.architecture, "f").flatMap((e) => Object.keys(e)));
    const allowed = new Set(["id", "type", "points", "color", "strokeWidth", "fill", "label", "fontSize", "fontWeight", "fontStyle", "text", "dashed", "isGuide", "ai", "arrowHeadStart", "arrowHeadEnd", "routingMode", "routePreference", "isManuallyRouted", "startConnection", "endConnection"]);
    expect([...keys].filter((k) => !allowed.has(k))).toEqual([]);
  });
});

describe("error recovery", () => {
  const doc = LAYOUT_FIXTURES.architecture;
  const broken: PlacementEngine = () => {
    throw new Error("engine exploded");
  };

  it("falls back to a plain grid when the layout engine throws, keeping every node", () => {
    const result = compileAIDiagramDetailed(doc, "f", { engine: broken });
    expect(result.diagnostics.layoutFallback).toBe("engine exploded");
    expect(nodesOf(result.elements)).toHaveLength(doc.nodes.length);
    expect(measureLayout(result.elements).nodeOverlaps).toBe(0);
  });

  it("does not report a fallback on the normal path", () => {
    expect(compileAIDiagramDetailed(doc, "f").diagnostics.layoutFallback).toBeUndefined();
  });

  it("survives degenerate documents: no nodes, edges to unknown nodes, duplicate edges", () => {
    expect(compileAIDiagramToCanvas(fixtureDocument({ id: "e", diagramType: "flowchart", prompt: "", nodes: [], edges: [] }), "f")).toEqual([]);
    const odd = fixtureDocument({
      id: "odd", diagramType: "flowchart", prompt: "odd",
      nodes: [{ id: "a", label: "A", kind: "service" }, { id: "b", label: "B", kind: "service" }],
      edges: [{ from: "a", to: "ghost" }, { from: "a", to: "b" }, { from: "a", to: "b" }],
    });
    const els = compileAIDiagramToCanvas(odd, "f");
    expect(nodesOf(els)).toHaveLength(2);
    expect(els.filter((e) => e.type === "arrow")).toHaveLength(2); // the unknown target is skipped
  });

  it("copes with a large graph with cycles in reasonable time", () => {
    const n = 120;
    const big = fixtureDocument({
      id: "big", diagramType: "architecture", prompt: "big",
      nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Service number ${i}`, kind: "service" as const, layer: (["edge", "application", "data"] as const)[i % 3] })),
      edges: Array.from({ length: n * 2 }, (_, i) => ({ from: `n${i % n}`, to: `n${(i * 7 + 3) % n}` })).filter((e) => e.from !== e.to),
    });
    const t0 = performance.now();
    const els = compileAIDiagramToCanvas(big, "f");
    expect(nodesOf(els)).toHaveLength(n);
    expect(performance.now() - t0).toBeLessThan(20_000);
  }, 30_000);
});

describe("manual positioning survives regeneration", () => {
  const code = `
diagram: flowchart
Web App > API: HTTPS
API > Orders
API > Search
Orders > Orders DB: SQL
Search > Index
`;
  const first = () => elementsFromDiagramCode(code, { generationId: "g1", frameId: "f" }).elements;
  const byLabel = (els: DrawingElement[], label: string) => nodesOf(els).find((e) => e.label === label)!;

  it("recognises an untouched diagram as having no manual positions", () => {
    expect(findMovedNodes(first()).size).toBe(0);
  });

  it("does not mistake moving the whole diagram for manual positioning", () => {
    const shifted = first().map((e) => ({ ...e, points: e.points.map((p) => ({ x: p.x + 300, y: p.y - 120 })) }));
    expect(findMovedNodes(shifted).size).toBe(0);
  });

  it("finds exactly the node that was dragged", () => {
    const els = first();
    const target = byLabel(els, "Orders DB");
    const moved = els.map((e) => (e.id === target.id ? { ...e, points: e.points.map((p) => ({ x: p.x + 400, y: p.y + 220 })) } : e));
    const pins = findMovedNodes(moved);
    expect([...pins.keys()]).toEqual([target.ai!.semanticId]);
    expect(pins.get(target.ai!.semanticId!)).toEqual({ x: centre(target).x + 400, y: centre(target).y + 220 });
  });

  it("keeps the dragged node where it was when the code is edited and re-applied", () => {
    const els = first();
    const target = byLabel(els, "Search");
    const want = { x: centre(target).x + 500, y: centre(target).y + 300 };
    const moved = els.map((e) => (e.id === target.id ? { ...e, points: e.points.map((p) => ({ x: p.x + 500, y: p.y + 300 })) } : e));

    const edited = serializeDiagramCode(graphFromElements(moved).graph) + "\nOrders > Payments: charge\n";
    const next = elementsFromDiagramCode(edited, { generationId: "g2", frameId: "f", pins: findMovedNodes(moved) }).elements;

    expect(centre(byLabel(next, "Search"))).toEqual(want);
    expect(nodesOf(next).map((e) => e.label)).toContain("Payments");
    expect(measureLayout(next).nodeOverlaps).toBe(0);
    expect(next.filter((e) => e.type === "arrow")).toHaveLength(6);
  });

  it("pins everything when the board came from a different layout, so nothing moves", () => {
    const els = first().map((e) => (e.type === "semantic-node" ? { ...e, points: e.points.map((p) => ({ x: p.x * 1.7 + (e.label?.length ?? 0) * 13, y: p.y * 1.3 })) } : e));
    const pins = findMovedNodes(els);
    expect(pins.size).toBeGreaterThanOrEqual(nodesOf(els).length - 1);
  });
});
