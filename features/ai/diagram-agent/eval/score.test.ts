import { describe, expect, it } from "vitest";
import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { EXAMPLES } from "../prompt/examples";
import { GOLDEN_PROMPTS } from "./golden-prompts";
import { renderEvalReport, scoreDiagram } from "./score";

const scoreCode = (code: string, golden = GOLDEN_PROMPTS[1]) => {
  const { document } = documentFromParsedCode(parseDiagramCode(code), "g");
  return scoreDiagram(document, compileAIDiagramDetailed(document, "f").elements, golden);
};

describe("golden prompts", () => {
  it("are unique, with sane ranges", () => {
    expect(new Set(GOLDEN_PROMPTS.map((g) => g.id)).size).toBe(GOLDEN_PROMPTS.length);
    for (const g of GOLDEN_PROMPTS) {
      expect(g.nodes[0]).toBeLessThan(g.nodes[1]);
      expect(g.mentions.length).toBeGreaterThan(0);
      expect(g.prompt.length).toBeGreaterThan(20);
    }
  });
});

describe("scoreDiagram", () => {
  it("scores the teaching examples as clean, well-iconed diagrams", () => {
    const s = scoreCode(EXAMPLES[1].code, GOLDEN_PROMPTS.find((g) => g.id === "web-backend")!);
    expect(s).toMatchObject({ clean: true, orphans: 0, groupsDropped: 0, inRange: true });
    expect(s.iconCoverage).toBeGreaterThan(0.8);
    expect(s.mentionCoverage).toBe(1);
  });

  it("penalises generic, orphaned, out-of-range output", () => {
    const s = scoreCode(`A > B\nLonely`, GOLDEN_PROMPTS.find((g) => g.id === "web-backend")!);
    expect(s.orphans).toBe(1);
    expect(s.iconCoverage).toBe(0);
    expect(s.inRange).toBe(false);
    expect(s.mentionCoverage).toBe(0);
  });

  it("scores any pipeline's output from document + elements (legacy fixtures too)", () => {
    const doc = LAYOUT_FIXTURES.architecture;
    const s = scoreDiagram(doc, compileAIDiagramDetailed(doc, "f").elements);
    expect(s.nodes).toBe(doc.nodes.length);
    expect(s.mentionCoverage).toBe(1);
  });
});

describe("renderEvalReport", () => {
  it("renders a summary row per pipeline and a row per run, including failures", () => {
    const score = scoreCode(EXAMPLES[0].code);
    const md = renderEvalReport(
      [
        { pipeline: "agent/native", prompt: "ci-cd", ms: 1200, score },
        { pipeline: "agent/native", prompt: "oauth", ms: 800, error: "boom | pipe" },
        { pipeline: "legacy", prompt: "ci-cd", ms: 9000, score },
      ],
      { date: "2026-10-16" },
    );
    expect(md).toContain("# AI diagram evaluation (2026-10-16)");
    expect(md).toMatch(/\| agent\/native \| 2 \| 1 \|/);
    expect(md).toMatch(/\| legacy \| 1 \| 0 \|/);
    expect(md).toContain("boom / pipe");
  });
});
