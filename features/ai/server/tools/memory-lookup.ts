import { AIGenerateDiagramRequest, AIMemoryContext } from "@/features/ai/types";
import { readCanvasContext, summarizeCanvasContext } from "@/features/ai/server/tools/canvas-reader";

export const lookupMemoryContext = async (
  request: AIGenerateDiagramRequest,
): Promise<AIMemoryContext> => {
  const canvasSummary = summarizeCanvasContext(readCanvasContext(request));
  return {
    memories: [],
    canvasSummary,
    fallbackUsed: true,
  };
};

export const extractSemanticTags = (prompt: string) =>
  Array.from(
    new Set(
      prompt
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter((token) => token.length > 3)
        .slice(0, 12),
    ),
  );
