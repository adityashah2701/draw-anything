import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIGenerateDiagramRequest } from "@/features/ai/types";
import { NODE_KINDS } from "./constants";

export const buildDomainModelMessages = async (
  request: AIGenerateDiagramRequest,
  plan: unknown,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a diagram graph builder.",
        "Create a semantic graph from the plan. Do not emit coordinates.",
        "",
        `Node kinds: ${NODE_KINDS}.`,
        "- Generate EXACTLY 8-15 nodes. Be concise, no redundancy.",
        "- Labels: 1-4 words max. Every node needs a specific kind.",
        "- Every node must have at least one edge (no orphans).",
        "- Group related nodes if there are 3+ in a logical unit.",
        "",
        "Return nodes, edges, and groups only.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "Request: {prompt}",
        "",
        "Plan: {plan}",
        "",
        "Build 8-15 node graph from this plan.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    plan: JSON.stringify(plan),
  });

export const buildGraphDraftMessages = async (
  request: AIGenerateDiagramRequest,
  plan: {
    diagramType: string;
    summary: string;
    layoutStrategy: string;
    direction: string;
  },
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a diagram graph builder.",
        "Create a semantic graph. Do not emit coordinates.",
        "",
        `Node kinds: ${NODE_KINDS}.`,
        "- Generate 8-15 nodes max. Be concise.",
        "- Concise labels (1-4 words) with specific kinds.",
        "- Every node must have at least one edge.",
        "- Use groups for deployment boundaries.",
        "- Use stable lowercase hyphenated ids.",
        "Return structured data matching the requested schema.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "Request: {prompt}",
        "",
        "Plan: {plan}",
        "",
        "Build 8-15 node graph.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    plan: JSON.stringify(plan),
  });
