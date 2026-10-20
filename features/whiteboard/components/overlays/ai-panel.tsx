"use client";

import * as React from "react";
import { ArrowUp, Code2, ImagePlus, RotateCcw, X } from "lucide-react";
import type { AIModelProvider } from "@/features/ai/types";
import { DEFAULT_AI_PROVIDER } from "@/features/ai/default-provider";
import { NVIDIA_MODELS, isSelectableNvidiaModel, modelSupportsVision } from "@/features/ai/nvidia-models";
import { AGENT_WIDTH_CSS } from "@/features/whiteboard/components/overlays/panel-layout";
import { CanvasAgentView } from "@/features/whiteboard/components/overlays/canvas-agent-view";
import { IMAGE_TYPES, MAX_IMAGES } from "@/features/canvas-tools/agent/images";
import { imageFilesOf, useImageAttachments } from "@/features/whiteboard/components/overlays/use-image-attachments";
import type { useCanvasAgent } from "@/features/canvas-tools/editor/use-canvas-agent";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
  /** Open the code editor, optionally filled with the diagram that is on the canvas. */
  onOpenCode: (fromCanvas: boolean) => void;
  onFitToScreen: () => void;
  /** The tool-calling assistant that draws and edits the board (see features/canvas-tools). */
  canvasAgent: ReturnType<typeof useCanvasAgent>;
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

/** Experimental NVIDIA models are variants of the nvidia provider. */
const NVIDIA_VARIANTS = NVIDIA_MODELS.filter((m) => m.experimental);
const variantKey = (id: string) => `nvidia:${id}`;
/** A select value is a provider, or `nvidia:<model id>`. */
const parseChoice = (choice: string): { provider: AIModelProvider; model?: string } => {
  const m = /^nvidia:(.+)$/.exec(choice);
  return m && isSelectableNvidiaModel(m[1]) ? { provider: "nvidia", model: m[1] } : { provider: choice as AIModelProvider };
};

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

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  disabled = false,
  onOpenCode,
  onFitToScreen,
  canvasAgent,
}) => {
  const [choice, setChoice] = React.useState<string>(DEFAULT_AI_PROVIDER);
  const { provider: model, model: variant } = parseChoice(choice);
  // Providers the server has credentials for; null until known (then show all).
  const [available, setAvailable] = React.useState<AIModelProvider[] | null>(null);
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
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
        setChoice((current) => (data.providers!.includes(parseChoice(current).provider) ? current : (data.providers![0] ?? current)));
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
  }, [canvasAgent.messages, canvasAgent.confirmation]);

  const providerOptions = PROVIDER_OPTIONS.filter((o) => available === null || available.includes(o.value));
  const hasRun = canvasAgent.messages.length > 0;
  const lockedBy = canvasAgent.lockedBy;
  const lockedText = lockedBy ? (lockedBy.mine ? "The assistant is working for you in another tab…" : `${lockedBy.name} is using the assistant…`) : null;
  const busy = canvasAgent.running || lockedBy !== null;

  // A model that cannot read them is named here, and the server never sends them to one.
  const canAttach = model !== "local";
  const attachments = useImageAttachments(canAttach);
  const textOnly = !modelSupportsVision(model, variant);
  const attachHint = model === "local" ? "The local model cannot read images." : textOnly ? "This model cannot read images, so NVIDIA Nemotron reads them for this request." : null;

  const send = (text: string) => {
    const images = canAttach ? attachments.items.map((item) => item.url) : [];
    const value = text.trim() || (images.length > 0 ? `Use the attached ${images.length === 1 ? "image" : "images"}.` : "");
    if (!value || disabled || busy || attachments.busy) return;
    stickToBottom.current = true;
    void canvasAgent.send(value, model, variant, images);
    setInput("");
    attachments.clear();
  };

  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="AI agent"
      style={{ width: AGENT_WIDTH_CSS }}
      className="fixed bottom-0 right-0 top-0 z-50 flex max-w-[100vw] flex-col border-l border-border bg-card text-card-foreground shadow-popover animate-in slide-in-from-right duration-150"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border pl-5 pr-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold leading-none">
            <span aria-hidden className="size-1.5 rounded-full bg-agent" />
            Agent
          </h2>
          <label className="sr-only" htmlFor="agent-model">
            Model
          </label>
          <select
            id="agent-model"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={providerOptions.length === 0 || busy}
            className="mt-1 block max-w-[220px] cursor-pointer truncate bg-transparent p-0 font-mono text-[11px] leading-none text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground disabled:cursor-default"
          >
            {providerOptions.length === 0 && <option value="">No AI provider configured</option>}
            {providerOptions.map((o) => (
              <React.Fragment key={o.value}>
                <option value={o.value}>{o.label}</option>
                {o.value === "nvidia" && NVIDIA_VARIANTS.map((m) => <option key={m.id} value={variantKey(m.id)}>{m.label}</option>)}
              </React.Fragment>
            ))}
          </select>
        </div>
        <div className="flex items-center">
          <IconButton label="Open the diagram code editor" text="Code" onClick={() => onOpenCode(false)}>
            <Code2 size={14} />
          </IconButton>
          {hasRun && (
            <IconButton label="Clear this run" onClick={canvasAgent.clear} disabled={busy}>
              <RotateCcw size={14} />
            </IconButton>
          )}
          <IconButton label="Close the agent" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <CanvasAgentView
          messages={canvasAgent.messages}
          running={canvasAgent.running}
          confirmation={canvasAgent.confirmation}
          onConfirm={canvasAgent.resolveConfirmation}
          onStop={canvasAgent.stop}
          onUndoRun={() => void canvasAgent.undoRun()}
          canUndoRun={canvasAgent.canUndoRun}
          onExample={send}
          disabled={disabled}
          activity={canvasAgent.activity}
          onFit={onFitToScreen}
          onOpenCode={() => onOpenCode(true)}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        onDragOver={(e) => {
          if (!canAttach || busy || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          const files = imageFilesOf(e.dataTransfer);
          if (!canAttach || busy || files.length === 0) return;
          e.preventDefault();
          void attachments.add(files);
        }}
        className="shrink-0 border-t border-border p-3"
      >
        <div data-testid="agent-composer" data-dragging={dragging ? "true" : "false"} className={`rounded-lg border bg-background transition-colors focus-within:border-foreground/40 ${dragging ? "border-foreground/60 bg-muted/40" : "border-input"}`}>
          {attachments.items.length > 0 && (
            <ul data-testid="agent-attachments" className="flex flex-wrap gap-2 px-3 pt-2.5">
              {attachments.items.map((item) => (
                <li key={item.id} className="group relative h-12 w-12 overflow-hidden rounded-md border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not something next/image can optimise */}
                  <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    data-testid="agent-attachment-remove"
                    onClick={() => attachments.remove(item.id)}
                    className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attachHint && attachments.items.length > 0 && (
            <p data-testid="agent-attach-hint" className="px-3 pt-1.5 font-mono text-[10px] leading-snug text-warning">
              {attachHint}
            </p>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = imageFilesOf(e.clipboardData);
              if (!canAttach || busy || files.length === 0) return;
              e.preventDefault();
              void attachments.add(files);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Describe a diagram or a change to the board"
            placeholder={lockedText ?? (busy ? "The agent is working…" : "Describe a diagram or a change…")}
            rows={2}
            disabled={disabled || busy}
            className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className="flex items-center justify-between px-2 pb-2 pl-3">
            <span className="font-mono text-[10px] text-muted-foreground">Edits use the editor&apos;s own commands</span>
            <div className="flex items-center gap-1">
            {canAttach && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  multiple
                  hidden
                  data-testid="agent-file-input"
                  onChange={(e) => {
                    void attachments.add(e.target.files ?? []);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-label={`Attach images (up to ${MAX_IMAGES})`}
                  title={attachHint ?? `Attach images (up to ${MAX_IMAGES}), or paste or drop them`}
                  data-testid="agent-attach"
                  disabled={disabled || busy || attachments.items.length >= MAX_IMAGES}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImagePlus size={15} />
                </button>
              </>
            )}
            <button
              type="submit"
              aria-label="Send"
              disabled={(!input.trim() && attachments.items.length === 0) || disabled || busy || attachments.busy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-agent text-agent-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agent focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={15} strokeWidth={2.25} />
            </button>
            </div>
          </div>
        </div>
      </form>
    </aside>
  );
};
