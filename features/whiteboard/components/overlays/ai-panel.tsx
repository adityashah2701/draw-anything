"use client";

import * as React from "react";
import { ArrowUp, Code2, Maximize, RotateCcw, X } from "lucide-react";
import type { AIModelProvider } from "@/features/ai/types";
import type { AIChatMessage } from "@/features/whiteboard/hooks/controller/use-ai-generation";
import { AGENT_WIDTH_CSS } from "@/features/whiteboard/components/overlays/panel-layout";
import { AITimeline } from "@/features/whiteboard/components/overlays/ai-timeline";
import { CanvasAgentView } from "@/features/whiteboard/components/overlays/canvas-agent-view";
import type { useCanvasAgent } from "@/features/canvas-tools/editor/use-canvas-agent";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  triggerAIGeneration: (prompt: string, model: AIModelProvider, edit?: boolean) => void;
  /** The board holds a diagram the agent could change. */
  canEdit?: boolean;
  isGenerating: boolean;
  messages: AIChatMessage[];
  /** What the agent is doing right now (the latest step's title). */
  workingLabel: string | null;
  disabled?: boolean;
  onClear: () => void;
  /** Open the code editor, optionally filled with the diagram that is on the canvas. */
  onOpenCode: (fromCanvas: boolean) => void;
  onFitToScreen: () => void;
  /** The tool-calling assistant that edits the board itself (see features/canvas-tools). */
  canvasAgent?: ReturnType<typeof useCanvasAgent>;
}

const PROVIDER_OPTIONS: Array<{ value: AIModelProvider; label: string }> = [
  { value: "gemini", label: "Gemini 3.8 Flash" },
  { value: "groq", label: "Groq · GPT-OSS 120B" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "nvidia", label: "NVIDIA · Nemotron" },
  { value: "local", label: "Local model" },
];

const EXAMPLES: Array<{ tag: string; text: string }> = [
  { tag: "Flow", text: "A user login with MFA and a retry after a failed password" },
  { tag: "Arch", text: "A web app backend with a CDN, API gateway, auth, orders service and Postgres" },
  { tag: "Net", text: "Network topology with a router, two switches and four hosts" },
  { tag: "UML", text: "Three related classes for an order system" },
  { tag: "Tree", text: "A decision tree for routing customer support tickets" },
  { tag: "Mind", text: "A mind map for planning a product launch" },
];

const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; text?: string }> = ({ label, text, children, ...props }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    {...props}
    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
  >
    {children}
    {text && <span>{text}</span>}
  </button>
);

/** What was asked. A long request is cut to three lines and opens on demand: the work below matters more. */
const RequestBlock: React.FC<{ prompt: string }> = ({ prompt }) => {
  const [open, setOpen] = React.useState(false);
  const long = prompt.length > 150;
  return (
    <section className="border-b border-border px-5 py-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Request</h3>
      <p className={`mt-1.5 text-[13px] leading-relaxed text-foreground ${long && !open ? "line-clamp-3" : ""}`}>{prompt}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </section>
  );
};

const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button
    type="button"
    {...props}
    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
);

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  triggerAIGeneration,
  canEdit = false,
  isGenerating,
  messages,
  workingLabel,
  disabled = false,
  onClear,
  onOpenCode,
  onFitToScreen,
  canvasAgent,
}) => {
  const [mode, setMode] = React.useState<"generate" | "board">(canvasAgent?.shared ? "board" : "generate");
  const board = mode === "board" && canvasAgent !== undefined;
  const [model, setModel] = React.useState<AIModelProvider>("gemini");
  // Providers the server has credentials for; null until known (then show all).
  const [available, setAvailable] = React.useState<AIModelProvider[] | null>(null);
  const [input, setInput] = React.useState("");
  // On by default when there is a diagram to change; switch it off to draw a separate new one.
  const [editCurrent, setEditCurrent] = React.useState(true);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);

  // Ask every time the panel opens: the server's keys can change (restart, new
  // .env.local) while the page stays open, and a stale list leaves a dead option.
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/ai/generate-diagram")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { providers?: AIModelProvider[] } | null) => {
        if (cancelled || !Array.isArray(data?.providers)) return;
        setAvailable(data.providers);
        setModel((current) => (data.providers!.includes(current) ? current : (data.providers![0] ?? current)));
      })
      .catch(() => {
        /* keep showing every provider; the server still validates */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen]);

  // Follow the run as it grows, unless the person has scrolled up to read.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, workingLabel, canvasAgent?.messages, canvasAgent?.confirmation]);

  const providerOptions = PROVIDER_OPTIONS.filter((o) => available === null || available.includes(o.value));
  const hasRun = board ? (canvasAgent?.messages.length ?? 0) > 0 : messages.length > 0;
  const prompt = messages.find((m) => m.kind === "prompt")?.content;
  const finished = !isGenerating && messages.some((m) => m.kind === "success" || m.noteKind === "summary" || m.noteKind === "stopped");
  const busy = board ? Boolean(canvasAgent?.running) : isGenerating;

  const send = (text: string) => {
    const value = text.trim();
    if (!value || disabled || busy) return;
    stickToBottom.current = true;
    if (board) void canvasAgent!.send(value, model);
    else triggerAIGeneration(value, model, canEdit && editCurrent);
    setInput("");
  };

  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="AI agent"
      style={{ width: AGENT_WIDTH_CSS }}
      className="fixed bottom-0 right-0 top-0 z-50 flex max-w-[100vw] flex-col border-l border-border bg-card text-card-foreground shadow-xl animate-in slide-in-from-right duration-150"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border pl-5 pr-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-none">Agent</h2>
          <label className="sr-only" htmlFor="agent-model">
            Model
          </label>
          <select
            id="agent-model"
            value={model}
            onChange={(e) => setModel(e.target.value as AIModelProvider)}
            disabled={providerOptions.length === 0 || busy}
            className="mt-1 block max-w-[220px] cursor-pointer truncate bg-transparent p-0 font-mono text-[11px] leading-none text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground disabled:cursor-default"
          >
            {providerOptions.length === 0 && <option value="">No AI provider configured</option>}
            {providerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center">
          <IconButton label="Open the diagram code editor" text="Code" onClick={() => onOpenCode(false)}>
            <Code2 size={14} />
          </IconButton>
          {hasRun && (
            <IconButton label="Clear this run" onClick={board ? canvasAgent!.clear : onClear} disabled={busy}>
              <RotateCcw size={14} />
            </IconButton>
          )}
          <IconButton label="Close the agent" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </header>

      {canvasAgent && (
        <div role="tablist" aria-label="What the assistant does" className="flex shrink-0 gap-1 border-b border-border px-3 py-1.5">
          {([
            ["generate", "Generate"],
            ["board", "Edit board"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              data-testid={`agent-tab-${value}`}
              onClick={() => setMode(value)}
              className={`h-6 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {board ? (
          <CanvasAgentView
            messages={canvasAgent!.messages}
            running={canvasAgent!.running}
            confirmation={canvasAgent!.confirmation}
            onConfirm={canvasAgent!.resolveConfirmation}
            onStop={canvasAgent!.stop}
            onUndoRun={() => void canvasAgent!.undoRun()}
            canUndoRun={canvasAgent!.canUndoRun}
            onExample={send}
            disabled={disabled}
            shared={canvasAgent!.shared}
          />
        ) : !hasRun ? (
          <div className="px-5 py-5">
            <p className="max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">
              Describe a diagram. The agent builds it on the canvas step by step, shows what it is thinking, then reviews its own work and fixes what looks wrong.
            </p>
            <h3 className="mt-7 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Try</h3>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {EXAMPLES.map(({ tag, text }) => (
                <li key={tag}>
                  <button
                    type="button"
                    disabled={disabled || isGenerating}
                    onClick={() => send(text)}
                    className="flex w-full items-baseline gap-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-50"
                  >
                    <span className="w-9 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{tag}</span>
                    <span className="text-[13px] leading-snug text-foreground">{text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {prompt && (
              <RequestBlock prompt={prompt} />
            )}
            <div className="pt-4">
              <AITimeline
                messages={messages}
                working={isGenerating ? (workingLabel ?? "") : null}
                closingActions={
                  finished ? (
                    <>
                      <ActionButton onClick={() => onOpenCode(true)}>
                        <Code2 size={13} />
                        Open as code
                      </ActionButton>
                      <ActionButton onClick={onFitToScreen}>
                        <Maximize size={13} />
                        Fit to view
                      </ActionButton>
                    </>
                  ) : undefined
                }
              />
            </div>
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="shrink-0 border-t border-border p-3"
      >
        <div className="rounded-lg border border-input bg-background transition-colors focus-within:border-foreground/40">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label={board ? "Describe a change to the board" : "Describe your diagram"}
            placeholder={busy ? "The agent is working…" : board ? "Describe a change to the board…" : canEdit && editCurrent ? "Describe a change to the diagram…" : hasRun ? "Describe another diagram…" : "Describe your diagram…"}
            rows={2}
            disabled={disabled || busy}
            className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className="flex items-center justify-between px-2 pb-2 pl-3">
            {board ? (
              <span className="font-mono text-[10px] text-muted-foreground">Edits use the editor&apos;s own commands</span>
            ) : canEdit ? (
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <input type="checkbox" checked={editCurrent} onChange={(e) => setEditCurrent(e.target.checked)} disabled={isGenerating} />
                Edit current diagram
              </label>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
            )}
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim() || disabled || busy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={15} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};
