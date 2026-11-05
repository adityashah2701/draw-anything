import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { EXAMPLES } from "../prompt/examples";
import { renderEvalReport, scoreDiagram, type EvalRow } from "./score";

/**
 * Deterministic baseline: the diagrams that live in the repository (the layout fixtures and the
 * prompt's worked examples) compiled by the current engine and scored. No model is called, so the numbers
 * only move when the compiler, router or metrics change. A real-agent baseline needs `npm run eval:ai`
 * (live provider calls); `AI_EVAL_SAVE=1` keeps each run's diagram code under eval/fixtures for replay.
 *
 * `WRITE_BASELINE=1 npx vitest run features/ai/diagram-agent/eval/baseline.test.ts` writes the report.
 */
const rows = (): EvalRow[] => {
  const out: EvalRow[] = [];
  for (const [name, document] of Object.entries(LAYOUT_FIXTURES)) {
    const compiled = compileAIDiagramDetailed(document, "baseline");
    out.push({ pipeline: "fixture/layout", prompt: name, ms: 0, score: scoreDiagram(document, compiled.elements) });
  }
  EXAMPLES.forEach((example, index) => {
    const { document } = documentFromParsedCode(parseDiagramCode(example.code), "baseline");
    const compiled = compileAIDiagramDetailed(document, "baseline");
    out.push({ pipeline: "fixture/example", prompt: `example-${index + 1}`, ms: 0, score: scoreDiagram(document, compiled.elements) });
  });
  return out;
};

describe("offline baseline", () => {
  it("scores every repository diagram with finite numbers, and the same numbers twice", () => {
    const first = rows();
    expect(first.length).toBe(Object.keys(LAYOUT_FIXTURES).length + EXAMPLES.length);
    for (const row of first) {
      const a = row.score!.aesthetics;
      expect(Number.isFinite(a.alignment) && Number.isFinite(a.centroidOffset) && Number.isFinite(a.readingConsistency)).toBe(true);
      expect(row.score!.genericShare).toBeGreaterThanOrEqual(0);
    }
    expect(rows().map((r) => r.score)).toEqual(first.map((r) => r.score));
  });

  it.runIf(process.env.WRITE_BASELINE === "1")("writes the baseline report", () => {
    const date = new Date().toISOString().slice(0, 10);
    const dir = "docs/superpowers/reports";
    mkdirSync(dir, { recursive: true });
    const note = "Offline baseline: repository fixtures and prompt examples compiled by the current engine (no model calls). Run `npm run eval:ai` for a real-agent baseline.";
    writeFileSync(`${dir}/ai-baseline-${date}.md`, renderEvalReport(rows(), { date, note }));
  });
});
