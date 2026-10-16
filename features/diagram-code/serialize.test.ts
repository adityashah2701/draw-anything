import { describe, expect, it } from "vitest";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode, type SerializableGraph } from "./serialize";

/** What a graph means, independent of ids and ordering. */
const meaning = (g: {
  nodes: Array<{ id: string; label: string; kind?: string }>;
  edges: Array<{ from: string; to: string; label?: string; dashed?: boolean; bidirectional?: boolean }>;
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
}) => {
  const label = new Map(g.nodes.map((n) => [n.id, n.label]));
  return {
    nodes: g.nodes.map((n) => `${n.label}:${n.kind && n.kind !== "generic" ? n.kind : ""}`).sort(),
    edges: g.edges
      .map((e) => `${label.get(e.from)}>${label.get(e.to)}|${e.label ?? ""}|${e.dashed ? "d" : ""}${e.bidirectional ? "b" : ""}`)
      .sort(),
    groups: g.groups
      .map((grp) => `${grp.label}=[${grp.nodeIds.map((id) => label.get(id)).sort().join(",")}]`)
      .sort(),
  };
};
const roundTrip = (graph: SerializableGraph) => {
  const parsed = parseDiagramCode(serializeDiagramCode(graph));
  return { parsed, text: serializeDiagramCode(graph) };
};

const sample: SerializableGraph = {
  diagramType: "architecture",
  title: "Shop",
  nodes: [
    { id: "web", label: "Web App", kind: "browser" },
    { id: "api", label: "API", kind: "api" },
    { id: "orders", label: "Orders", kind: "service" },
    { id: "db", label: "Orders DB", kind: "database" },
    { id: "plain", label: "Notes" },
  ],
  edges: [
    { from: "web", to: "api", label: "HTTPS" },
    { from: "api", to: "orders" },
    { from: "orders", to: "db", label: "SQL", dashed: true },
    { from: "orders", to: "api", bidirectional: true },
  ],
  groups: [
    { id: "backend", label: "Backend", nodeIds: ["api", "orders", "db"] },
    { id: "data", label: "Data", nodeIds: ["orders", "db"] },
  ],
};

describe("serializeDiagramCode", () => {
  it("round-trips nodes, kinds, edges, labels, flags and nested groups", () => {
    const { parsed } = roundTrip(sample);
    expect(parsed.issues).toEqual([]);
    expect(parsed).toMatchObject({ title: "Shop", diagramType: "architecture" });
    expect(meaning(parsed)).toEqual(meaning(sample));
  });

  it("is stable: serialising the parsed result gives the same text", () => {
    const first = serializeDiagramCode(sample);
    const parsed = parseDiagramCode(first);
    const again = serializeDiagramCode({
      diagramType: parsed.diagramType,
      title: parsed.title,
      nodes: parsed.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges: parsed.edges,
      groups: parsed.groups,
    });
    expect(again).toBe(first);
  });

  it("writes readable code", () => {
    const text = serializeDiagramCode(sample);
    expect(text).toContain("type architecture");
    expect(text).toMatch(/Backend \{[\s\S]*Data \{[\s\S]*\}[\s\S]*\}/);
    expect(text).toContain("Web App > API: HTTPS");
    expect(text).toContain("Orders --> Orders DB: SQL");
    expect(text).toContain("Orders <> API");
  });

  it("keeps duplicate labels distinct without changing what is shown", () => {
    const graph: SerializableGraph = {
      nodes: [{ id: "a", label: "Cache" }, { id: "b", label: "Cache" }],
      edges: [{ from: "a", to: "b" }],
      groups: [],
    };
    const { parsed } = roundTrip(graph);
    expect(parsed.nodes.map((n) => n.label)).toEqual(["Cache", "Cache"]);
    expect(new Set(parsed.nodes.map((n) => n.name)).size).toBe(2);
    expect(parsed.edges).toHaveLength(1);
  });

  it.each([
    "a, b", "x [y]", "{braces}", "A > B", "see: this", "C#", "#hashtag", "// not a comment",
    "title Service", "type checker", "direction finder", "  padded  ", "Ünïcode ✓",
  ])("survives the awkward name %j", (label) => {
    const graph: SerializableGraph = {
      nodes: [{ id: "n1", label }, { id: "n2", label: "Other" }],
      edges: [{ from: "n1", to: "n2", label: "x" }],
      groups: [],
    };
    const { parsed } = roundTrip(graph);
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(parsed.nodes.map((n) => n.label)).toContain(label.trim());
    expect(parsed.edges).toHaveLength(1);
  });

  it("writes a graph with no groups, no edges, or no nodes", () => {
    expect(serializeDiagramCode({ nodes: [], edges: [], groups: [] }).trim()).toBe("");
    const onlyNodes = roundTrip({ nodes: [{ id: "a", label: "A" }], edges: [], groups: [] });
    expect(onlyNodes.parsed.nodes).toHaveLength(1);
  });

  it("ignores edges and group members that point at unknown nodes", () => {
    const { parsed } = roundTrip({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [{ from: "a", to: "ghost" }, { from: "a", to: "b" }],
      groups: [{ id: "g", label: "G", nodeIds: ["a", "b", "ghost"] }],
    });
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.groups[0].nodeIds).toHaveLength(2);
  });
});

describe("serializing lines, shapes and colours", () => {
  it("round-trips plain lines, edge colours, node shape and colour", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A", shape: "diamond" as const, color: "#2563eb" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b", plain: true },
        { from: "b", to: "c", plain: true, dashed: true, label: "link", color: "#16a34a" },
        { from: "a", to: "c", color: "#dc2626" },
      ],
      groups: [],
    };
    const parsed = parseDiagramCode(serializeDiagramCode(graph));
    expect(parsed.issues).toEqual([]);
    expect(parsed.nodes[0]).toMatchObject({ shape: "diamond", color: "#2563eb" });
    expect(parsed.edges).toMatchObject([
      { plain: true },
      { plain: true, dashed: true, label: "link", color: "#16a34a" },
      { color: "#dc2626", label: undefined },
    ]);
  });

  it("quotes names that contain a standalone - so they stay one node", () => {
    const code = serializeDiagramCode({ nodes: [{ id: "a", label: "Auth - Login" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }], groups: [] });
    expect(parseDiagramCode(code).nodes.map((n) => n.name)).toEqual(["Auth - Login", "B"]);
  });
});
