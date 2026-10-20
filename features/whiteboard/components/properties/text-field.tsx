import { useEffect, useRef, useState } from "react";

interface TextFieldProps {
  label: string;
  /** The text shown, or "mixed" when the selection disagrees (the field is then empty). */
  value: string | "mixed";
  /** Called with the new text. Not called when it is unchanged. */
  onCommit: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

/** A text input that commits on Enter or blur, never while typing, and puts the old text back on Escape. */
export const TextField = ({ label, value, onCommit, disabled, maxLength }: TextFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const shown = draft ?? (value === "mixed" ? "" : value);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const commit = (text: string | null) => {
    setDraft(null);
    if (text === null || text === (value === "mixed" ? null : value)) return;
    onCommit(text);
  };

  return (
    <label className={`flex h-8 items-center rounded-md border border-border bg-background px-2 text-xs ${disabled ? "opacity-50" : "focus-within:border-primary"}`}>
      <input
        ref={inputRef}
        aria-label={label}
        title={label}
        disabled={disabled}
        value={shown}
        maxLength={maxLength}
        placeholder={value === "mixed" ? "Mixed" : undefined}
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
          }
        }}
        className="w-full min-w-0 bg-transparent text-foreground outline-none disabled:cursor-not-allowed"
      />
    </label>
  );
};
