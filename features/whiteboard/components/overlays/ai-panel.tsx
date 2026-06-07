"use client";

import * as React from "react";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { Loader2, Sparkles, X, ChevronRight, Wand2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  triggerAIGeneration: (prompt: string, model: "gemini" | "groq") => void;
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

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  triggerAIGeneration,
  disabled = false,
}) => {
  const [model, setModel] = React.useState<"gemini" | "groq">("gemini");
  const [prompt, setPrompt] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setPrompt("");
    }
  }, [isOpen]);

  const handleGenerate = () => {
    if (!prompt.trim() || disabled) return;
    
    // Trigger background generation and immediately close the dialog
    triggerAIGeneration(prompt, model);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/40 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-500">
              <Wand2 size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                AI Agent
              </h2>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as "gemini" | "groq")}
                className="text-[11px] bg-transparent text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground p-0 mt-0.5"
              >
                <option value="gemini">Gemini 2.5 Flash</option>
                <option value="groq">Groq (Llama-3 70B)</option>
              </select>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Describe your diagram
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Microservice architecture with client, gateway API, microservices, and Postgres database."
              rows={4}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm"
            />
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Be as specific as possible.</span>
              <span>
                Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">⌘ Enter</kbd> to generate
              </span>
            </p>
          </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Suggestions
              </p>
              <div className="grid grid-cols-1 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-all border border-transparent hover:border-border hover:bg-muted/50 hover:text-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground/50 group-hover:text-violet-500 transition-colors"
                    />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
              </div>
            </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-3 bg-muted/30">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || disabled}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-medium text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Generate Diagram</span>
          </button>
        </div>
      </div>
    </>
  );
};
