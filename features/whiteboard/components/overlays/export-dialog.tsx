"use client";

import { useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEFAULT_EXPORT_OPTIONS, type ExportFormat, type ExportOptions, type ExportScale } from "@/features/whiteboard/export/export-scene";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  isExporting: boolean;
  /** Resolves to null on success, else the message to show. */
  onExport: (options: ExportOptions) => Promise<string | null>;
  onCopy: (selectionOnly: boolean) => Promise<string | null>;
  onCancelExport: () => void;
}

const FORMAT_NOTES: Record<ExportFormat, string> = {
  png: "Image with a quality setting. Supports a transparent background.",
  svg: "Vector, scales to any size. Text uses the viewer's fonts; the file does not embed them.",
  pdf: "One page sized to the diagram. The picture is a high-quality image, so text is not selectable.",
};

// Remounted on every open (see below), so each visit starts from the same sensible defaults.
const ExportForm = ({ onClose, selectedCount, isExporting, onExport, onCopy, onCancelExport }: Omit<ExportDialogProps, "isOpen">) => {
  const hasSelection = selectedCount > 0;
  const [options, setOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS, selectionOnly: hasSelection });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ExportOptions>) => {
    setError(null);
    setOptions((current) => ({ ...current, ...patch }));
  };
  const pdf = options.format === "pdf";
  const svg = options.format === "svg";

  const finish = async (work: Promise<string | null>, closeOnSuccess: boolean) => {
    setError(null);
    const message = await work;
    if (message) setError(message);
    else if (closeOnSuccess) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export</DialogTitle>
        <DialogDescription>Exports always use the light theme and ignore your zoom and pan.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 py-2">
        <div className="grid gap-2">
          <Label id="export-format-label">Format</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="export-format-label"
            value={options.format}
            onValueChange={(value) => value && set({ format: value as ExportFormat })}
            className="justify-start"
          >
            <ToggleGroupItem value="png">PNG</ToggleGroupItem>
            <ToggleGroupItem value="svg">SVG</ToggleGroupItem>
            <ToggleGroupItem value="pdf">PDF</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{FORMAT_NOTES[options.format]}</p>
        </div>

        <div className="grid gap-2">
          <Label id="export-scale-label">Quality</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="export-scale-label"
            value={String(options.scale)}
            onValueChange={(value) => value && set({ scale: Number(value) as ExportScale })}
            disabled={svg}
            className="justify-start"
          >
            <ToggleGroupItem value="1">1×</ToggleGroupItem>
            <ToggleGroupItem value="2">2×</ToggleGroupItem>
            <ToggleGroupItem value="3">3×</ToggleGroupItem>
          </ToggleGroup>
          {svg && <p className="text-xs text-muted-foreground">SVG is vector, so quality does not apply.</p>}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <Label htmlFor="export-transparent">Transparent background</Label>
            {pdf && <p className="text-xs text-muted-foreground">PDF pages are always white.</p>}
          </div>
          <Switch
            id="export-transparent"
            checked={options.transparent && !pdf}
            disabled={pdf}
            onCheckedChange={(checked) => set({ transparent: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <Label htmlFor="export-selection">Selected shapes only</Label>
            <p className="text-xs text-muted-foreground">
              {hasSelection
                ? `${selectedCount} selected, plus the connectors between them.`
                : "Select shapes on the canvas first."}
            </p>
          </div>
          <Switch
            id="export-selection"
            checked={options.selectionOnly && hasSelection}
            disabled={!hasSelection}
            onCheckedChange={(checked) => set({ selectionOnly: checked })}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={isExporting}
          onClick={() => finish(onCopy(options.selectionOnly && hasSelection), false)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy as image
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => (isExporting ? onCancelExport() : onClose())}>
            {isExporting ? "Stop" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={isExporting}
            onClick={() => finish(onExport({ ...options, selectionOnly: options.selectionOnly && hasSelection }), true)}
          >
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export {options.format.toUpperCase()}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
};

export const ExportDialog = ({ isOpen, onClose, ...form }: ExportDialogProps) => (
  <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-md">{isOpen && <ExportForm onClose={onClose} {...form} />}</DialogContent>
  </Dialog>
);
