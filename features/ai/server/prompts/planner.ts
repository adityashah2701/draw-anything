import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIGenerateDiagramRequest } from "@/features/ai/types";
import { DIAGRAM_TYPES, contextSummary } from "./constants";

export const buildPlannerMessages = async (request: AIGenerateDiagramRequest) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a concise diagram planner.",
        "Decompose the user's request into a focused architecture plan.",
        "",
        "RULES:",
        "- Target EXACTLY 8-15 nodes. Be selective — only essential components.",
        "- Cover: client/user, API gateway, 2-4 core services, 1-2 data stores, auth.",
        "- For each component, assign a semantic node kind from the allowed list.",
        "- Include a 1-sentence summary and layout direction.",
        "",
        `Supported diagram types: ${DIAGRAM_TYPES}.`,
        "Return only structured data matching the requested schema.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "{prompt}",
        "",
        "Canvas: {canvasContext}",
        "",
        "Plan 8-15 nodes max. Be concise.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    canvasContext: contextSummary(request),
  });

export const buildArchitecturePlannerMessages = buildPlannerMessages;
