import { describe, expect, it } from "vitest";
import {
  MAX_GRAPH_EDGES,
  MAX_GRAPH_GROUPS,
  MAX_GRAPH_NODES,
  aiSemanticNodeKindSchema,
  normalizeModelGraphDraft,
  normalizeModelGraphDraftDetailed,
  normalizeModelPlan,
} from "@/features/ai/schemas";
import { NODE_KINDS } from "@/features/ai/server/prompts/constants";

const nodes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, kind: "service" }));

describe("normalizeModelGraphDraft – size limits clamp instead of failing", () => {
  it("accepts more nodes than the prompt asks for (26 used to throw)", () => {
    expect(normalizeModelGraphDraft({ nodes: nodes(26), edges: [] }).nodes).toHaveLength(26);
  });

  it("truncates beyond the cap and says so", () => {
    const { graph, warnings } = normalizeModelGraphDraftDetailed({
      nodes: nodes(MAX_GRAPH_NODES + 5),
      edges: [{ from: "n0", to: "n1" }],
    });
    expect(graph.nodes).toHaveLength(MAX_GRAPH_NODES);
    expect(warnings.join(" ")).toMatch(/dropped 5 node/i);
  });

  it("truncates edges and groups beyond their caps", () => {
    const edges = Array.from({ length: MAX_GRAPH_EDGES + 3 }, (_, i) => ({
      from: `n${i % 10}`,
      to: `n${(i + 1) % 10}`,
    }));
    const groups = Array.from({ length: MAX_GRAPH_GROUPS + 2 }, (_, i) => ({
      id: `g${i}`,
      label: `G${i}`,
      nodeIds: ["n0"],
    }));
    const graph = normalizeModelGraphDraft({ nodes: nodes(10), edges, groups });
    expect(graph.edges).toHaveLength(MAX_GRAPH_EDGES);
    expect(graph.groups).toHaveLength(MAX_GRAPH_GROUPS);
  });

  it("shortens over-long labels, descriptions and relationships", () => {
    const graph = normalizeModelGraphDraft({
      nodes: [{ id: "a", label: "x".repeat(300), description: "d".repeat(900) }, { id: "b", label: "B" }],
      edges: [{ from: "a", to: "b", label: "l".repeat(200), relationship: "r".repeat(500) }],
    });
    expect(graph.nodes[0].label.length).toBeLessThanOrEqual(80);
    expect(graph.nodes[0].description!.length).toBeLessThanOrEqual(240);
    expect(graph.edges[0].label!.length).toBeLessThanOrEqual(80);
    expect(graph.edges[0].relationship!.length).toBeLessThanOrEqual(120);
  });
});

describe("normalizeModelGraphDraft – tolerates common model output shapes", () => {
  it("treats null / junk optional fields as absent", () => {
    const graph = normalizeModelGraphDraft({
      nodes: [
        {
          id: "a",
          label: "A",
          kind: null,
          layer: "sideways",
          column: null,
          priority: null,
          description: null,
          parentId: null,
        },
        { id: "b", label: "B", column: 3.9, priority: 99 },
      ],
      edges: [],
    });
    expect(graph.nodes[0]).toMatchObject({ kind: "generic" });
    expect(graph.nodes[0].layer).toBeUndefined();
    expect(graph.nodes[0].column).toBeUndefined();
    expect(graph.nodes[1]).toMatchObject({ column: 3, priority: 10 });
  });

  it("accepts nodes given as plain strings", () => {
    const graph = normalizeModelGraphDraft({
      nodes: ["Client App", "API Gateway"],
      edges: [{ from: "client-app", to: "api-gateway" }],
    });
    expect(graph.nodes.map((n) => n.label)).toEqual(["Client App", "API Gateway"]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["client-app", "api-gateway"]);
  });

  it("accepts name/title for label and type for kind", () => {
    const graph = normalizeModelGraphDraft({
      nodes: [{ id: "a", name: "Auth", type: "authentication" }, { id: "b", title: "Store" }],
      edges: [],
    });
    expect(graph.nodes[0]).toMatchObject({ label: "Auth", kind: "authentication" });
    expect(graph.nodes[1].label).toBe("Store");
  });

  it("accepts source/target, start/end and 'A -> B' strings for edges", () => {
    const graph = normalizeModelGraphDraft({
      nodes: nodes(4),
      edges: [
        { source: "n0", target: "n1", label: "calls" },
        { start: "n1", end: "n2" },
        "n2 -> n3",
        "n3 → n0",
        { from: "n0" }, // unusable: dropped
        42, // unusable: dropped
      ],
    });
    expect(graph.edges.map((e) => [e.from, e.to])).toEqual([
      ["n0", "n1"],
      ["n1", "n2"],
      ["n2", "n3"],
      ["n3", "n0"],
    ]);
    expect(graph.edges[0].label).toBe("calls");
  });

  it("defaults missing groups and group members", () => {
    expect(normalizeModelGraphDraft({ nodes: nodes(2) }).groups).toEqual([]);
    const graph = normalizeModelGraphDraft({
      nodes: nodes(2),
      groups: [{ id: "g", label: "G" }, { label: "No id", nodeIds: ["n0", 7, null] }],
    });
    expect(graph.groups[0].nodeIds).toEqual([]);
    expect(graph.groups[1]).toMatchObject({ nodeIds: ["n0"], id: "no-id" });
  });

  it("normalizes kind aliases and casing", () => {
    const kinds = (list: string[]) =>
      normalizeModelGraphDraft({
        nodes: list.map((kind, i) => ({ id: `n${i}`, label: `N${i}`, kind })),
      }).nodes.map((n) => n.kind);
    expect(kinds(["auth", "Monitoring", "DB", "lb", "k8s", "Database", "message queue", "nonsense"])).toEqual([
      "authentication",
      "dashboard",
      "database",
      "load-balancer",
      "kubernetes",
      "database",
      "queue",
      "generic",
    ]);
  });
});

describe("normalizeModelGraphDraft – unusable output fails clearly", () => {
  it.each([
    ["no nodes key", {}],
    ["empty nodes", { nodes: [] }],
    ["nodes not an array", { nodes: "Client, API" }],
    ["only junk nodes", { nodes: [null, 3, {}, { label: "   " }] }],
    ["null", null],
  ])("throws a readable error for %s", (_name, value) => {
    expect(() => normalizeModelGraphDraft(value)).toThrow(/no usable nodes/i);
  });
});

describe("prompt vocabulary", () => {
  it("only offers node kinds the schema knows (auth/monitoring used to be silently 'generic')", () => {
    const valid = new Set<string>(aiSemanticNodeKindSchema.options);
    const offered = NODE_KINDS.split(", ");
    expect(offered.filter((kind) => !valid.has(kind))).toEqual([]);
  });
});

describe("normalizeModelPlan", () => {
  it("clamps an over-long summary instead of throwing", () => {
    const plan = normalizeModelPlan({ diagramType: "architecture", summary: "s".repeat(900) });
    expect(plan.summary.length).toBeLessThanOrEqual(300);
  });

  it("supplies a summary when the model omits it", () => {
    expect(normalizeModelPlan({ diagramType: "flowchart" }).summary.length).toBeGreaterThan(0);
  });

  it("slices over-long lists and ignores wrongly typed ones", () => {
    const plan = normalizeModelPlan({
      diagramType: "architecture",
      summary: "x",
      requirements: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, text: `req ${i}` })),
      actors: "not an array",
      systems: Array.from({ length: 30 }, (_, i) => `sys ${i}`),
      risks: [null, 4, "real risk"],
    });
    expect(plan.requirements.length).toBeLessThanOrEqual(12);
    expect(plan.actors).toEqual([]);
    expect(plan.systems.length).toBeLessThanOrEqual(8);
    expect(plan.risks).toEqual(["real risk"]);
  });

  it.each([
    ["Flowchart", "flowchart"],
    ["mind map", "mind-map"],
    ["Sequence Diagram", "sequence"],
    ["ERD", "entity-relationship"],
    ["entity relationship diagram", "entity-relationship"],
    ["something else", "architecture"],
    [undefined, "architecture"],
  ])("maps diagramType %j to %s", (input, expected) => {
    expect(normalizeModelPlan({ diagramType: input, summary: "x" }).diagramType).toBe(expected);
  });
});
