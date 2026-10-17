import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { supportsVision, createToolTransport } from "../transports/create";
import { runDiagramBuilder } from "../builder/loop";
import { BUILDER_TOOL_SPECS, buildBuilderSystemPrompt } from "../builder/prompt";
import { inferDiagramType } from "../prompt/prompt-context";
import type { AIModelProvider } from "@/features/ai/types";
import { GOLDEN_PROMPTS } from "./golden-prompts";
import { renderEvalReport, scoreDiagram, type EvalRow } from "./score";

/**
 * Live evaluation of the step-by-step builder: `AI_EVAL=1 npx vitest run --config vitest.eval.config.ts builder`.
 * Real provider calls (cost, and slow on free tiers: every step is a model call).
 *
 *   AI_EVAL_PROVIDERS=groq     AI_EVAL_LIMIT=1     AI_EVAL_DELAY_MS=20000
 *   AI_VISION=1                also shows the model a picture of the canvas on review steps
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // keys may already be in the environment
  }
}

const list = (name: string, fallback: string) => (process.env[name] ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(process.env.AI_EVAL !== "1")("live builder evaluation", () => {
  it(
    "builds the golden prompts step by step and writes a report",
    async () => {
      const prompts = GOLDEN_PROMPTS.slice(0, Number(process.env.AI_EVAL_LIMIT) || 1);
      const vision = /^(1|true|on)$/i.test(process.env.AI_VISION ?? "");
      const rows: EvalRow[] = [];
      const notes: string[] = [];

      for (const provider of list("AI_EVAL_PROVIDERS", "groq") as AIModelProvider[]) {
        for (const golden of prompts) {
          if (rows.length > 0) await pause(Number(process.env.AI_EVAL_DELAY_MS ?? (provider === "groq" ? 20_000 : 0)));
          const useVision = vision && supportsVision(provider);
          const pipeline = `builder/${provider}${useVision ? "+vision" : ""}`;
          const t0 = Date.now();
          try {
            const transport = createToolTransport(provider, undefined, process.env, { tools: BUILDER_TOOL_SPECS, vision: useVision });
            const firstProblems: string[][] = [];
            const result = await runDiagramBuilder({
              transport,
              system: buildBuilderSystemPrompt(transport.kind, { diagramType: inferDiagramType(golden.prompt), prompt: golden.prompt, vision: useVision }),
              goal: golden.prompt,
              generationId: "eval",
              frameId: "eval",
              renderImage: useVision ? async (els) => (await import("../builder/render-png")).renderCanvasPng(els) : undefined,
              onNote: (note) => {
                if (note.kind === "review") firstProblems.push(note.problems);
              },
            });
            rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, score: scoreDiagram(result.built.document, result.built.elements, golden) });
            notes.push(
              `- ${pipeline} / ${golden.id}: ${result.turns} turns, ${result.reviews} review(s), finished=${result.finished}, tools=${result.toolTrail.join(",")}; problems when first asked to finish: ${firstProblems[0]?.length ?? 0}`,
            );
          } catch (error) {
            rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      const date = new Date().toISOString().slice(0, 10);
      const dir = "docs/superpowers/reports";
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/ai-builder-eval-${date}.md`, renderEvalReport(rows, { date, note: `Builder agent.\n\n${notes.join("\n")}` }));
      console.log(`Wrote ${dir}/ai-builder-eval-${date}.md (${rows.length} runs)\n${notes.join("\n")}`);
    },
    60 * 60_000,
  );
});
