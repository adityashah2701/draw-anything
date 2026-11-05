"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listLayoutEngines } from "@/core/layout/registry";
import type { LayoutMode } from "@/core/layout/types";
import { ensureLayoutEngines, type EngineLayoutInput, type EngineLayoutPlan, type LayoutPreview } from "@/features/whiteboard/commands/layout-engine";

const MODES: Array<{ id: LayoutMode; label: string; description: string }> = [
  { id: "preserve", label: "Keep every position", description: "Nothing that exists moves. A new element is put in a free place beside what it connects to." },
  { id: "adjust", label: "Adjust auto-placed elements", description: "Only elements a layout placed can move. Anything you placed by hand, and anything locked, stays exactly where it is." },
  { id: "overwrite", label: "Re-layout everything", description: "Also moves elements you placed by hand. Locked elements still never move. Asks first." },
];

interface LayoutPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: (input: EngineLayoutInput) => EngineLayoutPlan;
  apply: (plan: EngineLayoutPlan) => boolean;
  onPreview: (preview: LayoutPreview | null) => void;
  disabled?: boolean;
}

/**
 * The Layout panel: choose an engine and a mode, see what it would do (drawn over the board, nothing written),
 * and apply it as one undo step. Overwriting what a person placed needs an explicit tick.
 */
export function LayoutPanel({ open, onOpenChange, plan, apply, onPreview, disabled }: LayoutPanelProps) {
  const [engine, setEngine] = useState<string>("auto");
  const [algorithm, setAlgorithm] = useState<string>("");
  const [mode, setMode] = useState<LayoutMode>("adjust");
  const [remember, setRemember] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const engines = useMemo(() => {
    ensureLayoutEngines();
    return listLayoutEngines();
  }, []);

  useEffect(() => {
    if (open) {
      setEngine("auto");
      setAlgorithm("");
      setMode("adjust");
      setRemember(false);
      setConfirmed(false);
    }
  }, [open]);

  // The plan is recomputed against the board as it is whenever a choice changes while the panel is open.
  const current = useMemo(
    () => (open ? plan({ mode, engine: engine === "auto" ? undefined : engine, algorithm: algorithm || undefined, remember, confirm: confirmed }) : null),
    [open, plan, mode, engine, algorithm, remember, confirmed],
  );

  useEffect(() => {
    onPreview(open && current ? current.preview : null);
  }, [open, current, onPreview]);

  const preview = current?.preview;
  const canApply = !disabled && !!current?.patch && (!preview?.needsConfirmation);
  const overwriteNeedsTick = mode === "overwrite" && (preview?.userPlacedMoved ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-5 sm:max-w-[480px]" showCloseButton={false}>
        <DialogTitle className="text-sm font-semibold">Layout</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Choose what a layout may move. The result is shown on the board first; nothing changes until you apply it.
        </DialogDescription>

        <label className="grid gap-1 text-xs">
          <span className="font-medium">Engine</span>
          <select value={engine} onChange={(e) => { setEngine(e.target.value); setAlgorithm(""); }} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Layout engine">
            <option value="auto">This diagram's own{preview && engine === "auto" ? ` (${preview.engine})` : ""}</option>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        {engine !== "auto" && (engines.find((e) => e.id === engine)?.algorithms.length ?? 0) > 1 && (
          <label className="grid gap-1 text-xs">
            <span className="font-medium">Algorithm</span>
            <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Layout algorithm">
              <option value="">Default</option>
              {engines.find((e) => e.id === engine)!.algorithms.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="grid gap-2" aria-label="What may move">
          {MODES.map((m) => (
            <label key={m.id} className={`flex cursor-pointer gap-2 rounded-md border p-2.5 text-xs ${mode === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
              <input type="radio" name="layout-mode" value={m.id} checked={mode === m.id} onChange={() => { setMode(m.id); setConfirmed(false); }} className="mt-0.5" />
              <span>
                <span className="block font-medium">{m.label}</span>
                <span className="text-muted-foreground">{m.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div role="status" aria-live="polite" className="rounded-md bg-muted/50 p-3 text-xs">
          {!preview ? null : preview.moves.length === 0 ? (
            <p>Nothing would move{preview.stats.heldFixed > 0 ? `; ${preview.stats.heldFixed} element${preview.stats.heldFixed === 1 ? "" : "s"} held in place` : ""}.</p>
          ) : (
            <p>
              {preview.moves.length} element{preview.moves.length === 1 ? "" : "s"} would move (largest {Math.round(preview.stats.maxDisplacement)} units); {preview.stats.heldFixed} held in place
              {preview.stats.overlaps > 0 ? `; ${preview.stats.overlaps} overlap${preview.stats.overlaps === 1 ? "" : "s"} left` : ""}.
            </p>
          )}
          {preview?.unplaced.length ? <p className="mt-1 text-amber-600">{preview.unplaced.length} could not be placed.</p> : null}
          {preview?.warnings.map((w) => (
            <p key={w} className="mt-1 text-muted-foreground">{w}</p>
          ))}
        </div>

        {overwriteNeedsTick && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span>
              Move the {preview!.userPlacedMoved} element{preview!.userPlacedMoved === 1 ? "" : "s"} I placed by hand.
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember this engine for the diagram</span>
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              if (current && apply(current)) onOpenChange(false);
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
