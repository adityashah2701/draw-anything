import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
} from "lucide-react";
import { ICON_SIZE_PRESETS } from "@/core/shapes/semantic-node/style";
import type { SemanticIconPlacement } from "@/features/whiteboard/types/whiteboard.types";
import type { AlignMode, DistributeAxis } from "@/features/whiteboard/utils/arrange";

export const IconButton = ({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={`grid h-7 w-7 place-items-center rounded-md border text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      pressed ? "border-primary bg-primary/15" : "border-transparent hover:border-border hover:bg-muted"
    }`}
  >
    {children}
  </button>
);

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="border-t border-border px-3 py-2">
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
    {children}
  </div>
);

export const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", Icon: AlignStartVertical },
  { mode: "center", label: "Align horizontal centres", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right", Icon: AlignEndVertical },
  { mode: "top", label: "Align top", Icon: AlignStartHorizontal },
  { mode: "middle", label: "Align vertical centres", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

export const DISTRIBUTE: { axis: DistributeAxis; label: string; Icon: typeof AlignStartVertical }[] = [
  { axis: "horizontal", label: "Distribute horizontally", Icon: AlignHorizontalSpaceBetween },
  { axis: "vertical", label: "Distribute vertically", Icon: AlignVerticalSpaceBetween },
];

/**
 * A text field that commits on Enter or blur, never while typing (a half-typed name or label is not an
 * edit), and puts the old text back on Escape. `multiline` keeps line breaks (Shift+Enter adds one).
 */
export const TextCommitField = ({
  label,
  value,
  placeholder,
  maxLength,
  multiline,
  rows = 2,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  disabled: boolean;
  onCommit: (text: string) => void;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const props = {
    "aria-label": label,
    value: draft ?? value,
    disabled,
    placeholder,
    maxLength,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: (e: { currentTarget: { select: () => void } }) => e.currentTarget.select(),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelledRef.current = true;
        setDraft(null);
        e.currentTarget.blur();
      }
    },
    className:
      "w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50",
  };
  return multiline ? (
    <textarea rows={rows} {...props} className={`${props.className} resize-none py-1`} />
  ) : (
    <input {...props} className={`${props.className} h-8 font-medium`} />
  );
};

/** One choice out of a few, as a row of toggle buttons (state is `aria-pressed`, so it reads well to assistive tech). */
export function Segmented<T extends string | number | null>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { value: T; text: string; title: string }[];
  value: T | "mixed";
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border border-border">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          aria-label={`${label}: ${option.title}`}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`h-7 min-w-0 flex-1 px-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === option.value ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

export const ICON_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#dc2626", "#c026d3", "#475569"];

export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="mb-1 mt-2 text-[11px] text-muted-foreground first:mt-0">{children}</div>
);

export const PLACEMENTS: { value: SemanticIconPlacement | null; text: string; title: string }[] = [
  { value: null, text: "Auto", title: "Automatic" },
  { value: "left", text: "Left", title: "Left" },
  { value: "top", text: "Top", title: "Top" },
  { value: "right", text: "Right", title: "Right" },
];

export const SIZES: { value: number | null; text: string; title: string }[] = [
  { value: null, text: "Auto", title: "Automatic" },
  ...ICON_SIZE_PRESETS.map((preset) => ({
    value: preset.size as number | null,
    text: preset.label,
    title: { S: "Small", M: "Medium", L: "Large", XL: "Extra large" }[preset.label] ?? preset.label,
  })),
];

export const WEIGHTS: { value: string; text: string; title: string }[] = [
  { value: "400", text: "Reg", title: "Regular" },
  { value: "500", text: "Med", title: "Medium" },
  { value: "600", text: "Semi", title: "Semibold" },
  { value: "700", text: "Bold", title: "Bold" },
];

