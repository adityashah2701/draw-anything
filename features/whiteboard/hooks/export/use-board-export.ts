import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { copyPngToClipboard, downloadBlob, exportFilename } from "@/features/whiteboard/export/deliver";
import { ExportError } from "@/features/whiteboard/export/errors";
import { exportScene, type ExportOptions } from "@/features/whiteboard/export/export-scene";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface Source {
  elements: DrawingElement[];
  selectedIds: string[];
  title?: string;
}

const messageOf = (error: unknown) =>
  error instanceof ExportError ? error.message : "Something went wrong while exporting. Your board was not changed.";

/**
 * Export and copy-as-image for the editor. Reads the board at the moment of the call, never writes to
 * it, runs one export at a time, and turns every failure into a message instead of an unhandled error.
 * Each call resolves to null on success or the message to show.
 */
export const useBoardExport = (source: Source) => {
  const latest = useRef(source);
  latest.current = source;
  const running = useRef<AbortController | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => () => running.current?.abort(), []);

  const run = useCallback(async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<{ value?: T; error?: string }> => {
    if (running.current) return { error: "An export is already running." };
    const controller = new AbortController();
    running.current = controller;
    setIsExporting(true);
    try {
      return { value: await work(controller.signal) };
    } catch (error) {
      if (error instanceof ExportError && error.code === "cancelled") return { error: error.message };
      console.error("[export]", error);
      return { error: messageOf(error) };
    } finally {
      running.current = null;
      setIsExporting(false);
    }
  }, []);

  const exportFile = useCallback(
    async (options: ExportOptions): Promise<string | null> => {
      const { value, error } = await run((signal) => {
        const { elements, selectedIds, title } = latest.current;
        return exportScene({ elements, selectedIds, options, title, signal }).then((result) => ({ result, title }));
      });
      if (!value) return error ?? "Export failed.";
      downloadBlob(value.result.blob, exportFilename(value.title, value.result.extension));
      toast.success(`Exported ${options.format.toUpperCase()} (${value.result.width}×${value.result.height})`);
      return null;
    },
    [run],
  );

  const copyImage = useCallback(
    async (selectionOnly: boolean): Promise<string | null> => {
      const { error } = await run((signal) => {
        const { elements, selectedIds } = latest.current;
        const png = exportScene({
          elements,
          selectedIds,
          options: { format: "png", scale: 2, transparent: false, selectionOnly },
          signal,
        }).then((r) => r.blob);
        return copyPngToClipboard(png);
      });
      if (error) return error;
      toast.success(selectionOnly ? "Copied selection as image" : "Copied board as image");
      return null;
    },
    [run],
  );

  const cancel = useCallback(() => running.current?.abort(), []);

  return { isExporting, exportFile, copyImage, cancel };
};
