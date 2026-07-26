import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  AIDiagramDocumentV1,
  AIGenerateDiagramRequest,
} from "@/features/ai/types";

export const buildImprovementMessages = async (
  request: AIGenerateDiagramRequest,
  document: AIDiagramDocumentV1,
  missingComponents?: Array<{ label: string; kind: string; layer: string; reason: string }>,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are the improvement agent.",
        "Improve the diagram for clarity, completeness, and production-readiness.",
        "",
        missingComponents && missingComponents.length > 0
          ? [
              "Add these missing components:",
              ...missingComponents.map(
                (c, i) => `${i + 1}. ${c.label} (kind: ${c.kind}, layer: ${c.layer})`,
              ),
              "Connect each to relevant existing nodes.",
              "",
            ].join("\n")
          : "",
        "",
        "- Ensure every node has at least one edge.",
        "- Improve vague labels to be specific.",
        "- Add meaningful edge labels.",
        "- Do not add visual coordinates.",
        "- Keep edge references valid.",
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
        "Validation report:",
        "{validation}",
        "",
        "Current graph:",
        "{graph}",
        "",
        "Improve the diagram. Add missing components if listed above.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    validation: JSON.stringify(document.validation),
    graph: JSON.stringify({
      nodes: document.nodes,
      edges: document.edges,
      groups: document.groups,
    }),
  });
