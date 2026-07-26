import {
  modelPlanSchema,
  normalizeModelPlan,
  AIPlanOutput,
} from "@/features/ai/schemas";
import { getAIModelProviderConfig } from "@/features/ai/server/model-providers";
import { buildArchitecturePlannerMessages } from "@/features/ai/server/prompts";
import { extractRequirementsFromPrompt } from "@/features/ai/server/validation";
import { callStructured, checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const architecturePlannerAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  const frame = { ...state.frame, currentPhase: "architecturePlanner" as const };
  logAIPhase(frame.frameId, "architecturePlanner", "Planning architecture");
  const providerConfig = getAIModelProviderConfig(frame.provider);
  const messages = await buildArchitecturePlannerMessages(state.request);
  const rawPlan = await callStructured<Record<string, unknown>>(
    runtime.model,
    modelPlanSchema,
    "ai_architecture_plan",
    messages,
  );
  const plan: AIPlanOutput = normalizeModelPlan(rawPlan);
  const requirements =
    plan.requirements.length > 0 ? plan.requirements : extractRequirementsFromPrompt(state.request.prompt);
  return {
    frame,
    plan,
    requirements,
    actors: plan.actors,
    systems: plan.systems,
    nonFunctionalRequirements: plan.nonFunctionalRequirements,
    risks: plan.risks,
    events: [
      phaseStarted(frame.frameId, "architecturePlanner", "Extracting requirements and architecture plan"),
      {
        type: "requirements.extracted",
        frameId: frame.frameId,
        requirements,
        actors: plan.actors,
        systems: plan.systems,
      },
      phaseCompleted(frame.frameId, "architecturePlanner", `${providerConfig.displayName} planned ${plan.diagramType}`),
    ],
    checkpoints: [checkpoint("architecturePlanner", plan.summary)],
  };
};
