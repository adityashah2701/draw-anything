import { AIGenerateDiagramRequest } from "@/features/ai/types";
import { readCanvasContext } from "@/features/ai/server/tools/canvas-reader";
import { lookupMemoryContext } from "@/features/ai/server/tools/memory-lookup";
import { readShapeRegistry } from "@/features/ai/server/tools/shape-registry-reader";

export const retrieveAIContext = async (request: AIGenerateDiagramRequest) => {
  const canvas = readCanvasContext(request);
  const memory = await lookupMemoryContext(request);
  const registry = readShapeRegistry();

  return {
    canvas,
    memory,
    registry,
  };
};
