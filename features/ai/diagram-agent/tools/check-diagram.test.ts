import { describe, expect, it } from "vitest";
import { AUTH_FLOW_CODE } from "@/features/ai/server/layout/fixtures/auth-flow";
import { checkDiagram } from "./check-diagram";
import { lintDiagram } from "./lint";
import { parseDiagramCode } from "@/features/diagram-code/parse";

const lintRules = (code: string, metrics?: Parameters<typeof lintDiagram>[1]) =>
  lintDiagram(parseDiagramCode(code), metrics).map((f) => f.rule);

describe("checkDiagram", () => {
  it("reports parse errors with line numbers and does not compile", () => {
    const r = checkDiagram(`A [kind: db\nB`);
    expect(r.ok).toBe(false);
    expect(r.metrics).toBeUndefined();
    expect(r.text).toMatch(/ERRORS/);
    expect(r.text).toMatch(/line \d+/);
  });

  it("measures a valid diagram and says so compactly", () => {
    const r = checkDiagram(AUTH_FLOW_CODE);
    expect(r.ok).toBe(true);
    expect(r.metrics!.nodes).toBeGreaterThan(5);
    expect(r.metrics!.longestEdge).toBeGreaterThan(0);
    expect(r.text.length).toBeLessThanOrEqual(1500);
    expect(r.text).toMatch(/Layout: \d+ nodes/);
  });

  it("is ok for a clean small diagram and tells the model to finish", () => {
    const r = checkDiagram(`type architecture\nClient [icon: browser] > API [icon: api] > DB [icon: postgres]`);
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/finish/);
  });

  it("empty and junk input are not ok but never throw", () => {
    for (const code of ["", "   ", "}}}", "\u0000\u0001", "x".repeat(50_000)]) {
      expect(() => checkDiagram(code)).not.toThrow();
    }
    expect(checkDiagram("").ok).toBe(false);
  });

  it("bounds its input and output however large the diagram", () => {
    const big = Array.from({ length: 3000 }, (_, i) => `N${i} > N${i + 1}`).join("\n");
    const t0 = performance.now();
    const r = checkDiagram(big);
    expect(r.text.length).toBeLessThanOrEqual(1500);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("lintDiagram rules", () => {
  it("flags orphans and duplicate labels", () => {
    expect(lintRules(`A > B\nLonely`)).toContain("orphan-node");
    expect(lintRules(`A [label: "Svc"] > B [label: "Svc"]`)).toContain("duplicate-label");
  });

  it("asks for groups only when there are many nodes and none", () => {
    const many = Array.from({ length: 9 }, (_, i) => `N${i} > N${i + 1}`).join("\n");
    expect(lintRules(many)).toContain("no-groups");
    expect(lintRules(`A > B > C`)).not.toContain("no-groups");
    expect(lintRules(`G {\n${many}\n}`)).not.toContain("no-groups");
  });

  it("flags generic nodes but not ones with a vendor word or kind", () => {
    expect(lintRules(`A > B > C > D`)).toContain("generic-icons");
    expect(lintRules(`A [icon: postgres] > B [kind: api] > C [icon: kafka] > D [icon: redis]`)).not.toContain("generic-icons");
  });

  it("warns when shape: icon has no icon to draw, and not when it has one or its kind does", () => {
    expect(lintRules(`A [shape: icon] > B [icon: postgres, shape: icon]`)).toContain("icon-shape-needs-icon");
    expect(lintRules(`A [icon: server, shape: icon] > B [kind: database, shape: icon]`)).not.toContain("icon-shape-needs-icon");
  });

  it("flags label-heavy diagrams and wide fan-out, not sparse labels", () => {
    expect(lintRules(`A > B: x\nB > C: y\nC > D: z\nD > E: w\nE > F: v`)).toContain("label-heavy");
    expect(lintRules(`A > B: x\nB > C\nC > D\nD > E\nE > F`)).not.toContain("label-heavy");
    expect(lintRules(`Hub > A, B, C, D, E, F`)).toContain("wide-fan-out");
  });

  it("uses layout metrics for crossings, long edges and collisions", () => {
    const m = { edgeCrossings: 12, longestEdge: 1500, labelsColliding: 2, groupsDropped: 1 };
    expect(lintRules(`A > B > C\nA > C`, m)).toEqual(expect.arrayContaining(["crossings", "long-edge", "label-collisions", "group-dropped"]));
    expect(lintRules(`A > B > C`, { edgeCrossings: 0, longestEdge: 200, labelsColliding: 0, groupsDropped: 0 })).not.toContain("crossings");
  });

  it("empty diagram gets one clear instruction", () => {
    expect(lintRules("")).toEqual(["empty"]);
  });
});

describe("search_icons with several terms", () => {
  it("answers every comma-separated term in one call", async () => {
    const { runTool } = await import("./index");
    const out = runTool({ name: "search_icons", arg: "kafka, postgres\nredis; kafka" }).content;
    expect(out).toContain('Icons for "kafka"');
    expect(out).toContain('Icons for "postgres"');
    expect(out).toContain('Icons for "redis"');
    expect(out.match(/Icons for "kafka"/g)).toHaveLength(1); // duplicates are asked once
    expect(out).toContain("message-broker");
  });

  it("keeps a single term as before, and caps the number of terms", async () => {
    const { runTool } = await import("./index");
    expect(runTool({ name: "search_icons", arg: "kafka" }).content.split("\n").length).toBeGreaterThanOrEqual(2);
    const many = Array.from({ length: 30 }, (_, i) => `term${i}`).join(",");
    expect((runTool({ name: "search_icons", arg: many }).content.match(/term\d+/g) ?? []).length).toBeLessThanOrEqual(10);
  });
});
