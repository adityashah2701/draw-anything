import { AIGenerateDiagramRequest } from "@/features/ai/types";

type CanvasViewport = NonNullable<AIGenerateDiagramRequest["canvasContext"]>["viewport"];

export interface CanvasSummary {
  elementCount: number;
  selectedCount: number;
  selectedElementIds: string[];
  elementTypes: Record<string, number>;
  viewport?: CanvasViewport;
}

export const readCanvasContext = (
  request: AIGenerateDiagramRequest,
): CanvasSummary => {
  const elements = request.canvasContext?.elements ?? [];
  const elementTypes: Record<string, number> = {};
  elements.forEach((element) => {
    elementTypes[element.type] = (elementTypes[element.type] ?? 0) + 1;
  });

  return {
    elementCount: elements.length,
    selectedCount: request.canvasContext?.selectedElementIds?.length ?? 0,
    selectedElementIds: request.canvasContext?.selectedElementIds ?? [],
    elementTypes,
    viewport: request.canvasContext?.viewport,
  };
};

export const summarizeCanvasContext = (summary: CanvasSummary) =>
  [
    `Canvas has ${summary.elementCount} elements.`,
    `${summary.selectedCount} elements are selected.`,
    Object.keys(summary.elementTypes).length > 0
      ? `Element types: ${Object.entries(summary.elementTypes)
          .map(([type, count]) => `${type}:${count}`)
          .join(", ")}.`
      : "No existing element types.",
  ].join(" ");
