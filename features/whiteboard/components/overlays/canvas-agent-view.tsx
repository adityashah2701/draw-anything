"use client";

import * as React from "react";
import { Check, ShieldAlert, Square, Undo2, X } from "lucide-react";
import type { AgentUiMessage, PendingConfirmation } from "@/features/canvas-tools/editor/use-canvas-agent";

export const BOARD_EXAMPLES: Array<{ tag: string; text: string }> = [
  { tag: "Group", text: "Group the selected nodes and name the group" },
  { tag: "Align", text: "Align the selected cards vertically with equal spacing" },
  { tag: "Icon", text: "Change the database icon and make the nodes the same size" },
  { tag: "Tidy", text: "Clean up this diagram without changing what it says" },
  { tag: "Labels", text: "Rename the auth flow labels and re-route the connectors" },
];

const Step: React.FC<{ message: Extract<AgentUiMessage, { kind: "tool" }> }> = ({ message }) => (
  <li className="flex gap-2.5 py-1.5" data-testid="agent-step" data-ok={message.ok ? "true" : "false"} data-tool={message.tool}>
    <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${message.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}>
      {message.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
    </span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[11px] text-foreground">{message.tool}</span>
        {message.ok && message.changed > 0 && <span className="font-mono text-[10px] text-muted-foreground">{message.changed} changed</span>}
        {!message.ok && message.code && <span className="font-mono text-[10px] text-red-600">{message.code}</span>}
      </div>
      <p className="mt-0.5 break-words text-[12px] leading-snug text-muted-foreground">{message.summary}</p>
      {message.skipped > 0 && <p className="mt-0.5 text-[11px] text-amber-600">{message.skipped} left alone</p>}
      {message.warnings.slice(0, 2).map((warning) => (
        <p key={warning} className="mt-0.5 text-[11px] text-amber-600">
          {warning}
        </p>
      ))}
    </div>
  </li>
);

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
}

export const CanvasAgentView: React.FC<Props> = ({ messages, running, confirmation, onConfirm, onStop, onUndoRun, canUndoRun, onExample, disabled }) => {
  if (messages.length === 0) {
    return (
      <div className="px-5 py-5" data-testid="canvas-agent-empty">
        <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
          Ask for a change to this board. The assistant uses the same commands as the editor, so every step can be undone, and it tells you exactly what it did.
        </p>
        <h3 className="mt-7 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Try</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {BOARD_EXAMPLES.map(({ tag, text }) => (
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
      <ol className="space-y-3">
        {messages.map((message, index) => {
          if (message.kind === "user") {
            return (
              <li key={message.id} className="rounded-md bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-foreground" data-testid="agent-user">
                {message.text}
              </li>
            );
          }
          if (message.kind === "assistant") {
            return (
              <li key={message.id} className="text-[13px] leading-relaxed text-foreground" data-testid="agent-assistant">
                {message.text}
              </li>
            );
          }
          if (message.kind === "status") {
            return (
              <li
                key={message.id}
                data-testid="agent-status"
                data-tone={message.tone}
                className={`border-t border-border pt-2 font-mono text-[11px] ${message.tone === "ok" ? "text-muted-foreground" : message.tone === "warn" ? "text-amber-600" : "text-red-600"}`}
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
                  <Step key={step.id} message={step} />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {confirmation && (
        <div role="alertdialog" aria-label="Confirm" data-testid="agent-confirm" className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
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
        {running && <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">Working…</span>}
      </div>
    </div>
  );
};
