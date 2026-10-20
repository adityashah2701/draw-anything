"use client";

import * as React from "react";
import { Check, ChevronRight, Code2, ImageIcon, Maximize, ShieldAlert, Square, Undo2, X } from "lucide-react";
import type { AgentUiMessage, PendingConfirmation } from "@/features/canvas-tools/editor/use-canvas-agent";
import { UNIFIED_EXAMPLES } from "./agent-examples";
import { AgentMarkdown } from "./agent-markdown";

interface StepActions {
  onFit?: () => void;
  onOpenCode?: () => void;
}

const Step: React.FC<{ message: Extract<AgentUiMessage, { kind: "tool" }>; actions?: StepActions }> = ({ message, actions }) => (
  <li className="flex gap-2.5 py-1.5" data-testid="agent-step" data-ok={message.ok ? "true" : "false"} data-tool={message.tool}>
    <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${message.ok ? "bg-success/15 text-success" : "bg-red-500/15 text-destructive"}`}>
      {message.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
    </span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[11px] text-foreground">{message.tool}</span>
        {message.ok && message.changed > 0 && <span className="font-mono text-[10px] text-muted-foreground">{message.changed} changed</span>}
        {!message.ok && message.code && <span className="font-mono text-[10px] text-destructive">{message.code}</span>}
      </div>
      <p className="mt-0.5 break-words text-[12px] leading-snug text-muted-foreground">{message.summary}</p>
      {message.skipped > 0 && <p className="mt-0.5 text-[11px] text-warning">{message.skipped} left alone</p>}
      {message.warnings.slice(0, 2).map((warning) => (
        <p key={warning} className="mt-0.5 text-[11px] text-warning">
          {warning}
        </p>
      ))}
      {message.tool === "generate_diagram" && message.ok && actions && (
        <div className="mt-1.5 flex gap-1.5">
          {actions.onOpenCode && (
            <button type="button" data-testid="agent-open-code" onClick={actions.onOpenCode} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted">
              <Code2 size={11} aria-hidden /> Open as code
            </button>
          )}
          {actions.onFit && (
            <button type="button" data-testid="agent-fit" onClick={actions.onFit} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted">
              <Maximize size={11} aria-hidden /> Fit to view
            </button>
          )}
        </div>
      )}
    </div>
  </li>
);

/**
 * What the model (or the diagram generator) said while it worked. Clearly secondary: small, muted, collapsed once
 * the run moves on, open while it is the newest thing in a running transcript so it can be followed live.
 */
const Thinking: React.FC<{ message: Extract<AgentUiMessage, { kind: "thinking" }>; live: boolean }> = ({ message, live }) => {
  const [open, setOpen] = React.useState(live);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (!touched.current) setOpen(live);
  }, [live]);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (live && open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [live, open, message.text]);
  return (
    <li data-testid="agent-thinking" data-open={open ? "true" : "false"} data-live={live ? "true" : "false"} data-source={message.source}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          touched.current = true;
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        <ChevronRight size={11} aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {live ? "Thinking…" : "Thought"}
        {message.source === "generator" && <span className="text-muted-foreground/70">· diagram generator</span>}
      </button>
      {open && (
        <div ref={bodyRef} data-testid="agent-thinking-body" className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-l border-border pl-3 text-[12px] leading-snug text-muted-foreground">
          {message.text}
        </div>
      )}
    </li>
  );
};

interface Props {
  messages: AgentUiMessage[];
  running: boolean;
  confirmation: PendingConfirmation | null;
  onConfirm: (approved: boolean) => void;
  onStop: () => void;
  onUndoRun: () => void;
  canUndoRun: boolean;
  onExample: (text: string) => void;
  disabled: boolean;
  /** What the agent is doing right now (a long step such as generating a diagram). */
  activity?: string | null;
  onFit?: () => void;
  onOpenCode?: () => void;
}

export const CanvasAgentView: React.FC<Props> = ({ messages, running, confirmation, onConfirm, onStop, onUndoRun, canUndoRun, onExample, disabled, activity = null, onFit, onOpenCode }) => {
  // Everyone with access to the board shares this conversation.
  const notice = (
    <p data-testid="agent-shared-notice" className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
      This conversation is shared with everyone who can open this board. What you ask here, and the assistant&apos;s answers, thinking and saved notes, are visible to them. Attached images are used for the request only and are not saved.
    </p>
  );

  if (messages.length === 0) {
    return (
      <div className="px-5 py-5" data-testid="canvas-agent-empty">
        {notice}
        <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
          Ask for a diagram or a change to this board. The assistant draws new diagrams and edits with the same commands as the editor, so every step can be undone, and it tells you exactly what it did.
        </p>
        <h3 className="mt-7 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Try</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {UNIFIED_EXAMPLES.map(({ tag, text }) => (
            <li key={tag}>
              <button
                type="button"
                disabled={disabled || running}
                onClick={() => onExample(text)}
                className="flex w-full items-baseline gap-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-50"
              >
                <span className="w-11 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{tag}</span>
                <span className="text-[13px] leading-snug text-foreground">{text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="px-5 py-4" data-testid="canvas-agent-messages">
      {notice}
      <ol className="space-y-3">
        {messages.map((message, index) => {
          if (message.kind === "user") {
            return (
              <li key={message.id} className="rounded-md bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-foreground" data-testid="agent-user">
                {message.previews && message.previews.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5" data-testid="agent-user-images">
                    {message.previews.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- a local data: URL
                      <img key={i} src={url} alt={`Attached image ${i + 1}`} className="h-14 w-14 rounded border border-border object-cover" />
                    ))}
                  </div>
                )}
                {!message.previews?.length && message.images ? (
                  <p data-testid="agent-user-image-count" className="mb-1 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <ImageIcon size={11} aria-hidden /> {message.images} image{message.images === 1 ? "" : "s"} attached
                  </p>
                ) : null}
                <p>{message.text}</p>
              </li>
            );
          }
          if (message.kind === "assistant") {
            return (
              <li key={message.id} className="text-[13px] leading-relaxed text-foreground" data-testid="agent-assistant">
                <AgentMarkdown text={message.text} />
              </li>
            );
          }
          if (message.kind === "thinking") {
            return <Thinking key={message.id} message={message} live={running && messages.slice(index + 1).every((later) => later.kind === "thinking")} />;
          }
          if (message.kind === "status") {
            return (
              <li
                key={message.id}
                data-testid="agent-status"
                data-tone={message.tone}
                className={`border-t border-border pt-2 font-mono text-[11px] ${message.tone === "ok" ? "text-muted-foreground" : message.tone === "warn" ? "text-warning" : "text-destructive"}`}
              >
                {message.text}
              </li>
            );
          }
          // Consecutive steps are one list, so the transcript reads as a run rather than a pile of cards.
          const previous = messages[index - 1];
          if (previous?.kind === "tool") return null;
          const run: Array<Extract<AgentUiMessage, { kind: "tool" }>> = [];
          for (let i = index; messages[i]?.kind === "tool"; i += 1) run.push(messages[i] as Extract<AgentUiMessage, { kind: "tool" }>);
          return (
            <li key={message.id}>
              <ul className="divide-y divide-border/60 border-l border-border pl-3">
                {run.map((step) => (
                  <Step key={step.id} message={step} actions={{ onFit, onOpenCode }} />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {confirmation && (
        <div role="alertdialog" aria-label="Confirm" data-testid="agent-confirm" className="mt-4 rounded-md border border-warning/50 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-[13px] font-medium text-foreground">{confirmation.message}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{confirmation.tool} · you can undo this afterwards</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" data-testid="agent-confirm-decline" onClick={() => onConfirm(false)} className="h-7 rounded-md border border-border bg-background px-3 text-[12px] font-medium hover:bg-muted">
              Decline
            </button>
            <button type="button" data-testid="agent-confirm-approve" onClick={() => onConfirm(true)} className="h-7 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90">
              Approve
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {running && (
          <button type="button" data-testid="agent-stop" onClick={onStop} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium hover:bg-muted">
            <Square size={11} aria-hidden /> Stop
          </button>
        )}
        {canUndoRun && (
          <button type="button" data-testid="agent-undo-run" onClick={onUndoRun} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium hover:bg-muted">
            <Undo2 size={12} aria-hidden /> Undo this run
          </button>
        )}
        {running && <span data-testid="agent-activity" className="font-mono text-[11px] text-muted-foreground" aria-live="polite">{activity ?? "Working…"}</span>}
      </div>
    </div>
  );
};
