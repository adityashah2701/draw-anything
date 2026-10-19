import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import type { Mixed } from "@/features/whiteboard/utils/inspector-model";

/** A colour as a round swatch. "mixed" draws stripes instead of a colour; "none" draws the transparent checkerboard with a slash. */
export const Swatch = ({ color, size = 20, ring = true }: { color: Mixed<string> | "none"; size?: number; ring?: boolean }) => {
  const background =
    color === "mixed"
      ? "repeating-linear-gradient(45deg, #94a3b8 0 3px, #e2e8f0 3px 6px)"
      : color === "none"
        ? "linear-gradient(135deg, transparent 46%, #ef4444 46% 54%, transparent 54%), conic-gradient(#e5e7eb 25%, #ffffff 0 50%, #e5e7eb 0 75%, #ffffff 0) 0 0 / 8px 8px"
        : color === "transparent" || color === "#transparent"
          ? "conic-gradient(#e5e7eb 25%, #ffffff 0 50%, #e5e7eb 0 75%, #ffffff 0) 0 0 / 8px 8px"
          : color;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${ring ? "ring-1 ring-inset ring-foreground/25" : ""}`}
      style={{ width: size, height: size, background }}
    />
  );
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One section of the properties bar: a labelled button (preview over a caption) that opens a popover with the
 * section's controls. The popover is a portal on `document.body` (the bar's blur would otherwise become its
 * containing block), sits above the bar and is clamped to the viewport. Opening with the keyboard moves focus
 * into it, Tab stays inside, Escape closes it and puts focus back on the button, and a press anywhere else closes it.
 */
export const PropertyChip = ({
  label,
  summary,
  preview,
  disabled,
  resetKey,
  width = 232,
  children,
}: {
  /** The caption, and the first words of the accessible name. */
  label: string;
  /** The current value in words, appended to the accessible name ("Stroke: #2563eb, 2 px"). */
  summary: string;
  preview: ReactNode;
  disabled?: boolean;
  /** The popover closes when this changes (a new selection). */
  resetKey: string;
  width?: number;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const viaKeyboardRef = useRef(false);
  const popoverId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => setOpen(false), [resetKey]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, window.innerWidth - width - 8));
      setPlace({ left, bottom: window.innerHeight - rect.top + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (popoverRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // Keyboard users land on the first control; pointer users keep focus where it was so typing shortcuts still work.
  useEffect(() => {
    if (open && place && viaKeyboardRef.current) {
      popoverRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      viaKeyboardRef.current = false;
    }
  }, [open, place]);

  const onPopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      const items = [...(popoverRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-chip-trigger=""
        disabled={disabled}
        aria-label={`${label}: ${summary}`}
        title={`${label}: ${summary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowUp") viaKeyboardRef.current = true;
        }}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-12 min-w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 ${
          open ? "bg-sky-500/20" : "hover:bg-muted"
        }`}
      >
        <span className="flex h-5 items-center justify-center text-sm font-semibold leading-none">{preview}</span>
        <span className="text-[10px] font-medium leading-none text-muted-foreground">{label}</span>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={label}
            onKeyDown={onPopoverKeyDown}
            style={{ position: "fixed", left: place.left, bottom: place.bottom, width, zIndex: 60 }}
            className="rounded-xl border border-border bg-popover p-3 text-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-1 duration-100"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};

/** A small heading inside a popover. */
export const PopoverLabel = ({ children }: { children: ReactNode }) => (
  <div className="mb-1.5 mt-3 text-[11px] font-medium text-muted-foreground first:mt-0">{children}</div>
);

/**
 * One choice out of a few, as a row of toggle buttons (`aria-pressed`). `value` may be "mixed": then no button
 * is pressed, so a mixed selection never claims a value it does not have.
 */
export function ChoiceRow<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: { value: T; title: string; content: ReactNode }[];
  value: Mixed<T>;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const pressed = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={pressed}
            aria-label={`${label}: ${option.title}`}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`grid h-9 place-items-center rounded-md border px-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
              pressed ? "border-sky-500 bg-sky-500/20 font-semibold" : "border-border bg-background hover:bg-muted"
            }`}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}

/** A colour grid with a custom colour input. The pressed swatch is the current colour; "mixed" presses none. */
export const ColorGrid = ({
  label,
  colors,
  value,
  onPick,
  extra,
}: {
  label: string;
  colors: readonly string[];
  value: Mixed<string>;
  onPick: (color: string) => void;
  /** More choices in the grid after the colours (e.g. "no fill"). */
  extra?: ReactNode;
}) => {
  const current = value === "mixed" ? null : value.toLowerCase();
  const custom = useRef<HTMLInputElement>(null);
  // The native picker fires "input" for every drag inside it; only its final "change" is one undo step.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    const input = custom.current;
    if (!input) return;
    const onChange = () => pickRef.current(input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, [current]);
  return (
    <div role="group" aria-label={label}>
      <div className="grid grid-cols-6 gap-1.5">
        {extra}
        {colors.map((color) => {
          const pressed = current === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={pressed}
              aria-label={`${label} ${color}`}
              title={color}
              onClick={() => onPick(color)}
              className={`relative grid h-7 w-full place-items-center rounded-md outline-none ring-1 ring-inset ring-foreground/20 focus-visible:ring-2 focus-visible:ring-sky-500 ${pressed ? "ring-2 ring-sky-500" : "hover:ring-foreground/50"}`}
              style={{ backgroundColor: color }}
            >
              {pressed && <Check size={14} aria-hidden className={isLight(color) ? "text-black" : "text-white"} />}
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs focus-within:border-sky-500">
        <input
          ref={custom}
          type="color"
          aria-label={`${label} custom`}
          key={current ?? "mixed"}
          defaultValue={current && /^#[0-9a-f]{6}$/.test(current) ? current : "#000000"}
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="text-muted-foreground">Custom</span>
        <span className="ml-auto tabular-nums text-muted-foreground">{current ?? "Mixed"}</span>
      </label>
    </div>
  );
};

/** Perceived lightness, to choose a readable check mark over a swatch. */
export const isLight = (hex: string): boolean => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
};
