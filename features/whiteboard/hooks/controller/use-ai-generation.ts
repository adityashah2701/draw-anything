import { useState, useCallback } from "react";
import { toast } from "sonner";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

interface UseAIGenerationOptions {
  onAddElement: (element: DrawingElement) => void;
  onGenerationStart?: () => void;
  onGenerationEnd?: () => void;
}

export const useAIGeneration = ({
  onAddElement,
  onGenerationStart,
  onGenerationEnd,
}: UseAIGenerationOptions) => {
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiThoughtPhase, setAiThoughtPhase] = useState<string | null>(null);
  const [aiPlacedCount, setAiPlacedCount] = useState(0);
  const [aiCurrentNodeLabel, setAiCurrentNodeLabel] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const triggerAIGeneration = useCallback(
    async (prompt: string, model: "gemini" | "groq" = "gemini") => {
      if (!prompt.trim() || isAIGenerating) return;

      setIsAIGenerating(true);
      setAiError(null);
      setAiPlacedCount(0);
      setAiCurrentNodeLabel(null);
      setAiThoughtPhase("Analyzing prompt...");
      onGenerationStart?.();

      try {
        const response = await fetch("/api/generate-diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim(), model }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to generate diagram.");
        }

        if (!response.body) {
          throw new Error("No response body received from server.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          // Keep the last partial line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.type === "thought") {
                setAiThoughtPhase(parsed.message);
              } else if (parsed.type === "element") {
                onAddElement(parsed.element);
                if (parsed.element.label) {
                  setAiCurrentNodeLabel(parsed.element.label);
                } else {
                  setAiCurrentNodeLabel(`Shape (${parsed.element.type})`);
                }
                setAiPlacedCount((c) => c + 1);
              } else if (parsed.type === "done") {
                setIsAIGenerating(false);
                toast.success(`✨ AI successfully placed ${parsed.count} elements!`);
                onGenerationEnd?.();
                return;
              } else if (parsed.type === "error") {
                throw new Error(parsed.message || "Error generating elements.");
              }
            } catch (e) {
              console.error("Error parsing SSE line:", e);
              throw e;
            }
          }
        }
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : "An unexpected error occurred."
        );
        setIsAIGenerating(false);
        onGenerationEnd?.();
        toast.error("AI Generation Failed: " + (err instanceof Error ? err.message : "Unknown error"));
      }
    },
    [isAIGenerating, onAddElement, onGenerationStart, onGenerationEnd]
  );

  return {
    isAIGenerating,
    aiThoughtPhase,
    aiPlacedCount,
    aiCurrentNodeLabel,
    aiError,
    triggerAIGeneration,
  };
};
