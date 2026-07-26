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
        body: JSON.stringify({ prompt: prompt.trim(), model: "gemini" }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate diagram.");
      }

      if (!res.body) {
        throw new Error("No response body received from server.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const elements: DrawingElement[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === "element.batch") {
            elements.push(...(parsed.elements as DrawingElement[]));
          } else if (parsed.type === "element") {
            elements.push(parsed.element as DrawingElement);
          } else if (parsed.type === "frame.error" || parsed.type === "error") {
            throw new Error(parsed.message || "Failed to generate diagram.");
          }
        }
      }

      if (elements.length === 0) {
        throw new Error(
          "The AI returned an empty diagram. Try a different description.",
        );
      }

      const unique = Array.from(
        new Map(elements.map((element) => [element.id, element])).values(),
      );
      onGenerate(unique);
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
    <Sheet open={isOpen} onOpenChange={(open:boolean) => !open && onClose()}>
      <SheetContent
        side="right"
        className="z-[80] w-[420px] gap-0 border-l border-border bg-background p-0 sm:max-w-[420px] [&>[data-slot=sheet-close]]:top-4 [&>[data-slot=sheet-close]]:right-4 [&>[data-slot=sheet-close]]:rounded-md [&>[data-slot=sheet-close]]:text-foreground/85 [&>[data-slot=sheet-close]]:hover:bg-surface-secondary [&>[data-slot=sheet-close]]:hover:text-foreground [&>[data-slot=sheet-close]]:focus:ring-ring/40"
      >
        <SheetHeader className="space-y-0 border-b border-border bg-primary px-5 py-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15">
              <Wand2 size={20} className="text-primary-foreground" />
            </div>
            <div>
              <SheetTitle className="flex items-center gap-2 text-lg text-primary-foreground">
                AI Diagram Generator
              </SheetTitle>
              <SheetDescription className="text-sm text-primary-foreground/75">
                Powered by Groq · Llama 3.3 70B
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-5 px-5 py-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
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
                className="w-full resize-none rounded-xl border border-input bg-surface px-4 py-3 text-sm text-text placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: press <kbd className="rounded bg-muted px-1.5 py-0.5">⌘ Enter</kbd> to generate.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Suggestions
              </p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    disabled={isLoading}
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-text disabled:opacity-50"
                  >
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground group-hover:text-text"
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

        <SheetFooter className="mt-0 flex-row items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading || disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
