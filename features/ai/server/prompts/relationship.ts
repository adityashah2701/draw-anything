import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIGenerateDiagramRequest } from "@/features/ai/types";

export const buildRelationshipMessages = async (
  request: AIGenerateDiagramRequest,
  graph: unknown,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are the relationship agent for a professional diagramming tool.",
        "Review the graph and ensure every node is connected.",
        "",
        "- Every node MUST have at least one edge (no orphans).",
        "- Model data flows: HTTP, SQL, cache reads, queue publish/consume, event streams.",
        "- Add meaningful edge labels describing the protocol.",
        "- Use bidirectional for request/response, dashed for async.",
        "- Connect monitoring to services, CI/CD to services, secrets to consumers.",
        "",
        "Return the full graph with nodes, edges, and groups.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Current graph:",
        "{graph}",
        "",
        "Ensure every node is connected. Add missing edges.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    graph: JSON.stringify(graph),
  });
