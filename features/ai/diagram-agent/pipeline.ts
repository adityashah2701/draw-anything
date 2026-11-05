import type { AIGenerateDiagramRequest, AIStreamEvent } from "@/features/ai/types";
import { streamDiagramAgentEvents } from "./run";
import { streamDiagramBuilderEvents } from "./run-builder";

export type PipelineName = "agent" | "builder";
export type Pipeline = (request: AIGenerateDiagramRequest) => AsyncIterable<AIStreamEvent>;

/**
 * AI_PIPELINE=builder selects the step-by-step builder that draws while it works and polishes what it
 * drew; anything else (including unset) is the one-shot diagram agent.
 */
export const resolvePipelineName = (env: Record<string, string | undefined> = process.env): PipelineName =>
  env.AI_PIPELINE?.trim().toLowerCase() === "builder" ? "builder" : "agent";

export const selectPipeline = (env: Record<string, string | undefined> = process.env): Pipeline =>
  resolvePipelineName(env) === "builder"
    ? (request) => streamDiagramBuilderEvents({ request })
    : (request) => streamDiagramAgentEvents({ request });
