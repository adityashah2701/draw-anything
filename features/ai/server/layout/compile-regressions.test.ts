import { describe, expect, it } from "vitest";
import { compileAIDiagramDetailed, compileAIDiagramToCanvas, sizeDiagramNode } from "@/features/ai/server/canvas-compiler";
import { createEstimateContext, estimateLabelBox } from "@/core/text/estimate";
import { layoutShapeLabel } from "@/core/text/label-layout";
import { pillLabelBox } from "@/core/text/label-region";
import { graphFromElements, elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import { findMovedNodes } from "@/features/diagram-code/pins";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { ArrowShape, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { LAYOUT_FIXTURES } from "./fixtures";
import { nestedGroups } from "../../../../tests/browser/baseline-fixtures";
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

describe("decision diamonds", () => {
  const doc = LAYOUT_FIXTURES.flowchart;
  const elements = compileAIDiagramToCanvas(doc, "frame-diamond");
  const decisions = doc.nodes.filter((n) => n.kind === "decision");

  it("draws every decision as a diamond and every other node as a semantic node", () => {
    expect(decisions.length).toBeGreaterThan(0);
    for (const node of doc.nodes) {
      const el = elements.find((e) => e.ai?.semanticId === node.id)!;
      expect(el.type).toBe(node.kind === "decision" ? "diamond" : "semantic-node");
    }
  });

  it.each(["OK?", "Valid?", "Is the customer's payment method valid and not expired?"])(
    "sizes %s so its text block sits inside the rhombus",
    (label) => {
      const size = sizeDiagramNode({ id: "d", label, kind: "decision" }, "balanced");
      const text = estimateLabelBox({ label, fontSize: 17, fontWeight: "600", maxLines: 3, minWidth: 0, maxWidth: 280 * 0.66 });
      expect(text.width / size.width + text.height / size.height).toBeLessThanOrEqual(1);
      expect(size.height).toBeGreaterThanOrEqual(92);
    },
  );

  it("attaches connectors to the diamond's four vertices", () => {
    const diamond = elements.find((e) => e.type === "diamond")!;
    const [a, b] = diamond.points;
    const vertices = [
      `${(a.x + b.x) / 2},${a.y}`, `${b.x},${(a.y + b.y) / 2}`, `${(a.x + b.x) / 2},${b.y}`, `${a.x},${(a.y + b.y) / 2}`,
    ];
    const arrows = elements.filter(
      (e): e is ArrowShape => e.type === "arrow" && (e.startConnection?.elementId === diamond.id || e.endConnection?.elementId === diamond.id),
    );
    expect(arrows.length).toBeGreaterThan(0);
    for (const arrow of arrows) {
      const end = arrow.startConnection?.elementId === diamond.id ? arrow.points[0] : arrow.points[arrow.points.length - 1];
      expect(vertices).toContain(`${end.x},${end.y}`);
    }
  });

  it("round-trips through diagram code with the decision kind intact", () => {
    const { graph } = graphFromElements(elements);
    for (const node of decisions) {
      expect(graph.nodes.find((n) => n.id === node.id)?.kind).toBe("decision");
    }
  });
});

describe("Eraser-style code on the canvas", () => {
  const code = [
    "type flowchart",
    "Start [color: green]",
    "Ready [shape: diamond]",
    "Done",
    "Start - Ready",
    "Ready > Done: ship [color: red]",
  ].join("\n");
  const { elements, issues } = elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
  const byLabel = (label: string) => elements.find((e) => e.label === label)!;

  it("parses without issues", () => {
    expect(issues).toEqual([]);
  });

  it("draws shape: diamond as a diamond and colours a node by its colour", () => {
    expect(byLabel("Ready").type).toBe("diamond");
    expect(byLabel("Done").type).toBe("semantic-node");
    expect(byLabel("Start")).toMatchObject({ color: "#16a34a" });
    expect(byLabel("Start").fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(byLabel("Start").fill).not.toBe("#16a34a");
  });

  it("draws - without an arrowhead and colours a connection", () => {
    const arrows = elements.filter((e): e is ArrowShape => e.type === "arrow");
    expect(arrows).toHaveLength(2);
    const [line] = arrows.filter((a) => a.arrowHeadEnd === false);
    expect(line).toBeDefined();
    const coloured = arrows.find((a) => a.color === "#dc2626")!;
    expect(coloured.arrowHeadEnd).toBe(true);
  });
});

describe("flowchart terminators (pills)", () => {
  const code = [
    "type flowchart",
    "Start [kind: start]",
    "Enter credentials [kind: workflow]",
    "Valid? [kind: decision]",
    "Dashboard [kind: end]",
    "Locked out [shape: pill, color: red]",
    "Start > Enter credentials > Valid?",
    "Valid? > Dashboard: yes",
    "Valid? > Locked out: no",
  ].join("\n");
  const { elements, issues } = elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
  const named = (label: string) => elements.find((e) => e.label === label)!;
  const doc = { id: "x", kind: "generic" as const };

  it("parses without issues", () => expect(issues).toEqual([]));

  it("draws start and end (and an explicit shape: pill) as pills, steps as semantic nodes, decisions as diamonds", () => {
    expect(named("Start").type).toBe("pill");
    expect(named("Dashboard").type).toBe("pill");
    expect(named("Locked out").type).toBe("pill");
    expect(named("Enter credentials").type).toBe("semantic-node");
    expect(named("Valid?").type).toBe("diamond");
  });

  it("colours a pill by its kind, or by its own colour", () => {
    expect(named("Start")).toMatchObject({ color: "#15803d", fill: "#dcfce7" });
    expect(named("Dashboard")).toMatchObject({ color: "#b91c1c", fill: "#fee2e2" });
    expect(named("Locked out").color).toBe("#dc2626");
  });

  it("sizes each pill to its label, and the label fits its label box at the requested size", () => {
    for (const label of ["Start", "Dashboard", "Locked out"]) {
      const el = named(label);
      const [a, b] = el.points;
      const size = sizeDiagramNode({ ...doc, id: label, label, kind: label === "Locked out" ? "generic" : label === "Start" ? "start" : "end", shape: "pill" }, "balanced");
      expect([Math.abs(b.x - a.x), Math.abs(b.y - a.y)]).toEqual([size.width, size.height]);
      const box = pillLabelBox(size.width, size.height);
      const layout = layoutShapeLabel(createEstimateContext(), { label, boxWidth: box.width, boxHeight: box.height, fontSize: 17, fontWeight: "600", maxLines: box.maxLines });
      expect(layout?.fits).toBe(true);
      expect(layout!.fontSize).toBe(17);
    }
  });

  it("attaches connectors to the pill's edge midpoints", () => {
    const pill = named("Start");
    const [a, b] = pill.points;
    const mids = [`${(a.x + b.x) / 2},${a.y}`, `${b.x},${(a.y + b.y) / 2}`, `${(a.x + b.x) / 2},${b.y}`, `${a.x},${(a.y + b.y) / 2}`];
    const arrows = elements.filter((e): e is ArrowShape => e.type === "arrow" && e.startConnection?.elementId === pill.id);
    expect(arrows.length).toBeGreaterThan(0);
    for (const arrow of arrows) expect(mids).toContain(`${arrow.points[0].x},${arrow.points[0].y}`);
  });

  it("counts pills as nodes: no overlaps and no clipped labels in the layout metrics", () => {
    const m = measureLayout(elements);
    expect(m.nodeOverlaps).toBe(0);
    expect(m.labelsCut).toBe(0);
    expect(elements.filter((e) => e.ai?.role === "node")).toHaveLength(5);
  });

  it("reads back from the canvas with its kind, and writes code that says no more than the kind", () => {
    const { graph } = graphFromElements(elements);
    expect(graph.nodes.find((n) => n.label === "Start")).toMatchObject({ kind: "start", shape: "pill" });
    const text = serializeDiagramCode(graph);
    expect(text).toMatch(/^Start \[kind: start\]$/m);
    expect(text).toMatch(/^Locked out \[shape: pill\]$/m);
    const again = elementsFromDiagramCode(text, { generationId: "g2", frameId: "f" }).elements;
    expect(again.filter((e) => e.type === "pill").map((e) => e.label).sort()).toEqual(["Dashboard", "Locked out", "Start"]);
    expect(again.find((e) => e.label === "Enter credentials")?.type).toBe("semantic-node");
  });

  it("keeps a dragged pill where the user put it when the code is re-applied", () => {
    const start = named("Start");
    const moved = elements.map((e) => (e.id === start.id ? { ...e, points: e.points.map((p) => ({ x: p.x + 400, y: p.y + 250 })) } : e));
    const pins = findMovedNodes(moved);
    expect([...pins.keys()]).toContain("start");
  });

  it("older boards without pills compile exactly as before (kinds without start/end are untouched)", () => {
    const old = compileAIDiagramToCanvas(LAYOUT_FIXTURES.flowchart, "f");
    expect(old.some((e) => e.type === "pill")).toBe(false);
  });

  it("a label of just Start or End becomes a pill even when the kind is not given", () => {
    const bare = elementsFromDiagramCode("type flowchart\nStart\nEnd User\nEnd\nStart > End User > End", { generationId: "g", frameId: "f" }).elements;
    const typeOf = (label: string) => bare.find((e) => e.label === label)?.type;
    expect(typeOf("Start")).toBe("pill");
    expect(typeOf("End")).toBe("pill");
    expect(typeOf("End User")).not.toBe("pill");
  });
});

describe("long identifiers and nested frame titles", () => {
  it("widens a node for a long unbroken name instead of shrinking or breaking it", () => {
    const name = "organization_membership_role_assignments";
    const size = sizeDiagramNode({ id: "t", label: `${name}\nmembership_id, assigned_by_administrator_user_id`, kind: "database" }, "balanced");
    expect(size.fits).toBe(true);
    expect(size.width).toBeGreaterThan(280);
    expect(size.width).toBeLessThanOrEqual(520);
    // Ordinary labels keep the old cap.
    expect(sizeDiagramNode({ id: "u", label: "A normal label that wraps over a few lines in the box", kind: "service" }, "balanced").width).toBeLessThanOrEqual(280);
  });

  it("gives a word that is too long even for the widest box a bounded size, and says it does not fit", () => {
    const size = sizeDiagramNode({ id: "w", label: "x".repeat(120), kind: "generic" }, "balanced");
    expect(size.fits).toBe(false);
    expect(size.width).toBeLessThanOrEqual(520);
  });

  it("leaves room above an inner frame for the outer frame's title", () => {
    const doc = nestedGroups;
    const frames = compileAIDiagramToCanvas(doc, "frame").filter((e) => e.ai?.role === "group");
    const rect = (e: DrawingElement) => ({ minX: Math.min(e.points[0].x, e.points[1].x), minY: Math.min(e.points[0].y, e.points[1].y), maxX: Math.max(e.points[0].x, e.points[1].x), maxY: Math.max(e.points[0].y, e.points[1].y) });
    const TITLE_BOTTOM = 8 + 13 * 1.2; // title top offset + one line of 13px text
    let nestedPairs = 0;
    for (const outer of frames) {
      for (const inner of frames) {
        const o = rect(outer);
        const i = rect(inner);
        const inside = i.minX > o.minX && i.maxX < o.maxX && i.minY > o.minY && i.maxY < o.maxY;
        if (!inside) continue;
        nestedPairs += 1;
        expect(i.minY - o.minY, `${inner.ai?.semanticId} inside ${outer.ai?.semanticId}`).toBeGreaterThanOrEqual(TITLE_BOTTOM + 4);
      }
    }
    expect(nestedPairs).toBeGreaterThanOrEqual(3);
  });
});
