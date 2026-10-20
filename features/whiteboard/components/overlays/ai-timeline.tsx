"use client";

import * as React from "react";
import type { AIChatMessage } from "@/features/whiteboard/hooks/controller/use-ai-generation";

type Tone = "neutral" | "success" | "warning" | "danger";

const PHASE_LABELS: Record<string, string> = {
  contextRetriever: "Reading",
  architecturePlanner: "Planning",
  domainModeler: "Modelling",
  infrastructureExpander: "Expanding",
  relationshipAgent: "Connecting",
  diagramComposer: "Composing",
  layoutAgent: "Layout",
  validationAgent: "Checking",
  criticAgent: "Review",
  expansionAgent: "Expanding",
  repairAgent: "Repairing",
  canvasCompiler: "Drawing",
};

const NOTE_LABELS: Record<NonNullable<AIChatMessage["noteKind"]>, { label: string; tone: Tone }> = {
  reasoning: { label: "Thinking", tone: "neutral" },
  icons: { label: "Icons", tone: "neutral" },
  add: { label: "Built", tone: "neutral" },
  adjust: { label: "Adjusted", tone: "neutral" },
  undo: { label: "Undone", tone: "warning" },
  review: { label: "Review", tone: "warning" },
  view: { label: "Checked", tone: "neutral" },
  summary: { label: "Done", tone: "success" },
  stopped: { label: "Stopped", tone: "warning" },
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_MARKER: Record<Tone, string> = {
  neutral: "bg-foreground/70",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

interface Entry {
  id: string;
  label: string;
  tone: Tone;
  title: string;
  body?: string;
  /** The agent's own words: shown as a quotation. */
  quote?: boolean;
  items?: string[];
  at: number;
  closing?: boolean;
  /** What an icon lookup searched for, so several in a row can be shown as one. */
  searched?: string;
}

/** What a message in the run is, whichever pipeline produced it. */
const toEntry = (m: AIChatMessage): Entry | null => {
  if (m.kind === "prompt") return null;
  const base = { id: m.id, at: m.timestamp };
  if (m.kind === "note") {
    const note = NOTE_LABELS[m.noteKind ?? "view"];
    return {
      ...base,
      label: note.label,
      tone: note.tone,
      searched: m.noteKind === "icons" ? m.content.replace(/^Searching for\s+/i, "").replace(/\.$/, "") : undefined,
      title: m.noteKind === "reasoning" ? "" : (m.title ?? ""),
      body: m.content || undefined,
      quote: m.noteKind === "reasoning",
      items: m.items,
      closing: m.noteKind === "summary" || m.noteKind === "stopped",
    };
  }
  if (m.kind === "error") return { ...base, label: "Error", tone: "danger", title: m.content };
  if (m.kind === "success") return { ...base, label: "Done", tone: "success", title: m.content, closing: true };
  if (m.kind === "element") return { ...base, label: "Drawing", tone: "neutral", title: m.content };
  if (m.kind === "thought") return { ...base, label: "Thinking", tone: "neutral", title: "", body: m.content, quote: true };
  return { ...base, label: PHASE_LABELS[m.phase ?? ""] ?? "Step", tone: "neutral", title: m.content };
};

/** Lookups that follow one another are one piece of work: show them as one entry listing what was searched. */
const mergeLookups = (entries: Entry[]): Entry[] =>
  entries.reduce<Entry[]>((merged, entry) => {
    const last = merged[merged.length - 1];
    if (entry.searched === undefined || !last || last.searched === undefined) return [...merged, entry];
    const terms = [...(last.items ?? [last.searched]), entry.searched];
    return [...merged.slice(0, -1), { ...last, title: "Looked up icons", body: undefined, items: terms }];
  }, []);

const seconds = (ms: number) => `+${(Math.max(0, ms) / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

const COLLAPSED_ITEMS = 5;

const Items: React.FC<{ items: string[] }> = ({ items }) => {
  const [open, setOpen] = React.useState(false);
  const shown = open ? items : items.slice(0, COLLAPSED_ITEMS);
  return (
    <div className="mt-2">
      <ul className="space-y-1">
        {shown.map((item, i) => (
          <li key={`${i}-${item}`} className="flex gap-2 font-mono text-[11.5px] leading-snug text-foreground/80">
            <span aria-hidden className="select-none text-muted-foreground">
              ›
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
      {items.length > COLLAPSED_ITEMS && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {open ? "Show less" : `Show ${items.length - COLLAPSED_ITEMS} more`}
        </button>
      )}
    </div>
  );
};

interface AITimelineProps {
  messages: AIChatMessage[];
  /** What the agent is doing right now; null when it is idle. */
  working: string | null;
  /** Shown under the closing entry, e.g. "Open as code". */
  closingActions?: React.ReactNode;
}

/**
 * The run as a record of work: each step with its label, its time, what it found or did and the facts
 * behind it. Reads top to bottom like a log, not like a conversation.
 */
export const AITimeline: React.FC<AITimelineProps> = ({ messages, working, closingActions }) => {
  // The agent's own closing summary says what the generic "Done! N elements" message would; show one of them.
  const hasSummary = messages.some((m) => m.noteKind === "summary" || m.noteKind === "stopped");
  const entries = mergeLookups(
    messages
      .filter((m) => !(hasSummary && m.kind === "success"))
      .map(toEntry)
      .filter((e): e is Entry => e !== null),
  );
  const start = messages[0]?.timestamp ?? 0;
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (working === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [working]);

  return (
    <ol aria-live="polite" aria-label="Agent activity" className="px-5 pb-6 pt-1">
      {entries.map((entry, index) => {
        const last = index === entries.length - 1 && working === null;
        return (
          <li key={entry.id} className="relative pb-5 pl-6 last:pb-0">
            {!last && <span aria-hidden className="absolute bottom-0 left-[3px] top-[15px] w-px bg-border" />}
            <span aria-hidden className={`absolute left-0 top-[6px] h-[7px] w-[7px] rounded-[2px] ${TONE_MARKER[entry.tone]}`} />
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${TONE_TEXT[entry.tone]}`}>{entry.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{seconds(entry.at - start)}</span>
            </div>

            {entry.title && (
              <p className={`mt-1 text-[13px] leading-snug text-foreground ${entry.closing ? "font-semibold" : "font-medium"}`}>{entry.title}</p>
            )}

            {entry.body &&
              (entry.quote ? (
                <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground/75">{entry.body}</blockquote>
              ) : (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{entry.body}</p>
              ))}

            {entry.items && entry.items.length > 0 && <Items items={entry.items} />}
            {entry.closing && closingActions && <div className="mt-3 flex flex-wrap gap-2">{closingActions}</div>}
          </li>
        );
      })}

      {working !== null && (
        <li className="relative pl-6">
          <span aria-hidden className="absolute left-0 top-[6px] h-[7px] w-[7px] rounded-[2px] border border-foreground/60 motion-safe:animate-pulse" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-foreground">Working</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{seconds(now - start)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{working || "Waiting for the model"}</p>
        </li>
      )}
    </ol>
  );
};
