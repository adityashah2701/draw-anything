import { useEffect, useRef, useState } from "react";
import { Magnet } from "lucide-react";
import { NumberField } from "@/features/whiteboard/components/properties/number-field";
import { MAX_TOLERANCE_PX, MIN_TOLERANCE_PX, type SnapSettings } from "@/features/whiteboard/utils/snap-settings";

interface SnapSettingsMenuProps {
  settings: SnapSettings;
  onChange: (next: Partial<SnapSettings>) => void;
}

const Check = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="flex cursor-pointer items-start gap-2 py-1 text-xs">
    <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-sky-500" />
    <span className="flex-1">
      <span className="block text-foreground">{label}</span>
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </span>
  </label>
);

/**
 * The snapping popover in the toolbar: a master switch, the tolerance in screen pixels (so it feels the
 * same at every zoom), equal-spacing snapping and the live distance labels. Closes on Escape or a click
 * elsewhere. Holding Alt while dragging suspends snapping whatever is set here.
 */
export const SnapSettingsMenu = ({ settings, onChange }: SnapSettingsMenuProps) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Snapping"
        aria-expanded={open}
        aria-pressed={settings.enabled}
        title={settings.enabled ? "Snapping and guides (on)" : "Snapping and guides (off)"}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          settings.enabled ? "bg-primary/15 text-primary hover:bg-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Magnet size={16} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Snapping settings"
          className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-foreground shadow-popover"
        >
          <Check label="Snap to other shapes" checked={settings.enabled} onChange={(enabled) => onChange({ enabled })} hint="Edges, centres and text baselines. Hold Alt to drag freely." />
          <div className="my-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-foreground">Tolerance</span>
            <NumberField
              label="Snap tolerance"
              value={settings.tolerancePx}
              min={MIN_TOLERANCE_PX}
              max={MAX_TOLERANCE_PX}
              suffix="px"
              disabled={!settings.enabled}
              onCommit={(tolerancePx) => onChange({ tolerancePx })}
              className="w-24"
            />
          </div>
          <Check label="Match equal spacing" checked={settings.spacing} onChange={(spacing) => onChange({ spacing })} hint="Snap to the gap between neighbours." />
          <Check label="Show distances" checked={settings.distances} onChange={(distances) => onChange({ distances })} hint="Measure to the nearest shapes while dragging." />
        </div>
      )}
    </div>
  );
};
