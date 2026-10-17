import { loadIconLibrary, needsIconLibrary } from "@/core/icons/registry";
import { createEstimateContext } from "@/core/text/estimate";
import { drawScene } from "@/features/whiteboard/export/scene";
import { asCanvasContext, SvgContext, type TextMeasurer } from "@/features/whiteboard/export/svg-context";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const PADDING = 24;
/** Longest side of the picture a vision model is given: enough to judge layout, small enough to keep tokens down. */
const MAX_SIDE = 768;

/**
 * The canvas as the editor's own renderer draws it (the export path), in light mode on white, measured
 * with the text estimator because there is no browser here. Null when nothing is visible.
 */
export const renderCanvasSvg = async (elements: DrawingElement[]): Promise<{ svg: string; width: number; height: number } | null> => {
  if (elements.length === 0) return null;
  if (needsIconLibrary(elements)) await loadIconLibrary();
  const context = new SvgContext(createEstimateContext() as unknown as TextMeasurer);
  await drawScene(asCanvasContext(context), elements, { zoom: 1, panOffset: { x: 0, y: 0 } });
  const ink = context.inkBounds();
  if (!ink) return null;
  const minX = Math.floor(ink.minX - PADDING);
  const minY = Math.floor(ink.minY - PADDING);
  const width = Math.ceil(ink.maxX + PADDING) - minX;
  const height = Math.ceil(ink.maxY + PADDING) - minY;
  const { defs, body } = context.markup();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">` +
    `${defs ? `<defs>${defs}</defs>` : ""}<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width, height };
};

/** A PNG data URL of the canvas for a vision model, or undefined when it cannot be rendered (the agent then works from text). */
export const renderCanvasPng = async (elements: DrawingElement[], maxSide = MAX_SIDE): Promise<string | undefined> => {
  try {
    const drawing = await renderCanvasSvg(elements);
    if (!drawing) return undefined;
    const sharp = (await import("sharp")).default;
    const scale = Math.min(1, maxSide / Math.max(drawing.width, drawing.height));
    const png = await sharp(Buffer.from(drawing.svg), { density: 96 * Math.max(scale, 0.5) })
      .resize({ width: Math.max(1, Math.round(drawing.width * scale)), height: Math.max(1, Math.round(drawing.height * scale)), fit: "inside" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.warn("[diagramBuilder] could not render the canvas picture:", error instanceof Error ? error.message : error);
    return undefined;
  }
};
