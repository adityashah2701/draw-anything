import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { AIDiagramDocumentV1 } from "@/features/ai/types";

const document: AIDiagramDocumentV1 = {
  schemaVersion: "ai-diagram-v1",
  diagramType: "architecture",
  intent: {
    prompt: "API with database",
    summary: "API stores data in a database",
  },
  nodes: [
    {
      id: "api",
      label: "API",
      kind: "api",
      layer: "application",
      column: 0,
    },
    {
      id: "database",
      label: "Database",
      kind: "database",
      layer: "data",
      column: 0,
    },
  ],
  edges: [{ id: "stores", from: "api", to: "database" }],
  groups: [],
  requirements: [
    {
      id: "api-with-database",
      text: "API with database",
      priority: "must",
      source: "prompt",
    },
  ],
  architecture: [
    {
      id: "api",
      label: "API",
      responsibility: "Serve requests",
      kind: "api",
    },
    {
      id: "database",
      label: "Database",
      responsibility: "Store data",
      kind: "database",
    },
  ],
  containers: [],
  annotations: [],
  trustBoundaries: [],
  communicationProtocols: [
    {
      id: "stores",
      from: "api",
      to: "database",
      protocol: "SQL",
      pattern: "sync",
    },
  ],
  visualImportance: [
    { nodeId: "api", score: 8 },
    { nodeId: "database", score: 6 },
  ],
  layoutHints: { strategy: "layered", direction: "top-to-bottom" },
  styleHints: { theme: "technical", density: "balanced" },
  validation: {
    valid: true,
    repaired: false,
    issues: [],
    metrics: {
      nodeCount: 2,
      edgeCount: 1,
      groupCount: 0,
      disconnectedComponents: 1,
      duplicateIds: 0,
      invalidEdges: 0,
      overlapCount: 0,
      orphanNodes: 0,
      oversizedRows: 0,
      poorSpacing: 0,
    },
  },
  metadata: {
    generationId: "gen-test",
    createdAt: "2026-07-26T00:00:00.000Z",
    provider: "gemini",
    model: "test-model",
    improvementPasses: 0,
  },
  reasoningMetadata: {
    requirementsSummary: "API with database",
    architectureSummary: "API stores data in a database",
    risks: [],
    criticNotes: [],
    toolResults: [],
  },
};

describe("AI canvas compiler", () => {
  it("compiles semantic nodes and routed arrows", () => {
    const elements = compileAIDiagramToCanvas(document, "frame-test");

    expect(elements).toHaveLength(3);
    expect(elements.filter((element) => element.type === "semantic-node")).toHaveLength(2);
    expect(elements.find((element) => element.type === "arrow")).toMatchObject({
      startConnection: { elementId: "gen-test-api" },
      endConnection: { elementId: "gen-test-database" },
    });
    expect(elements.every((element) => element.points.length >= 2)).toBe(true);
  });

  // ── layout quality ──────────────────────────────────────────────────────

  const withGraph = (
    nodes: Array<{ id: string; label: string; layer?: AIDiagramDocumentV1["nodes"][number]["layer"] }>,
    edges: Array<{ from: string; to: string; label?: string }>,
    groups: AIDiagramDocumentV1["groups"] = [],
  ): AIDiagramDocumentV1 => ({
    ...document,
    nodes: nodes.map((n) => ({ kind: "service" as const, layer: "application" as const, ...n })),
    edges: edges.map((e, i) => ({ id: `e${i}`, ...e })),
    groups,
  });
  const nodeEls = (els: ReturnType<typeof compileAIDiagramToCanvas>) =>
    els.filter((e) => e.type === "semantic-node");
  const box = (e: { points: Array<{ x: number; y: number }> }) => ({
    minX: Math.min(...e.points.map((p) => p.x)),
    maxX: Math.max(...e.points.map((p) => p.x)),
    minY: Math.min(...e.points.map((p) => p.y)),
    maxY: Math.max(...e.points.map((p) => p.y)),
  });

  it("orders rows so connected nodes do not cross (labels sort the opposite way)", () => {
    // Alphabetical rows put a,b,c above x,y,z, but the edges pair a-z, b-y, c-x.
    const doc = withGraph(
      [
        { id: "a", label: "A", layer: "edge" }, { id: "b", label: "B", layer: "edge" }, { id: "c", label: "C", layer: "edge" },
        { id: "x", label: "X", layer: "data" }, { id: "y", label: "Y", layer: "data" }, { id: "z", label: "Z", layer: "data" },
      ],
      [{ from: "a", to: "z" }, { from: "b", to: "y" }, { from: "c", to: "x" }],
    );
    const els = nodeEls(compileAIDiagramToCanvas(doc, "f"));
    const cx = (label: string) => {
      const b = box(els.find((e) => e.label === label)!);
      return (b.minX + b.maxX) / 2;
    };
    // A is left of B left of C  <=>  Z is left of Y left of X (no crossing)
    expect(Math.sign(cx("A") - cx("B"))).toBe(Math.sign(cx("Z") - cx("Y")));
    expect(Math.sign(cx("B") - cx("C"))).toBe(Math.sign(cx("Y") - cx("X")));
  });

  it("never overlaps nodes, for a dense generated graph", () => {
    const nodes = Array.from({ length: 24 }, (_, i) => ({
      id: `n${i}`,
      label: `Service ${i}`,
      layer: (["edge", "application", "data", "observability"] as const)[i % 4],
    }));
    const edges = Array.from({ length: 40 }, (_, i) => ({ from: `n${i % 24}`, to: `n${(i * 5 + 1) % 24}` }))
      .filter((e) => e.from !== e.to);
    const els = nodeEls(compileAIDiagramToCanvas(withGraph(nodes, edges), "f")).map(box);
    for (let i = 0; i < els.length; i += 1) {
      for (let j = i + 1; j < els.length; j += 1) {
        const a = els[i];
        const b = els[j];
        const separated = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
        expect(separated).toBe(true);
      }
    }
  });

  it("keeps ids unique", () => {
    const els = compileAIDiagramToCanvas(
      withGraph([{ id: "a", label: "A" }, { id: "b", label: "B" }], [{ from: "a", to: "b", label: "x" }], []),
      "f",
    );
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
  });

  // ── groups ──────────────────────────────────────────────────────────────

  const frames = (els: ReturnType<typeof compileAIDiagramToCanvas>) =>
    els.filter((e) => e.type === "rectangle" && e.ai?.role === "group");

  it("draws a labelled frame behind each group, around exactly its members", () => {
    const doc = withGraph(
      [
        { id: "web", label: "Web" }, { id: "api", label: "API" }, { id: "db", label: "DB", layer: "data" },
        { id: "other", label: "Other", layer: "external" },
      ],
      [{ from: "web", to: "api" }, { from: "api", to: "db" }, { from: "api", to: "other" }],
      [{ id: "backend", label: "Backend", nodeIds: ["web", "api"] }],
    );
    const els = compileAIDiagramToCanvas(doc, "f");
    const [frame] = frames(els);
    expect(frame).toBeDefined();
    expect(frame.fill).toBeUndefined();
    expect((frame as { isGuide?: boolean }).isGuide).toBe(true);

    const f = box(frame);
    const nodes = nodeEls(els);
    const inside = (e: (typeof nodes)[number]) => {
      const b = box(e);
      return b.minX >= f.minX && b.maxX <= f.maxX && b.minY >= f.minY && b.maxY <= f.maxY;
    };
    expect(nodes.filter(inside).map((n) => n.label).sort()).toEqual(["API", "Web"]);

    const title = els.find((e) => e.type === "text" && e.ai?.role === "group-label");
    expect(title).toMatchObject({ text: "Backend" });
    // frames are drawn before (under) the nodes they contain
    expect(els.indexOf(frame)).toBeLessThan(els.findIndex((e) => e.type === "semantic-node"));
  });

  it("nests frames: the outer frame contains the inner one", () => {
    const doc = withGraph(
      [
        { id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" },
      ],
      [{ from: "a", to: "b" }, { from: "b", to: "c" }],
      [
        { id: "outer", label: "Outer", nodeIds: ["a", "b", "c"] },
        { id: "inner", label: "Inner", nodeIds: ["a", "b"] },
      ],
    );
    const found = frames(compileAIDiagramToCanvas(doc, "f")).map(box);
    expect(found).toHaveLength(2);
    const [outer, inner] = found[0].maxX - found[0].minX >= found[1].maxX - found[1].minX ? found : [found[1], found[0]];
    expect(outer.minX).toBeLessThan(inner.minX);
    expect(outer.maxX).toBeGreaterThan(inner.maxX);
    expect(outer.minY).toBeLessThan(inner.minY);
    expect(outer.maxY).toBeGreaterThan(inner.maxY);
  });

  it("omits a frame that would swallow a node that is not in the group", () => {
    // top and bottom are in the group; mid sits between them in the same column.
    const doc = withGraph(
      [
        { id: "top", label: "Top", layer: "edge" },
        { id: "mid", label: "Mid", layer: "application" },
        { id: "bottom", label: "Bottom", layer: "data" },
      ],
      [{ from: "top", to: "mid" }, { from: "mid", to: "bottom" }],
      [{ id: "g", label: "G", nodeIds: ["top", "bottom"] }],
    );
    expect(frames(compileAIDiagramToCanvas(doc, "f"))).toHaveLength(0);
  });

  it("ignores groups with fewer than two known members", () => {
    const doc = withGraph(
      [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      [{ from: "a", to: "b" }],
      [
        { id: "solo", label: "Solo", nodeIds: ["a"] },
        { id: "ghost", label: "Ghost", nodeIds: ["a", "nope"] },
      ],
    );
    expect(frames(compileAIDiagramToCanvas(doc, "f"))).toHaveLength(0);
  });

  // ── edge labels ─────────────────────────────────────────────────────────

  it("labels a connector next to its path, above the arrow, and not as a routing obstacle", () => {
    const doc = withGraph(
      [{ id: "a", label: "A", layer: "edge" }, { id: "b", label: "B", layer: "data" }],
      [{ from: "a", to: "b", label: "HTTPS" }, { from: "b", to: "a" }],
    );
    const els = compileAIDiagramToCanvas(doc, "f");
    const labels = els.filter((e) => e.type === "text" && e.ai?.role === "edge-label");
    expect(labels).toHaveLength(1); // the unlabeled edge gets none
    const [label] = labels;
    expect(label).toMatchObject({ text: "HTTPS" });
    expect((label as { isGuide?: boolean }).isGuide).toBe(true);

    const arrow = els.find((e) => e.type === "arrow" && e.ai?.semanticId?.endsWith("e0"))!;
    const near = arrow.points.some(
      (p) => Math.hypot(p.x - label.points[0].x, p.y - label.points[0].y) < 160,
    );
    expect(near).toBe(true);
    expect(els.indexOf(label)).toBeGreaterThan(els.indexOf(arrow));
  });
});

