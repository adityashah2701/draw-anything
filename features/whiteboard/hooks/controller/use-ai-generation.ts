import { useRef, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  AIGenerateDiagramRequest,
  AIModelProvider,
  AIStreamEvent,
  AIFrameCheckpoint,
  AIDiagramValidationReport,
  AICriticNote,
} from "@/features/ai/types";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

type LegacyAIEvent =
  | { type: "thought"; message: string }
  | { type: "element"; element: DrawingElement }
  | { type: "done"; count: number }
  | { type: "error"; message: string };

interface UseAIGenerationOptions {
  onAddElement: (element: DrawingElement) => void;
  onGenerationStart?: () => void;
  onGenerationEnd?: () => void;
  whiteboardId?: string;
  getCanvasContext?: () => AIGenerateDiagramRequest["canvasContext"];
}

export const useAIGeneration = ({
  onAddElement,
  onGenerationStart,
  onGenerationEnd,
  whiteboardId,
  getCanvasContext,
}: UseAIGenerationOptions) => {
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiThoughtPhase, setAiThoughtPhase] = useState<string | null>(null);
  const [aiPlacedCount, setAiPlacedCount] = useState(0);
  const [aiCurrentNodeLabel, setAiCurrentNodeLabel] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFrameId, setAiFrameId] = useState<string | null>(null);
  const [aiValidationReport, setAiValidationReport] =
    useState<AIDiagramValidationReport | null>(null);
  const [aiCheckpoints, setAiCheckpoints] = useState<AIFrameCheckpoint[]>([]);
  const [aiRepairPasses, setAiRepairPasses] = useState(0);
  const [aiCriticNotes, setAiCriticNotes] = useState<AICriticNote[]>([]);
  const seenElementIdsRef = useRef<Set<string>>(new Set());
  const activeFrameIdRef = useRef<string | null>(null);
  const createAIFrame = useMutation(api.aiFrames.create);
  const appendAICheckpoint = useMutation(api.aiFrames.appendCheckpoint);
  const completeAIFrame = useMutation(api.aiFrames.complete);
  const failAIFrame = useMutation(api.aiFrames.fail);

  const persist = useCallback((operation: Promise<unknown>) => {
    operation.catch((error) => {
      console.warn("[ai-generation] Failed to persist AI frame state", error);
    });
  }, []);

  const toConvexJson = useCallback(
    (value: unknown) => JSON.parse(JSON.stringify(value)),
    [],
  );

  const toUserFacingError = useCallback((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";

    if (
      message.includes("tool call validation failed") ||
      message.includes("parameters for tool") ||
      message.includes("failed_generation")
    ) {
      return "The AI provider returned a malformed diagram graph. Please try again.";
    }

    return message.length > 260 ? "AI generation failed. Please try again." : message;
  }, []);

  const addGeneratedElement = useCallback(
    (element: DrawingElement) => {
      if (seenElementIdsRef.current.has(element.id)) return;
      seenElementIdsRef.current.add(element.id);
      onAddElement(element);
      setAiCurrentNodeLabel(
        element.label || element.text || `Shape (${element.type})`,
      );
      setAiPlacedCount((count) => count + 1);
    },
    [onAddElement],
  );

  const handleEvent = useCallback(
    (event: AIStreamEvent | LegacyAIEvent) => {
      switch (event.type) {
        case "frame.created":
          setAiFrameId(event.frame.frameId);
          activeFrameIdRef.current = event.frame.frameId;
          setAiThoughtPhase("AI frame created");
          persist(
            createAIFrame({
              frameId: event.frame.frameId,
              whiteboardId: event.frame.whiteboardId,
              prompt: event.frame.prompt,
              provider: event.frame.provider,
              status: event.frame.status,
            }),
          );
          return false;
        case "phase.started":
        case "phase.completed":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiThoughtPhase(event.message);
          if (event.type === "phase.completed") {
            const checkpoint = {
              phase: event.phase,
              at: new Date().toISOString(),
              summary: event.message,
            };
            setAiCheckpoints((current) => [...current, checkpoint]);
            persist(
              appendAICheckpoint({
                frameId: event.frameId,
                phase: checkpoint.phase,
                summary: checkpoint.summary,
                at: checkpoint.at,
              }),
            );
          }
          return false;
        case "validation.report":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiValidationReport(event.report);
          setAiThoughtPhase(
            event.report.valid
              ? "Validation passed"
              : "Repairing validation issues",
          );
          return false;
        case "memory.loaded":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiThoughtPhase(
            event.memory.memories.length > 0
              ? `Loaded ${event.memory.memories.length} relevant memories`
              : "Loaded canvas context",
          );
          return false;
        case "requirements.extracted":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiThoughtPhase(
            `Extracted ${event.requirements.length} requirements`,
          );
          return false;
        case "infrastructure.expanded":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiThoughtPhase(
            event.addedNodeIds.length > 0
              ? `Added ${event.addedNodeIds.length} infrastructure components`
              : "No extra infrastructure needed",
          );
          return false;
        case "critic.report":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiCriticNotes(event.notes);
          setAiThoughtPhase(
            event.notes.length > 0
              ? `Review found ${event.notes.length} notes`
              : "Architecture review passed",
          );
          return false;
        case "repair.applied":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiRepairPasses(event.pass);
          setAiThoughtPhase(event.summary);
          return false;
        case "node.created":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiCurrentNodeLabel(event.node.label);
          setAiThoughtPhase(`Created ${event.node.label}`);
          return false;
        case "element.batch":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          event.elements.forEach(addGeneratedElement);
          return false;
        case "frame.done":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setIsAIGenerating(false);
          persist(
            completeAIFrame({
              frameId: event.frameId,
              finalElementIds: Array.from(seenElementIdsRef.current),
              finalGraph: toConvexJson(event.graph),
            }),
          );
          toast.success(`AI successfully placed ${event.count} elements.`);
          onGenerationEnd?.();
          return true;
        case "frame.error":
          activeFrameIdRef.current = event.frameId;
          persist(
            failAIFrame({
              frameId: event.frameId,
              message: event.message || "Error generating elements.",
            }),
          );
          throw new Error(event.message || "Error generating elements.");
        case "thought":
          setAiThoughtPhase(event.message);
          return false;
        case "element":
          addGeneratedElement(event.element);
          return false;
        case "done":
          setIsAIGenerating(false);
          toast.success(`AI successfully placed ${event.count} elements.`);
          onGenerationEnd?.();
          return true;
        case "error":
          throw new Error(event.message || "Error generating elements.");
        default:
          return false;
      }
    },
    [
      addGeneratedElement,
      appendAICheckpoint,
      completeAIFrame,
      createAIFrame,
      failAIFrame,
      onGenerationEnd,
      persist,
      toConvexJson,
    ],
  );

  const triggerAIGeneration = useCallback(
    async (prompt: string, model: AIModelProvider = "gemini") => {
      if (!prompt.trim() || isAIGenerating) return;

      setIsAIGenerating(true);
      setAiError(null);
      setAiFrameId(null);
      setAiValidationReport(null);
      setAiCheckpoints([]);
      setAiRepairPasses(0);
      setAiCriticNotes([]);
      setAiPlacedCount(0);
      setAiCurrentNodeLabel(null);
      setAiThoughtPhase("Analyzing prompt...");
      seenElementIdsRef.current = new Set();
      activeFrameIdRef.current = null;
      onGenerationStart?.();

      try {
        const response = await fetch("/api/ai/generate-diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            model,
            provider: model,
            whiteboardId,
            canvasContext: getCanvasContext?.(),
          } satisfies AIGenerateDiagramRequest),
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
              const parsed = JSON.parse(jsonStr) as AIStreamEvent | LegacyAIEvent;

              const shouldStop = handleEvent(parsed);
              if (shouldStop) {
                return;
              }
            } catch (e) {
              console.error("Error parsing SSE line:", e);
              throw e;
            }
          }
        }
      } catch (err) {
        const message = toUserFacingError(err);
        setAiError(message);
        setIsAIGenerating(false);
        if (activeFrameIdRef.current) {
          persist(
            failAIFrame({
              frameId: activeFrameIdRef.current,
              message,
            }),
          );
        }
        onGenerationEnd?.();
        toast.error("AI Generation Failed: " + message);
      }
    },
    [
      getCanvasContext,
      handleEvent,
      isAIGenerating,
      onGenerationStart,
      onGenerationEnd,
      toUserFacingError,
      whiteboardId,
    ]
  );

  return {
    isAIGenerating,
    aiThoughtPhase,
    aiPlacedCount,
    aiCurrentNodeLabel,
    aiError,
    aiFrameId,
    aiValidationReport,
    aiCheckpoints,
    aiRepairPasses,
    aiCriticNotes,
    triggerAIGeneration,
  };
};
