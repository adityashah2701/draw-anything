import { AIDiagramNode, AILayoutStrategy } from "@/features/ai/types";

export const chooseDeterministicLayout = (
  nodes: AIDiagramNode[],
): {
  strategy: AILayoutStrategy;
  direction: "left-to-right" | "top-to-bottom" | "radial";
} => {
  const hasLayeredArchitecture = nodes.some((node) => node.layer === "data" || node.layer === "edge");
  const hasDecision = nodes.some((node) => node.kind === "decision");
  if (hasLayeredArchitecture) return { strategy: "layered", direction: "top-to-bottom" };
  if (hasDecision) return { strategy: "dag", direction: "top-to-bottom" };
  return { strategy: "hierarchical", direction: "top-to-bottom" };
};

export const assignStableColumns = (nodes: AIDiagramNode[]) => {
  const byLayer = new Map<string, number>();
  return nodes.map((node) => {
    if (typeof node.column === "number") return node;
    const key = node.layer ?? "application";
    const column = byLayer.get(key) ?? 0;
    byLayer.set(key, column + 1);
    return { ...node, column };
  });
};
