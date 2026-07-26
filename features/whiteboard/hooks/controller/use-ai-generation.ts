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
  AIWorkflowPhase,
} from "@/features/ai/types";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { toUserFacingMessage } from "@/features/ai/server/errors";

type LegacyAIEvent =
  | { type: "thought"; message: string }
  | { type: "element"; element: DrawingElement }
  | { type: "done"; count: number }
  | { type: "error"; message: string };

export interface AIChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  phase?: AIWorkflowPhase;
  timestamp: number;
  kind: "prompt" | "phase" | "element" | "error" | "success" | "thought";
}

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
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const seenElementIdsRef = useRef<Set<string>>(new Set());
  const activeFrameIdRef = useRef<string | null>(null);
  const messageIdCounterRef = useRef(0);

  const nextMessageId = useCallback(() => {
    messageIdCounterRef.current += 1;
    return `msg-${messageIdCounterRef.current}`;
  }, []);

  const addChatMessage = useCallback(
    (msg: Omit<AIChatMessage, "id" | "timestamp">) => {
      setAiMessages((prev) => [
        ...prev,
        { ...msg, id: nextMessageId(), timestamp: Date.now() },
      ]);
    },
    [nextMessageId],
  );

  const updateLastAgentMessage = useCallback(
    (updater: (msg: AIChatMessage) => AIChatMessage) => {
      setAiMessages((prev) => {
        const lastIdx = prev.length - 1;
        if (lastIdx < 0) return prev;
        const last = prev[lastIdx];
        if (last.role !== "agent") return prev;
        const updated = updater(last);
        return [...prev.slice(0, lastIdx), updated];
      });
    },
    [],
  );

  const clearAIMessages = useCallback(() => {
    setAiMessages([]);
    messageIdCounterRef.current = 0;
  }, []);
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
          addChatMessage({
            role: "agent",
            content: "AI Agent started. Analyzing your request...",
            kind: "phase",
          });
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
            addChatMessage({
              role: "agent",
              content: event.message,
              phase: event.phase,
              kind: "phase",
            });
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
          addChatMessage({
            role: "agent",
            content: event.report.valid
              ? "Diagram validation passed."
              : `Validation found ${event.report.issues.length} issue(s). Repairing...`,
            kind: "phase",
          });
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
          addChatMessage({
            role: "agent",
            content:
              event.notes.length > 0
                ? `Architecture review: ${event.notes.length} improvement note(s) found.`
                : "Architecture review passed.",
            kind: "phase",
          });
          return false;
        case "repair.applied":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiRepairPasses(event.pass);
          setAiThoughtPhase(event.summary);
          addChatMessage({
            role: "agent",
            content: event.summary,
            kind: "phase",
          });
          return false;
        case "node.created":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setAiCurrentNodeLabel(event.node.label);
          setAiThoughtPhase(`Created ${event.node.label}`);
          updateLastAgentMessage((msg) => {
            if (msg.kind === "element") {
              return {
                ...msg,
                content: `Placing elements (${msg.content.match(/\d+/)?.[0] ?? 0} done, now: ${event.node.label})...`,
              };
            }
            return msg;
          });
          return false;
        case "element.batch": {
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          event.elements.forEach(addGeneratedElement);
          const batchCount = event.elements.length;
          setAiMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].kind === "element" && prev[lastIdx].role === "agent") {
              const updated = {
                ...prev[lastIdx],
                content: `Placing elements on canvas (${aiPlacedCount + batchCount} total)...`,
              };
              return [...prev.slice(0, lastIdx), updated];
            }
            return prev;
          });
          return false;
        }
        case "frame.done":
          setAiFrameId(event.frameId);
          activeFrameIdRef.current = event.frameId;
          setIsAIGenerating(false);
          addChatMessage({
            role: "agent",
            content: `Done! ${event.count} elements placed on the canvas.`,
            kind: "success",
          });
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
          addChatMessage({
            role: "agent",
            content: event.message || "Error generating elements.",
            kind: "error",
          });
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
          addChatMessage({
            role: "agent",
            content: `Done! ${event.count} elements placed on the canvas.`,
            kind: "success",
          });
          toast.success(`AI successfully placed ${event.count} elements.`);
          onGenerationEnd?.();
          return true;
        case "error":
          addChatMessage({
            role: "agent",
            content: event.message || "Error generating elements.",
            kind: "error",
          });
          throw new Error(event.message || "Error generating elements.");
        default:
          return false;
      }
    },
    [
      addChatMessage,
      addGeneratedElement,
      aiPlacedCount,
      appendAICheckpoint,
      completeAIFrame,
      createAIFrame,
      failAIFrame,
      onGenerationEnd,
      persist,
      toConvexJson,
      updateLastAgentMessage,
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
      setAiMessages([]);
      messageIdCounterRef.current = 0;
      seenElementIdsRef.current = new Set();
      activeFrameIdRef.current = null;
      onGenerationStart?.();

      addChatMessage({
        role: "user",
        content: prompt.trim(),
        kind: "prompt",
      });

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
        const message = toUserFacingMessage(err);
        setAiError(message);
        setIsAIGenerating(false);
        addChatMessage({
          role: "agent",
          content: message,
          kind: "error",
        });
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
      addChatMessage,
      failAIFrame,
      getCanvasContext,
      handleEvent,
      isAIGenerating,
      onGenerationEnd,
      onGenerationStart,
      persist,
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
    aiMessages,
    clearAIMessages,
    triggerAIGeneration,
  };
};
