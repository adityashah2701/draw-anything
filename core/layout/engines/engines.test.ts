import { describe, expect, it } from "vitest";
import { bpmnEngine } from "./bpmn";
import { erEngine } from "./er";
import { mindMapEngine } from "./mind-map";
import { sequenceEngine } from "./sequence";
import { umlEngine } from "./uml";
import type { LayoutEdge, LayoutEngine, LayoutGraph, LayoutRequest } from "../types";

const n = (id: string, w = 140, h = 60) => ({ id, width: w, height: h, label: id });
const e = (from: string, to: string, extra: Partial<LayoutEdge> = {}): LayoutEdge => ({ id: `${from}-${to}`, from, to, ...extra });
const request = (engine: LayoutEngine, graph: LayoutGraph, algorithm: string, extra: Partial<LayoutRequest> = {}): LayoutRequest => ({
  graph, algorithm, params: engine.algorithms.find((a) => a.id === algorithm)!.defaults, mode: "overwrite", positions: new Map(), seed: 1, budget: { maxMs: 1000 }, ...extra,
});
const place = (engine: LayoutEngine, graph: LayoutGraph, algorithm: string) => engine.layout(request(engine, graph, algorithm)).positions;

const tree: LayoutGraph = { nodes: ["root", "a", "b", "c", "a1", "a2", "b1", "c1", "c2", "c3"].map((id) => n(id)), edges: [e("root", "a"), e("root", "b"), e("root", "c"), e("a", "a1"), e("a", "a2"), e("b", "b1"), e("c", "c1"), e("c", "c2"), e("c", "c3")], containers: [] };
const er: LayoutGraph = { nodes: ["student", "course", "teacher", "room", "x", "y"].map((id) => n(id, 160, 120)), edges: [e("student", "course"), e("teacher", "course"), e("course", "room"), e("x", "y")], containers: [] };
const uml: LayoutGraph = {
  nodes: ["Animal", "Dog", "Cat", "Puppy", "Owner"].map((id) => n(id, 160, 100)),
  edges: [e("Dog", "Animal", { relation: { kind: "generalization" } }), e("Cat", "Animal", { relation: { kind: "generalization" } }), e("Puppy", "Dog", { relation: { kind: "generalization" } }), e("Owner", "Dog", { relation: { kind: "association" } })],
  containers: [{ id: "pets", kind: "group", members: ["Animal", "Dog", "Cat", "Puppy"] }],
};
const flow: LayoutGraph = { nodes: ["start", "check", "approve", "reject", "end"].map((id) => n(id)), edges: [e("start", "check"), e("check", "approve"), e("check", "reject"), e("approve", "end"), e("reject", "end")], containers: [{ id: "L1", kind: "lane", members: ["start", "check"] }, { id: "L2", kind: "lane", members: ["approve", "reject", "end"] }] };
const seq: LayoutGraph = { nodes: ["Client", "Server", "DB", "Cache"].map((id) => n(id, 120, 50)), edges: [e("Client", "Server", { label: "request" }), e("Server", "Cache", { label: "lookup" }), e("Server", "DB", { label: "query" }), e("DB", "Server"), e("Server", "Client", { label: "response" })], containers: [] };

const CASES: Array<[LayoutEngine, LayoutGraph, string[]]> = [
  [mindMapEngine, tree, ["radial", "tree", "organic"]],
  [erEngine, er, ["clusters", "compact", "hierarchical"]],
  [umlEngine, uml, ["inheritance", "layered", "package"]],
  [bpmnEngine, flow, ["vertical", "horizontal", "swimlane"]],
  [sequenceEngine, seq, ["participants", "closest"]],
];
const overlap = (a: { x: number; y: number }, ai: { width: number; height: number }, b: { x: number; y: number }, bi: { width: number; height: number }) => a.x < b.x + bi.width && a.x + ai.width > b.x && a.y < b.y + bi.height && a.y + ai.height > b.y;

describe("every engine and algorithm", () => {
  for (const [engine, graph, algorithms] of CASES) {
    for (const algorithm of algorithms) {
      it(`${engine.id}/${algorithm}: places every node, with no overlap, deterministically`, () => {
        const first = place(engine, graph, algorithm);
        expect([...first.keys()].sort()).toEqual(graph.nodes.map((x) => x.id).sort());
        expect([...place(engine, graph, algorithm)]).toEqual([...first]);
        const size = new Map(graph.nodes.map((x) => [x.id, x]));
        const ids = [...first.keys()];
        for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) expect(overlap(first.get(ids[i])!, size.get(ids[i])!, first.get(ids[j])!, size.get(ids[j])!), `${ids[i]} / ${ids[j]}`).toBe(false);
      });

      it(`${engine.id}/${algorithm}: laying out its own result again moves nothing, and a user's node never moves`, () => {
        const placed = place(engine, graph, algorithm);
        const positions = new Map([...placed].map(([id, p], i) => [id, { ...p, source: i === 0 ? ("user" as const) : ("auto" as const) }]));
        const again = engine.layout(request(engine, graph, algorithm, { mode: "adjust", positions }));
        expect(again.moved).toEqual([]);
        // Move the user's node far away: the rest lays out around it and the user's node stays.
        const first = [...placed.keys()][0];
        positions.set(first, { x: 5000, y: 5000, source: "user" });
        const around = engine.layout(request(engine, graph, algorithm, { mode: "adjust", positions }));
        expect(around.positions.has(first)).toBe(false);
      });
    }
  }
});

describe("what each family promises", () => {
  it("mind map: the centre idea is in the middle and a branch's children are farther out than it, in the radial layout", () => {
    const p = place(mindMapEngine, tree, "radial");
    const centre = (id: string) => ({ x: p.get(id)!.x + 70, y: p.get(id)!.y + 30 });
    const r = (id: string) => Math.hypot(centre(id).x - centre("root").x, centre(id).y - centre("root").y);
    for (const [parent, child] of [["a", "a1"], ["a", "a2"], ["b", "b1"], ["c", "c3"]]) expect(r(child)).toBeGreaterThan(r(parent));
    expect(r("a")).toBeGreaterThan(0);
  });

  it("mind map: the tree layout has branches on both sides of the root", () => {
    const p = place(mindMapEngine, tree, "tree");
    const xs = ["a", "b", "c"].map((id) => p.get(id)!.x - p.get("root")!.x);
    expect(xs.some((x) => x > 0) && xs.some((x) => x < 0)).toBe(true);
  });

  it("mind map: says when topics are not connected to the centre", () => {
    const loose = { ...tree, nodes: [...tree.nodes, n("island")] };
    expect(mindMapEngine.validate(loose)[0]).toMatchObject({ code: "mind-map/not-a-tree" });
    expect(place(mindMapEngine, loose, "radial").has("island")).toBe(true);
  });

  it("UML: a supertype sits above its subtypes, in the inheritance layout and in each package", () => {
    for (const algorithm of ["inheritance", "package"]) {
      const p = place(umlEngine, uml, algorithm);
      for (const [child, parent] of [["Dog", "Animal"], ["Cat", "Animal"], ["Puppy", "Dog"]]) expect(p.get(parent)!.y, `${algorithm}: ${parent} above ${child}`).toBeLessThan(p.get(child)!.y);
    }
  });

  it("BPMN: horizontal runs left to right, vertical top to bottom, and a swimlane keeps a step in its lane", () => {
    const h = place(bpmnEngine, flow, "horizontal");
    expect(h.get("start")!.x).toBeLessThan(h.get("check")!.x);
    expect(h.get("check")!.x).toBeLessThan(h.get("end")!.x);
    const v = place(bpmnEngine, flow, "vertical");
    expect(v.get("start")!.y).toBeLessThan(v.get("end")!.y);
    const s = place(bpmnEngine, flow, "swimlane");
    // Lane 1 (start, check) sits entirely above lane 2 (approve, reject, end).
    expect(Math.max(s.get("start")!.y, s.get("check")!.y) + 60).toBeLessThanOrEqual(Math.min(s.get("approve")!.y, s.get("reject")!.y, s.get("end")!.y));
    expect(s.get("start")!.x).toBeLessThan(s.get("check")!.x);
  });

  it("ER: unrelated clusters are kept apart", () => {
    const p = place(erEngine, er, "clusters");
    const gap = Math.abs(p.get("x")!.x - p.get("student")!.x) + Math.abs(p.get("x")!.y - p.get("student")!.y);
    expect(gap).toBeGreaterThan(160);
  });

  it("sequence: participants run left to right in the order they first speak, and the closest-talkers layout keeps neighbours that talk", () => {
    const p = place(sequenceEngine, seq, "participants");
    const order = ["Client", "Server", "Cache", "DB"];
    for (let i = 1; i < order.length; i += 1) expect(p.get(order[i - 1])!.x).toBeLessThan(p.get(order[i])!.x);
    const c = place(sequenceEngine, seq, "closest");
    const ranked = [...c].sort((a, b) => a[1].x - b[1].x).map(([id]) => id);
    expect(Math.abs(ranked.indexOf("Client") - ranked.indexOf("Server"))).toBe(1);
    expect(Math.abs(ranked.indexOf("DB") - ranked.indexOf("Server"))).toBe(1);
  });

  it("sequence: a wide message label widens the gap between its two participants", () => {
    const wide = { ...seq, edges: [e("Client", "Server", { label: "a very long request description here" }), ...seq.edges.slice(1)] };
    const a = place(sequenceEngine, seq, "participants");
    const b = place(sequenceEngine, wide, "participants");
    expect(b.get("Server")!.x - b.get("Client")!.x).toBeGreaterThan(a.get("Server")!.x - a.get("Client")!.x);
  });
});
