import { drawElement } from "@/features/whiteboard/utils/canvas-render-utils";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import { withRenderTheme } from "@/core/theme/render-theme";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const getElementBounds = (element: DrawingElement) => getShapeBounds(element);

/** Let the browser paint and handle input between batches of drawing. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Draw elements with the same function the editor uses, in light mode and with no editor state
 * (no selection, hover, handles or guides). Yields to the browser about every 12 ms so a big
 * board does not freeze the page.
 */
export const drawScene = async (
  ctx: CanvasRenderingContext2D,
  elements: DrawingElement[],
  view: { zoom: number; panOffset: { x: number; y: number } },
  signal?: AbortSignal,
) => {
  let sliceStart = Date.now();
  for (const element of elements) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Export cancelled", "AbortError");
    withRenderTheme(false, () => drawElement(ctx, element, false, { ...view, getElementBounds }));
    if (Date.now() - sliceStart > 12) {
      await nextTask();
      sliceStart = Date.now();
    }
  }
};
