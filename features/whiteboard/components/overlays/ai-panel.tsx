"use client";

import * as React from "react";
import {
  X,
  ChevronRight,
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { AIModelProvider } from "@/features/ai/types";
import type { AIChatMessage } from "@/features/whiteboard/hooks/controller/use-ai-generation";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  triggerAIGeneration: (prompt: string, model: AIModelProvider) => void;
  isGenerating: boolean;
  messages: AIChatMessage[];
  disabled?: boolean;
}

const SUGGESTIONS = [
  "Flowchart for a user login process",
  "System architecture with frontend, backend, and database",
  "Mind map for a project plan",
  "UML class diagram with three related classes",
  "Network topology with 4 connected nodes",
  "Decision tree for customer support",
];

const PHASE_LABELS: Record<string, string> = {
  contextRetriever: "Loading context",
  architecturePlanner: "Planning architecture",
  domainModeler: "Modeling domains",
  infrastructureExpander: "Expanding infrastructure",
  relationshipAgent: "Mapping relationships",
  intermediateCompile: "Rendering elements",
  criticAgent: "Reviewing architecture",
  expansionAgent: "Expanding diagram",
  repairAgent: "Repairing issues",
  canvasCompiler: "Finalizing diagram",
};

function formatPhaseName(phase?: string): string {
  if (!phase) return "";
  return PHASE_LABELS[phase] || phase.replace(/([A-Z])/g, " $1").trim();
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  triggerAIGeneration,
  isGenerating,
  messages,
  disabled = false,
}) => {
  const [model, setModel] = React.useState<AIModelProvider>("gemini");
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const hasSentRef = React.useRef(false);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const hasMessages = messages.length > 0;

  React.useEffect(() => {
    if (!isOpen) {
      hasSentRef.current = false;
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || disabled || isGenerating) return;
    hasSentRef.current = true;
    triggerAIGeneration(input, model);
    setInput("");
  };

  const handleSuggestionClick = (s: string) => {
    setInput(s);
    hasSentRef.current = true;
    triggerAIGeneration(s, model);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-card border-l border-border shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-500">
            <Wand2 size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Agent</h2>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AIModelProvider)}
              className="text-[11px] bg-transparent text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground p-0 mt-0.5"
            >
                <option value="gemini">Gemini 3.5 Flash</option>
              <option value="groq">Groq (Llama-3 70B)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="local">Local</option>
            </select>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages / Suggestions */}
      <div className="flex-1 flex flex-col min-h-0">
        {!hasMessages ? (
          /* Empty state: suggestions */
          <div className="flex-1 flex flex-col justify-center p-5 space-y-5">
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                What would you like to build?
              </p>
              <p className="text-xs text-muted-foreground">
                Describe a diagram and the AI will create it on your canvas.
              </p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  disabled={disabled || isGenerating}
                  className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-all border border-transparent hover:border-border hover:bg-muted/50 hover:text-foreground disabled:opacity-50 cursor-pointer"
                >
                  <ChevronRight
                    size={12}
                    className="shrink-0 text-muted-foreground/50 group-hover:text-violet-500 transition-colors"
                  />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Chat messages */
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse pl-1">
                <Loader2 size={12} className="animate-spin" />
                <span>Working...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isGenerating
                ? "Generating..."
                : "Describe your diagram..."
            }
            rows={1}
            disabled={disabled || isGenerating}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm max-h-32 min-h-[40px]"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled || isGenerating}
            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] border border-border">Enter</kbd> to send, <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] border border-border">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
};

// ─── Chat Message Bubble ──────────────────────────────────────────────────────

function ChatMessage({ message }: { message: AIChatMessage }) {
  const isUser = message.role === "user";

  const icon = (() => {
    switch (message.kind) {
      case "error":
        return <AlertCircle size={14} className="text-destructive shrink-0" />;
      case "success":
        return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
      case "element":
        return <Loader2 size={14} className="text-violet-400 shrink-0 animate-spin" />;
      default:
        return null;
    }
  })();

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-start">
      <div className="mt-0.5">
        {icon || (
          <div className="w-3.5 h-3.5 rounded-full bg-violet-500/20 border border-violet-500/30 shrink-0" />
        )}
      </div>
      <div className="max-w-[85%] min-w-0">
        {message.phase && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-violet-500/80 mb-0.5 block">
            {formatPhaseName(message.phase)}
          </span>
        )}
        <p
          className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
            message.kind === "error"
              ? "text-destructive"
              : message.kind === "success"
                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                : "text-foreground/80"
          }`}
        >
          {message.content}
        </p>
      </div>
    </div>
  );
}
