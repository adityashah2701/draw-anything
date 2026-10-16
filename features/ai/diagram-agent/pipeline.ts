import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import type { AIGenerateDiagramRequest, AIStreamEvent } from "@/features/ai/types";
import { streamDiagramAgentEvents } from "./run";

export type PipelineName = "legacy" | "agent";
export type Pipeline = (request: AIGenerateDiagramRequest) => AsyncIterable<AIStreamEvent>;

/**
 * AI_PIPELINE=agent selects the diagram agent; anything else (including unset) keeps the legacy
 * multi-agent workflow until the evaluation says otherwise.
 */
export const resolvePipelineName = (env: Record<string, string | undefined> = process.env): PipelineName =>
  env.AI_PIPELINE?.trim().toLowerCase() === "agent" ? "agent" : "legacy";

export const selectPipeline = (env: Record<string, string | undefined> = process.env): Pipeline =>
  resolvePipelineName(env) === "agent"
    ? (request) => streamDiagramAgentEvents({ request })
    : (request) => streamAIDiagramWorkflowEvents({ request });
