import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import type { AIGenerateDiagramRequest, AIStreamEvent } from "@/features/ai/types";
import { streamDiagramAgentEvents } from "./run";
import { streamDiagramBuilderEvents } from "./run-builder";

export type PipelineName = "legacy" | "agent" | "builder";
export type Pipeline = (request: AIGenerateDiagramRequest) => AsyncIterable<AIStreamEvent>;

/**
 * AI_PIPELINE=agent selects the one-shot diagram agent and AI_PIPELINE=builder the step-by-step builder
 * that draws while it works and polishes what it drew; anything else (including unset) keeps the legacy
 * multi-agent workflow until the evaluation says otherwise.
 */
export const resolvePipelineName = (env: Record<string, string | undefined> = process.env): PipelineName => {
  const name = env.AI_PIPELINE?.trim().toLowerCase();
  return name === "agent" || name === "builder" ? name : "legacy";
};

export const selectPipeline = (env: Record<string, string | undefined> = process.env): Pipeline => {
  switch (resolvePipelineName(env)) {
    case "builder":
      return (request) => streamDiagramBuilderEvents({ request });
    case "agent":
      return (request) => streamDiagramAgentEvents({ request });
    default:
      return (request) => streamAIDiagramWorkflowEvents({ request });
  }
};
