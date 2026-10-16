import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const isConnector = (e: DrawingElement) => e.type === "arrow" || e.type === "arrow-bidirectional";

type Connected = DrawingElement & {
  startConnection?: { elementId?: string };
  endConnection?: { elementId?: string };
};

/**
 * What a selection-only export contains, in board (z) order:
 *  1. every selected element;
 *  2. every connector whose two attached ends are both selected (the diagram between the picked nodes);
 *  3. the label of each included connector.
 * A connector with only one selected end is left out unless it is selected itself: exporting it would
 * draw a line to nothing. Group frames are included only when selected.
 */
export const elementsForSelectionExport = (elements: DrawingElement[], selectedIds: Iterable<string>): DrawingElement[] => {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return [];
  const included = new Set<string>();
  for (const e of elements) {
    if (selected.has(e.id)) included.add(e.id);
    else if (isConnector(e)) {
      const { startConnection, endConnection } = e as Connected;
      if (startConnection?.elementId && endConnection?.elementId && selected.has(startConnection.elementId) && selected.has(endConnection.elementId)) {
        included.add(e.id);
      }
    }
  }
  const labelledBy = new Set(elements.filter((e) => included.has(e.id) && isConnector(e)).map((e) => `${e.ai?.semanticId ?? e.id}-label`));
  return elements.filter((e) => included.has(e.id) || (e.ai?.role === "edge-label" && !!e.ai.semanticId && labelledBy.has(e.ai.semanticId)));
};
