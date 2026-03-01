"use client";

import * as React from "react";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { Loader2, Sparkles, Wand2, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (elements: DrawingElement[]) => void;
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

export const AIDiagramModal: React.FC<AIDiagramModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  disabled = false,
}) => {
  const [prompt, setPrompt] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 120);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setPrompt("");
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading || disabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate diagram.");
      }

      if (!Array.isArray(data.elements) || data.elements.length === 0) {
        throw new Error(
          "The AI returned an empty diagram. Try a different description.",
        );
      }

      onGenerate(data.elements as DrawingElement[]);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="z-[80] w-[420px] gap-0 border-l border-slate-300 bg-slate-50 p-0 sm:max-w-[420px] [&>[data-slot=sheet-close]]:top-4 [&>[data-slot=sheet-close]]:right-4 [&>[data-slot=sheet-close]]:rounded-md [&>[data-slot=sheet-close]]:text-white/85 [&>[data-slot=sheet-close]]:hover:bg-white/15 [&>[data-slot=sheet-close]]:hover:text-white [&>[data-slot=sheet-close]]:focus:ring-white/40"
      >
        <SheetHeader className="space-y-0 border-b border-slate-300 bg-slate-900 px-5 py-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Wand2 size={20} className="text-white" />
            </div>
            <div>
              <SheetTitle className="flex items-center gap-2 text-lg text-white">
                AI Diagram Generator
              </SheetTitle>
              <SheetDescription className="text-sm text-white/75">
                Powered by Groq · Llama 3.3 70B
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-5 px-5 py-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Describe your diagram
              </label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. E-commerce system with API gateway, auth service, order service, payment provider, and database."
                rows={5}
                disabled={isLoading}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/30 disabled:opacity-60"
              />
              <p className="mt-2 text-xs text-slate-400">
                Tip: press <kbd className="rounded bg-slate-100 px-1.5 py-0.5">⌘ Enter</kbd> to generate.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Quick Suggestions
              </p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    disabled={isLoading}
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-50"
                  >
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-slate-400 group-hover:text-slate-700"
                    />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="mt-0 flex-row items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading || disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate Diagram
              </>
            )}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default AIDiagramModal;
