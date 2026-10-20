import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/features/whiteboard/utils/inspector-model";

interface NumberFieldProps {
  /** Accessible name; also what tests and screen readers find the field by. */
  label: string;
  /** The value shown, or "mixed" when the selection disagrees (the field is then empty). */
  value: number | "mixed";
  /** Called with a new, finite number. Not called when the text is unchanged or unreadable. */
  onCommit: (value: number) => void;
  disabled?: boolean;
  /** Arrow keys change the value by this much (Shift: ten times as much). */
  step?: number;
  min?: number;
  max?: number;
  /** Short text inside the field, e.g. "X" or "°". */
  prefix?: string;
  suffix?: string;
  /** Hint shown while the field has no value (default "Mixed", which is what an empty field means for a mixed selection). */
  emptyHint?: string;
  className?: string;
}

/**
 * A numeric input that commits on Enter, blur or the arrow keys, never while typing, so a half-typed
 * "1" on the way to "120" does not resize anything. Escape puts the old value back. Clamps to
 * `min`/`max`; text that is not a number is dropped.
 */
export const NumberField = ({ label, value, onCommit, disabled, step = 1, min, max, prefix, suffix, emptyHint, className }: NumberFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape blurs the field, and a blur normally commits: this tells that blur to discard instead.
  const cancelledRef = useRef(false);
  const shown = draft ?? (value === "mixed" ? "" : formatNumber(value));

  // A value that changes underneath (selection or undo) replaces a draft nobody is typing in.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = (text: string | null) => {
    setDraft(null);
    if (text === null) return;
    const parsed = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (value !== "mixed" && Math.abs(next - value) < 1e-9) return;
    onCommit(next);
  };

  return (
    <label className={`flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs ${disabled ? "opacity-50" : "focus-within:border-primary"} ${className ?? ""}`}>
      {prefix && <span className="w-3 shrink-0 select-none text-[10px] font-semibold text-muted-foreground">{prefix}</span>}
      <input
        ref={inputRef}
        aria-label={label}
        title={label}
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        placeholder={value === "mixed" ? (emptyHint ?? "Mixed") : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (cancelledRef.current) {
            cancelledRef.current = false;
            setDraft(null);
            return;
          }
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft ?? shown);
            e.currentTarget.select();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelledRef.current = true;
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number((draft ?? shown).replace(",", "."));
            const current = Number.isFinite(base) ? base : value === "mixed" ? 0 : value;
            const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            commit(String(Math.round((current + delta) * 1000) / 1000));
          }
        }}
        className="w-full min-w-0 bg-transparent tabular-nums text-foreground outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="shrink-0 select-none text-[10px] text-muted-foreground">{suffix}</span>}
    </label>
  );
};
