import {
  AIDiagramEdge,
  AIDiagramGroup,
  AIDiagramNode,
} from "@/features/ai/types";
import { buildValidationReport } from "@/features/ai/server/validation";

export const validateGraph = (
  nodes: AIDiagramNode[],
  edges: AIDiagramEdge[],
  groups: AIDiagramGroup[],
) => buildValidationReport(nodes, edges, groups, 0, 0);
