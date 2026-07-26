import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIGenerateDiagramRequest } from "@/features/ai/types";
import { NODE_KINDS } from "./constants";

export const buildExpansionMessages = async (
  request: AIGenerateDiagramRequest,
  plan: unknown,
  currentGraph: unknown,
  missingComponents: Array<{ label: string; kind: string; layer: string; reason: string }>,
  expansionRound: number,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        `Architecture expansion (round ${expansionRound}).`,
        "Add these missing components to the existing graph:",
        ...missingComponents.map(
          (c, i) => `${i + 1}. ${c.label} (kind: ${c.kind}, layer: ${c.layer})`,
        ),
        "",
        "RULES:",
        "- ADD each missing component as a new node.",
        "- CONNECT each new node to relevant existing nodes.",
        "- Do NOT remove any existing nodes or edges.",
        "- Use stable lowercase hyphenated ids for new nodes.",
        `- Allowed node kinds: ${NODE_KINDS}.`,
        "",
        "Return the COMPLETE graph: existing + new nodes, existing + new edges, all groups.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Current graph:",
        "{currentGraph}",
        "",
        "Add the missing components listed above. Return complete graph.",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    plan: JSON.stringify(plan),
    currentGraph: JSON.stringify(currentGraph),
  });
