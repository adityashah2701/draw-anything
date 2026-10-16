import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ExportError } from "./errors";
import { buildPdf, deflate } from "./pdf";
import { drawScene } from "./scene";
import { elementsForSelectionExport } from "./selection-policy";
import { asCanvasContext, escapeXml, SvgContext } from "./svg-context";

export type ExportFormat = "png" | "svg" | "pdf";
export type ExportScale = 1 | 2 | 3;

export interface ExportOptions {
  format: ExportFormat;
  /** Pixel density for PNG and for the raster inside a PDF. SVG is vector and ignores it. */
  scale: ExportScale;
  /** PNG and SVG only. PDF pages are opaque; the page is white. */
  transparent: boolean;
  selectionOnly: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { format: "png", scale: 2, transparent: false, selectionOnly: false };

export interface ExportResult {
  blob: Blob;
  /** Size of the image in CSS pixels at scale 1 (the SVG viewBox size). */
  width: number;
  height: number;
  extension: string;
}

/** Empty margin around the drawn content, in board units. */
export const EXPORT_PADDING = 24;
export const EXPORT_BACKGROUND = "#ffffff";
/** A PDF holds the pixels three times over (RGBA, RGB, compressed), so its pixel limit is lower. */
export const EXPORT_LIMITS = { maxSide: 16_384, maxPixels: 64_000_000, maxPdfPixels: 24_000_000, maxSvgChars: 50_000_000 };
/** PDF user-space units per CSS pixel (72 / 96). */
const PT_PER_PX = 0.75;
const PDF_MAX_PT = 14_400;

const MIME = { png: "image/png", svg: "image/svg+xml;charset=utf-8", pdf: "application/pdf" } as const;

export interface ExportInput {
  elements: DrawingElement[];
  selectedIds: string[];
  options: ExportOptions;
  title?: string;
  signal?: AbortSignal;
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new ExportError("render-failed", "The browser could not create a drawing surface for the export.");
  return { canvas, ctx };
};

export const pickElements = (elements: DrawingElement[], selectedIds: string[], selectionOnly: boolean): DrawingElement[] => {
  if (selectionOnly) {
    const picked = elementsForSelectionExport(elements, selectedIds);
    if (picked.length === 0) throw new ExportError("no-selection", "Select at least one shape to export a selection.");
    return picked;
  }
  if (elements.length === 0) throw new ExportError("nothing-to-export", "The board is empty, so there is nothing to export.");
  return elements;
};

const assertRasterSize = (width: number, height: number, format: ExportFormat) => {
  const { maxSide } = EXPORT_LIMITS;
  const maxPixels = format === "pdf" ? EXPORT_LIMITS.maxPdfPixels : EXPORT_LIMITS.maxPixels;
  if (width > maxSide || height > maxSide || width * height > maxPixels) {
    throw new ExportError(
      "too-large",
      `This export would be ${width}×${height} pixels; the limit is ${maxSide} per side and ${maxPixels / 1_000_000} megapixels in total. Lower the scale or export a selection.`,
    );
  }
};

const blobOf = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ExportError("render-failed", "The browser could not encode the image."))), "image/png"),
  );

/**
 * Draw the chosen elements with the editor's own renderer, measure the ink, and encode it.
 * The size never depends on the editor's zoom or pan, and nothing here touches the board.
 */
export const exportScene = async ({ elements, selectedIds, options, title, signal }: ExportInput): Promise<ExportResult> => {
  const scene = pickElements(elements, selectedIds, options.selectionOnly);
  try {
    // Pass 1: record SVG and measure the ink at scale 1 (the geometry every format shares).
    const measurer = createCanvas(1, 1);
    const svg = new SvgContext(measurer.ctx);
    await drawScene(asCanvasContext(svg), scene, { zoom: 1, panOffset: { x: 0, y: 0 } }, signal);
    measurer.canvas.width = 0;
    const ink = svg.inkBounds();
    if (!ink) throw new ExportError("nothing-to-export", "Nothing visible was found to export.");
    const minX = Math.floor(ink.minX - EXPORT_PADDING);
    const minY = Math.floor(ink.minY - EXPORT_PADDING);
    const width = Math.ceil(ink.maxX + EXPORT_PADDING) - minX;
    const height = Math.ceil(ink.maxY + EXPORT_PADDING) - minY;

    if (options.format === "svg") {
      const { defs, body } = svg.markup();
      const background = options.transparent ? "" : `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${EXPORT_BACKGROUND}"/>`;
      const heading = title ? `<title>${escapeXml(title)}</title>` : "";
      const text =
        `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">` +
        `${heading}${defs ? `<defs>${defs}</defs>` : ""}${background}${body}</svg>\n`;
      if (text.length > EXPORT_LIMITS.maxSvgChars) {
        throw new ExportError("too-large", "This diagram is too large to export as SVG. Export a selection instead.");
      }
      return { blob: new Blob([text], { type: MIME.svg }), width, height, extension: "svg" };
    }

    // Pass 2: the same renderer onto a canvas at the requested density.
    const scale = options.scale;
    const pixelWidth = Math.ceil(width * scale);
    const pixelHeight = Math.ceil(height * scale);
    assertRasterSize(pixelWidth, pixelHeight, options.format);
    const { canvas, ctx } = createCanvas(pixelWidth, pixelHeight);
    try {
      const opaque = options.format === "pdf" || !options.transparent;
      if (opaque) {
        ctx.fillStyle = EXPORT_BACKGROUND;
        ctx.fillRect(0, 0, pixelWidth, pixelHeight);
      }
      await drawScene(ctx, scene, { zoom: scale, panOffset: { x: -minX * scale, y: -minY * scale } }, signal);

      if (options.format === "png") return { blob: await blobOf(canvas), width, height, extension: "png" };

      const rgba = ctx.getImageData(0, 0, pixelWidth, pixelHeight).data;
      const rgb = new Uint8Array(pixelWidth * pixelHeight * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
      }
      const fit = Math.min(1, PDF_MAX_PT / (Math.max(width, height) * PT_PER_PX));
      const pdf = buildPdf({
        pageWidth: width * PT_PER_PX * fit,
        pageHeight: height * PT_PER_PX * fit,
        imageWidth: pixelWidth,
        imageHeight: pixelHeight,
        flateRgb: await deflate(rgb),
      });
      return { blob: new Blob([pdf as BlobPart], { type: MIME.pdf }), width, height, extension: "pdf" };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (error) {
    if (error instanceof ExportError) throw error;
    if (signal?.aborted) throw new ExportError("cancelled", "The export was cancelled.");
    throw new ExportError("render-failed", `The ${options.format.toUpperCase()} export failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
};
