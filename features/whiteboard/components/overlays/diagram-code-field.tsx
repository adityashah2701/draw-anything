"use client";

import * as React from "react";
import type { CompiledCode } from "@/features/diagram-code/language/compile";
import { toSegments } from "@/features/diagram-code/language/tooling/highlight";
import { completeAt, inHeaderAt, type CompletionItem, type CompletionResult } from "@/features/diagram-code/language/tooling/complete";
import { hoverAt, type Hover } from "@/features/diagram-code/language/tooling/hover";
import { enter, tab, typeCloseBrace, type Edit } from "@/features/diagram-code/language/tooling/indent";
import type { TokenKind } from "@/features/diagram-code/language/ast";

const LINE_HEIGHT = 20;
const PAD_X = 12;
const PAD_Y = 8;

/** Colour is a role (docs/design/system.md): ink for the language's own words, neutrals for the rest, status only for problems. */
const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: "text-primary font-medium",
  name: "text-foreground",
  string: "text-foreground/75",
  property: "text-primary",
  value: "text-foreground",
  number: "text-foreground",
  connector: "text-primary font-semibold",
  label: "text-foreground/85",
  punctuation: "text-muted-foreground",
  comment: "text-muted-foreground italic",
  error: "text-destructive",
};

const SQUIGGLE = {
  error: "underline decoration-destructive decoration-wavy underline-offset-[3px]",
  warning: "underline decoration-warning decoration-wavy underline-offset-[3px]",
} as const;

export interface DiagramCodeFieldHandle {
  /** Select a range and bring it into view (used to jump to a diagnostic). */
  select: (from: number, to: number) => void;
  focus: () => void;
}

interface DiagramCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFormat: () => void;
  compiled: CompiledCode;
  iconIds: readonly string[];
  /** Called with what is under the caret, for the one-line description under the field. */
  onCaretInfo?: (info: Hover | null) => void;
  disabled?: boolean;
  describedBy?: string;
}

/**
 * The code field: a textarea (so selection, IME, undo and paste are the browser's own) with a
 * painted mirror behind it for highlighting and squiggles, a completion list and hover help.
 * Tab indents; Escape leaves the field (or closes the list); Ctrl+Space asks for suggestions;
 * Shift+Alt+F formats; Ctrl/Cmd+Enter applies.
 */
export const DiagramCodeField = React.forwardRef<DiagramCodeFieldHandle, DiagramCodeFieldProps>(function DiagramCodeField(
  { value, onChange, onSubmit, onFormat, compiled, iconIds, onCaretInfo, disabled, describedBy },
  ref,
) {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const mirrorRef = React.useRef<HTMLPreElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLSpanElement>(null);
  const listId = React.useId();

  const [completion, setCompletion] = React.useState<CompletionResult | null>(null);
  const [active, setActive] = React.useState(0);
  const [caretBox, setCaretBox] = React.useState<{ left: number; top: number } | null>(null);
  const [hover, setHover] = React.useState<{ info: Hover; left: number; top: number } | null>(null);
  const charWidth = React.useRef(7.5);
  // A selection to restore once React has written the new text: setting it earlier is overwritten, and
  // setting it a frame later loses to fast typing (the next key lands at the old caret).
  const pendingSelection = React.useRef<{ from: number; to: number } | null>(null);
  const place = (from: number, to: number) => {
    pendingSelection.current = { from, to };
    areaRef.current?.setSelectionRange(from, to);
  };

  const lines = Math.max(1, value.split("\n").length);
  const segments = React.useMemo(() => toSegments(value, compiled.tokens, compiled.diagnostics), [value, compiled]);
  const worst = React.useMemo(() => {
    const byLine = new Map<number, "error" | "warning">();
    for (const d of compiled.diagnostics) if (byLine.get(d.line) !== "error") byLine.set(d.line, d.severity);
    return byLine;
  }, [compiled.diagnostics]);

  React.useLayoutEffect(() => {
    const wanted = pendingSelection.current;
    if (wanted && areaRef.current) {
      areaRef.current.setSelectionRange(wanted.from, wanted.to);
      pendingSelection.current = null;
    }
  }, [value]);

  React.useImperativeHandle(ref, () => ({
    select: (from, to) => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      place(from, to);
      const line = value.slice(0, from).split("\n").length - 1;
      const top = line * LINE_HEIGHT;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - LINE_HEIGHT * 2) el.scrollTop = Math.max(0, top - LINE_HEIGHT * 3);
    },
    focus: () => areaRef.current?.focus(),
  }));

  React.useLayoutEffect(() => {
    const width = measureRef.current?.getBoundingClientRect().width;
    if (width) charWidth.current = width / 40;
  }, []);

  const syncScroll = () => {
    const el = areaRef.current;
    if (!el) return;
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = el.scrollTop;
      mirrorRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    setHover(null);
  };

  const offsetToBox = (offset: number) => {
    const el = areaRef.current!;
    const before = value.slice(0, offset);
    const line = before.split("\n").length - 1;
    const column = offset - (before.lastIndexOf("\n") + 1);
    return {
      left: PAD_X + column * charWidth.current - el.scrollLeft,
      top: PAD_Y + (line + 1) * LINE_HEIGHT - el.scrollTop,
    };
  };

  const suggest = (text: string, offset: number) => {
    const result = completeAt(text, offset, {
      nodeNames: compiled.ir.nodes.map((n) => n.name),
      iconIds,
      inHeader: inHeaderAt(compiled, text, offset),
    });
    // Nothing to offer, or the only suggestion is exactly what is already typed.
    const useful = result && !(result.items.length === 1 && text.slice(result.from, result.to) === result.items[0].insert.trimEnd());
    setCompletion(useful ? result : null);
    setActive(result?.eager ? 0 : -1);
    if (useful && areaRef.current) setCaretBox(offsetToBox(offset));
  };

  const commit = (edit: Edit) => {
    place(edit.from, edit.to);
    onChange(edit.text);
  };

  const accept = (item: CompletionItem) => {
    if (!completion) return;
    const next = value.slice(0, completion.from) + item.insert + value.slice(completion.to);
    const caret = completion.from + item.insert.length;
    place(caret, caret);
    onChange(next);
    setCompletion(null);
    // After a property name the value is next: offer it straight away.
    if (item.kind === "property" || item.kind === "keyword") requestAnimationFrame(() => suggest(next, caret));
  };

  const reportCaret = () => {
    const el = areaRef.current;
    if (!el || !onCaretInfo) return;
    onCaretInfo(hoverAt(compiled, el.selectionStart));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: from, selectionEnd: to } = el;
    if (completion) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = completion.items.length;
        setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
        return;
      }
      // Tab always takes a suggestion; Enter only when one is highlighted, so a new name can end its line.
      if (e.key === "Tab" || (e.key === "Enter" && active >= 0)) {
        e.preventDefault();
        accept(completion.items[Math.max(active, 0)]);
        return;
      }
      if (e.key === "Enter") setCompletion(null);
      if (e.key === "Escape") {
        e.preventDefault();
        setCompletion(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      suggest(value, from);
    } else if (e.key.toLowerCase() === "f" && e.shiftKey && e.altKey) {
      e.preventDefault();
      onFormat();
    } else if (e.key === "Escape") {
      el.blur();
    } else if (e.key === "Tab") {
      // Indent like an editor; Escape leaves the field for keyboard users.
      e.preventDefault();
      commit(tab(value, from, to, e.shiftKey));
    } else if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      commit(enter(value, from, to));
    } else if (e.key === "}" && from === to) {
      const edit = typeCloseBrace(value, from);
      if (edit) {
        e.preventDefault();
        commit(edit);
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD_X + el.scrollLeft;
    const y = e.clientY - rect.top - PAD_Y + el.scrollTop;
    const line = Math.floor(y / LINE_HEIGHT);
    const text = value.split("\n");
    if (y < 0 || line < 0 || line >= text.length) return setHover(null);
    const column = Math.floor(x / charWidth.current);
    if (column < 0 || column > text[line].length) return setHover(null);
    const offset = text.slice(0, line).reduce((sum, l) => sum + l.length + 1, 0) + column;
    const info = hoverAt(compiled, offset);
    if (!info || (info.lines.length === 0 && info.diagnostics.length === 0)) return setHover(null);
    setHover({ info, left: Math.min(e.clientX - rect.left, rect.width - 240), top: e.clientY - rect.top + 16 });
  };

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-background focus-within:border-foreground/40">
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-border bg-muted/40 py-2 pl-2 pr-2 text-right font-mono text-[11px] text-muted-foreground"
        style={{ lineHeight: `${LINE_HEIGHT}px`, minWidth: `${String(lines).length * 8 + 22}px` }}
      >
        {Array.from({ length: lines }, (_, i) => {
          const severity = worst.get(i + 1);
          return (
            <div key={i} className={severity === "error" ? "text-destructive" : severity === "warning" ? "text-warning" : undefined}>
              {i + 1}
            </div>
          );
        })}
      </div>

      <div className="relative min-w-0 flex-1">
        {/* Same box model as the textarea so every glyph lines up under its own text. */}
        <pre
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre bg-transparent font-mono text-[12.5px]"
          style={{ lineHeight: `${LINE_HEIGHT}px`, tabSize: 2, padding: `${PAD_Y}px ${PAD_X}px` }}
        >
          {segments.map((segment, i) => (
            <span key={i} className={[segment.kind ? TOKEN_CLASS[segment.kind] : "text-foreground", segment.severity ? SQUIGGLE[segment.severity] : ""].join(" ")}>
              {segment.text}
            </span>
          ))}
          {"\n"}
        </pre>
        <span ref={measureRef} aria-hidden className="invisible absolute font-mono text-[12.5px]" style={{ whiteSpace: "pre" }}>
          {"0".repeat(40)}
        </span>
        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            const caret = e.target.selectionStart;
            const typed = (e.nativeEvent as InputEvent).inputType?.startsWith("insert");
            if (typed) suggest(e.target.value, caret);
            else setCompletion(null);
          }}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onKeyUp={reportCaret}
          onClick={() => {
            setCompletion(null);
            reportCaret();
          }}
          onBlur={() => {
            setCompletion(null);
            setHover(null);
          }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          disabled={disabled}
          aria-label="Diagram code"
          aria-describedby={describedBy}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={completion !== null}
          aria-controls={completion ? listId : undefined}
          aria-activedescendant={completion ? `${listId}-${active}` : undefined}
          role="combobox"
          placeholder={"Web App > API: HTTPS\nAPI > Database"}
          className="relative block h-full w-full min-w-0 resize-none overflow-auto whitespace-pre bg-transparent font-mono text-[12.5px] text-transparent caret-foreground outline-none selection:bg-primary/25 placeholder:text-muted-foreground disabled:opacity-60"
          style={{ lineHeight: `${LINE_HEIGHT}px`, tabSize: 2, padding: `${PAD_Y}px ${PAD_X}px` }}
        />

        {completion && caretBox && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="absolute z-20 max-h-52 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-popover"
            style={{ left: Math.max(0, Math.min(caretBox.left, (areaRef.current?.clientWidth ?? 400) - 268)), top: caretBox.top }}
          >
            {completion.items.map((item, i) => (
              <li
                key={`${item.kind}-${item.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(item);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-sm px-2 py-1 text-[12px] ${i === active ? "bg-accent text-accent-foreground" : ""}`}
              >
                <span className="truncate font-mono text-[12px]">{item.label}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{item.kind}</span>
              </li>
            ))}
          </ul>
        )}

        {hover && !completion && (
          <div role="tooltip" className="pointer-events-none absolute z-10 max-w-[260px] rounded-md bg-foreground px-2.5 py-1.5 text-[12px] leading-snug text-background shadow-popover" style={{ left: Math.max(0, hover.left), top: hover.top }}>
            <p className="font-mono text-[11px] font-medium">{hover.info.title}</p>
            {hover.info.lines.map((line, i) => (
              <p key={i} className="opacity-90">
                {line}
              </p>
            ))}
            {hover.info.diagnostics.map((d, i) => (
              <p key={`d${i}`} className="mt-1 opacity-95">
                {d.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
