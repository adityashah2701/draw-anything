"use client";

import * as React from "react";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { Sparkles, X, Loader2, Wand2, ChevronRight } from "lucide-react";

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

  // Focus textarea when modal opens
  React.useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when closed
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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Wand2 size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  AI Diagram Generator
                </h2>
                <p className="text-sm text-white/70">
                  Powered by Groq · Llama 3.3 70B
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Prompt Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Describe your diagram
              </label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Draw a flowchart for a user registration process with email verification..."
                rows={4}
                disabled={isLoading}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Tip: Press{" "}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">
                  ⌘ Enter
                </kbd>{" "}
                to generate
              </p>
            </div>

            {/* Suggestions */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Quick suggestions
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-gray-600 hover:bg-violet-50 hover:text-violet-700 transition-colors group disabled:opacity-50"
                  >
                    <ChevronRight
                      size={14}
                      className="text-gray-300 group-hover:text-violet-400 flex-shrink-0"
                    />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
                <span className="text-red-500 text-base flex-shrink-0 mt-0.5">
                  ⚠
                </span>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading || disabled}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Generate Diagram
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIDiagramModal;
