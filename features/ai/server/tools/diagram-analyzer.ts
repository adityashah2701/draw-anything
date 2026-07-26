import { AIDiagramDocumentV1 } from "@/features/ai/types";
import { analyzeGraph } from "@/features/ai/server/tools/graph-analyzer";
import { detectPotentialCollisions } from "@/features/ai/server/tools/collision-detector";

export const analyzeDiagram = (document: AIDiagramDocumentV1) => ({
  graph: analyzeGraph(document.nodes, document.edges),
  collisions: detectPotentialCollisions(document),
  validation: document.validation,
});
