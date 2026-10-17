import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { createAIChatModel, createBaseChatModel } from "@/features/ai/server/model-providers";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import type { AIDiagramDocumentV1, AIModelProvider } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { runDiagramAgent } from "../agent-loop";
import { inferDiagramType } from "../prompt/prompt-context";
import { buildSystemPrompt, buildUserPrompt } from "../prompt/system";
import { createNativeTransport } from "../transports/native";
import { createTextTransport } from "../transports/text";
import type { ToolTransport } from "../types";
import { GOLDEN_PROMPTS } from "./golden-prompts";
import { renderEvalReport, scoreDiagram, type EvalRow } from "./score";

/**
 * Live evaluation against real providers: `npm run eval:ai`. It reads keys from .env.local (or the
 * environment), makes real API calls (cost!), and writes docs/superpowers/reports/ai-eval-<date>.md.
 *
 *   AI_EVAL_PROVIDERS=groq,gemini   (default groq)
 *   AI_EVAL_TRANSPORTS=native,text  (default both; gemini is always text)
 *   AI_EVAL_LEGACY=1                also run the legacy 12-agent workflow for comparison
 *   AI_EVAL_LIMIT=4                 only the first N golden prompts
 *   AI_EVAL_DELAY_MS=30000          pause between runs (free tiers allow only a few thousand tokens a minute;
 *                                   default 20000 for groq, 0 otherwise)
 */
// .env.local first (it wins), then .env: process.loadEnvFile never overrides a variable that is already set.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // the file may not exist; keys may already be in the environment
  }
}

const list = (name: string, fallback: string) => (process.env[name] ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const delayFor = (provider: string) => Number(process.env.AI_EVAL_DELAY_MS ?? (provider === "groq" ? 20_000 : 0));

const transportFor = (provider: AIModelProvider, kind: string): ToolTransport | null => {
  if (kind === "text" || provider === "gemini") return createTextTransport(createAIChatModel(provider));
  const base = createBaseChatModel(provider);
  return base ? createNativeTransport(base) : null;
};

describe.skipIf(process.env.AI_EVAL !== "1")("live AI diagram evaluation", () => {
  it(
    "runs the golden prompts and writes a report",
    async () => {
      const limit = Number(process.env.AI_EVAL_LIMIT) || GOLDEN_PROMPTS.length;
      const prompts = GOLDEN_PROMPTS.slice(0, limit);
      const rows: EvalRow[] = [];

      for (const provider of list("AI_EVAL_PROVIDERS", "groq") as AIModelProvider[]) {
        for (const kind of list("AI_EVAL_TRANSPORTS", "native,text")) {
          if (provider === "gemini" && kind === "native") continue;
          for (const golden of prompts) {
            const pipeline = `agent/${provider}/${kind}`;
            if (rows.length > 0) await pause(delayFor(provider));
            const t0 = Date.now();
            try {
              const transport = transportFor(provider, kind);
              if (!transport) continue;
              const result = await runDiagramAgent({
                transport,
                system: buildSystemPrompt(transport.kind, { diagramType: inferDiagramType(golden.prompt), prompt: golden.prompt }),
                user: buildUserPrompt(golden.prompt),
              });
              const { document } = documentFromParsedCode(parseDiagramCode(result.code), "eval", { prompt: golden.prompt, provider });
              const compiled = compileAIDiagramDetailed(document, "eval");
              rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, score: scoreDiagram(document, compiled.elements, golden) });
            } catch (error) {
              rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) });
            }
          }
        }
        if (process.env.AI_EVAL_LEGACY === "1") {
          for (const golden of prompts) {
            const pipeline = `legacy/${provider}`;
            const t0 = Date.now();
            try {
              let document: AIDiagramDocumentV1 | undefined;
              let elements: DrawingElement[] = [];
              for await (const event of streamAIDiagramWorkflowEvents({ request: { prompt: golden.prompt, provider } })) {
                if (event.type === "element.batch") elements = event.elements;
                if (event.type === "frame.done") document = event.graph;
              }
              if (!document) throw new Error("no frame.done");
              rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, score: scoreDiagram(document, elements, golden) });
            } catch (error) {
              rows.push({ pipeline, prompt: golden.id, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }

      const date = new Date().toISOString().slice(0, 10);
      const dir = "docs/superpowers/reports";
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/ai-eval-${date}.md`, renderEvalReport(rows, { date, note: `Prompts: ${prompts.length}. Providers: ${list("AI_EVAL_PROVIDERS", "groq").join(", ")}.` }));
      console.log(`Wrote ${dir}/ai-eval-${date}.md (${rows.length} runs)`);
    },
    60 * 60_000,
  );
});
