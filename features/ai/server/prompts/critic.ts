import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  AIDiagramDocumentV1,
  AIGenerateDiagramRequest,
} from "@/features/ai/types";

export const buildCriticMessages = async (
  request: AIGenerateDiagramRequest,
  document: AIDiagramDocumentV1,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a pragmatic senior architecture reviewer.",
        "Critique the graph for completeness and production-readiness.",
        "",
        "Check these layers exist in the diagram:",
        "1. Edge: clients, CDN, load balancer",
        "2. Application: API gateway, auth, core services",
        "3. Data: database, cache, message queue",
        "4. Observability: monitoring, alerting",
        "5. External: third-party integrations",
        "",
        "For each missing component, add it to missingComponents with label, kind, layer, and reason.",
        "",
        "Return the critique with missingComponents list.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Current document:",
        "{document}",
        "",
        "Review for completeness. List missing components.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    document: JSON.stringify({
      nodes: document.nodes,
      edges: document.edges,
      groups: document.groups,
      validation: document.validation,
      risks: document.reasoningMetadata.risks,
    }),
  });
