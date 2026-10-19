"use client";

import { useConvex, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AIModelProvider } from "@/features/ai/types";
import { coveredByPanels } from "@/features/whiteboard/components/overlays/panel-layout";
import { downloadBlob, exportFilename } from "@/features/whiteboard/export/deliver";
import { exportScene } from "@/features/whiteboard/export/export-scene";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { createTurnClient } from "../agent/client";
import { unifiedAgentClientEnabled } from "../agent/flags";
import { parseHistory, trimHistory } from "../agent/history";
import { describeRun, runCanvasAgent, type AgentEvent } from "../agent/run-agent";
import type { CanvasMessage } from "../agent/types";
import { revisionOf } from "../revision";
import { createCanvasTools } from "../runtime";
import type { ExportRequest } from "../types";
import { createEditorHost } from "./editor-host";
import { generateElements } from "./generate-client";
import { fromRows, toRow } from "./persisted-messages";

export type AgentUiMessage =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; tool: string; ok: boolean; summary: string; changed: number; skipped: number; warnings: string[]; code?: string }
  | { id: string; kind: "status"; text: string; tone: "ok" | "warn" | "error" };

export interface PendingConfirmation {
  tool: string;
  message: string;
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The AI canvas agent for the open board: the loop, the host over the live editor, the transcript the panel
 * shows, and the confirmation the person gives for destructive steps. Everything the agent does goes through
 * the controller's own storage mutation (one undo step per tool call) and the same command planners as the
 * editor's menus.
 */
export const useCanvasAgent = (controller: WhiteboardPageController) => {
  const convex = useConvex();
  // Feature flag: one shared conversation per board, plus the generate and memory tools. Off = the previous behaviour.
  const unified = unifiedAgentClientEnabled();
  const boardId = String(controller.whiteboard?._id ?? "");
  const stored = useQuery(api.aiConversation.get, unified && boardId ? { whiteboardId: boardId } : "skip");
  const latest = useRef(controller);
  latest.current = controller;

  // The editor's selection is React state; the tools set it and read it back inside one async run, so it also lives here.
  const selectionRef = useRef<string[]>(controller.selectedElements);
  const seenSelection = useRef(controller.selectedElements);
  if (seenSelection.current !== controller.selectedElements) {
    seenSelection.current = controller.selectedElements;
    selectionRef.current = controller.selectedElements;
  }

  const [messages, setMessages] = useState<AgentUiMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [lastRun, setLastRun] = useState<{ steps: number; revision: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const providerRef = useRef<AIModelProvider | undefined>(undefined);
  const messagesRef = useRef<AgentUiMessage[]>([]);
  messagesRef.current = messages;
  const importedFor = useRef<string | null>(null);
  const confirmRef = useRef<((approved: boolean) => void) | null>(null);
  const historyRef = useRef<CanvasMessage[]>([]);
  const counter = useRef(0);
  const nextId = () => `agent-${(counter.current += 1)}`;

  const resolveConfirmation = useCallback((approved: boolean) => {
    confirmRef.current?.(approved);
    confirmRef.current = null;
    setConfirmation(null);
  }, []);

  // Closing the panel or leaving the page while a question is open answers "no": destructive steps fail closed.
  useEffect(() => () => confirmRef.current?.(false), []);

  // The model-facing history is the board's, so a collaborator's earlier turns are part of the context.
  const storedHistory = stored?.history ?? null;
  useEffect(() => {
    if (unified && !running) historyRef.current = parseHistory(storedHistory);
  }, [unified, running, storedHistory]);

  // Bring the board's legacy generation history into the conversation once. It only copies; `aiFrames` is untouched.
  const loaded = stored !== undefined && stored !== null;
  useEffect(() => {
    if (!unified || !loaded || !boardId || importedFor.current === boardId) return;
    importedFor.current = boardId;
    convex.mutation(api.aiConversation.importLegacyFrames, { whiteboardId: boardId }).catch((error) => console.warn("[canvas-agent] legacy history import failed:", error));
  }, [unified, loaded, boardId, convex]);

  const savedMessages = useMemo(() => (stored ? fromRows(stored.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, ui: m.ui }))) : []), [stored]);

  const host = useMemo(
    () =>
      createEditorHost({
        stored: () => latest.current.readLiveStored(),
        applyPatch: (patch) => latest.current.applyDocPatch(patch),
        selection: {
          get: () => selectionRef.current,
          set: (ids) => {
            selectionRef.current = ids;
            latest.current.setSelectedElements(ids);
          },
        },
        viewport: () => {
          const { canvasViewport } = latest.current;
          return { zoom: canvasViewport.zoom, pan: canvasViewport.panOffset, width: canvasViewport.canvasSize.width, height: canvasViewport.canvasSize.height };
        },
        document: () => {
          const c = latest.current;
          return { id: String(c.whiteboard?._id ?? "board"), title: c.whiteboard?.title, canEdit: c.whiteboardAccess.hasEditAccess };
        },
        newId: () => latest.current.generateId(),
        bounds: (shape) => latest.current.getElementBounds(shape as DrawingElement),
        history: { undo: () => latest.current.history.undo(), redo: () => latest.current.history.redo() },
        fit: (bounds) => {
          const c = latest.current;
          // The agent panel is open while this runs: fit into what it leaves free, as the generator does.
          if (bounds) c.canvasViewport.fitToBounds(bounds, { rightInset: coveredByPanels(c.showAIModal, c.showCodePanel) });
          else c.handleFitToScreen();
        },
        save: async () => {
          await latest.current.whiteboardAutoSave.saveWhiteboard();
          // saveWhiteboard reports through toasts; read the outcome from the save state a moment later.
          for (let i = 0; i < 20; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const state = latest.current.whiteboardAutoSave;
            if (state.saveError) return { saved: false, message: "The board could not be saved." };
            if (!state.hasPendingChanges && !state.isSaving) return { saved: true, message: "Saved." };
          }
          return { saved: false, message: "The save did not finish in time; the board will keep trying automatically." };
        },
        loadBoard: async (id) => {
          const board = await convex.query(api.whiteboard.getById, { id: id as Id<"whiteboards"> });
          return board ? { content: board.content, title: board.title } : null;
        },
        exportBoard: async (request: ExportRequest) => {
          const c = latest.current;
          const result = await exportScene({
            elements: c.elements,
            selectedIds: request.ids ?? [],
            options: { format: request.format, scale: request.scale, transparent: request.transparent, selectionOnly: Boolean(request.ids?.length) },
            title: c.whiteboard?.title,
          });
          const filename = exportFilename(c.whiteboard?.title, result.extension);
          downloadBlob(result.blob, filename);
          return { filename, mime: result.blob.type, bytes: result.blob.size, width: result.width, height: result.height };
        },
        ...(unified
          ? {
              generate: (request: { description: string; diagramType?: string }) =>
                generateElements({ whiteboardId: String(latest.current.whiteboard?._id ?? ""), provider: providerRef.current, description: request.description, diagramType: request.diagramType, signal: abortRef.current?.signal }),
              remember: async (entry: { kind: "preference" | "correction" | "decision" | "fact"; text: string }) => {
                const saved = await convex.mutation(api.aiMemory.remember, { whiteboardId: String(latest.current.whiteboard?._id ?? ""), ...entry });
                return { duplicate: saved.duplicate };
              },
            }
          : {}),
        confirm: (request) =>
          new Promise<boolean>((resolve) => {
            confirmRef.current?.(false);
            confirmRef.current = resolve;
            setConfirmation(request);
          }),
      }),
    [convex, unified],
  );

  const record = useCallback((event: AgentEvent) => {
    if (event.type === "calling") {
      const names = event.calls.map((c) => c.name);
      setActivity(names.includes("generate_diagram") ? "Generating the diagram…" : names.length === 1 ? `Running ${names[0]}…` : `Running ${names.length} steps…`);
    } else if (event.type === "assistant") {
      setActivity(null);
      setMessages((prev) => [...prev, { id: nextId(), kind: "assistant", text: event.text }]);
    } else if (event.type === "tool") {
      const { result } = event;
      setActivity(null);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          kind: "tool",
          tool: result.tool,
          ok: result.ok,
          summary: result.summary,
          changed: result.affected.created.length + result.affected.updated.length + result.affected.removed.length,
          skipped: result.skipped?.length ?? 0,
          warnings: result.warnings ?? [],
          code: result.error?.code,
        },
      ]);
    }
  }, []);

  /** Writes this run's transcript and model history to the board's conversation, then drops the local copy (it now comes back from the query). */
  const persistRun = useCallback(
    async (whiteboardId: string) => {
      await nextTick(); // let the last transcript line reach messagesRef
      const rows = messagesRef.current.map(toRow);
      if (rows.length === 0) return;
      try {
        const history = JSON.stringify(historyRef.current);
        for (let i = 0; i < rows.length; i += 40) {
          const last = i + 40 >= rows.length;
          await convex.mutation(api.aiConversation.append, { whiteboardId, messages: rows.slice(i, i + 40), ...(last ? { history } : {}) });
        }
        setMessages([]);
      } catch (error) {
        // Keep the local transcript so nothing the person just saw disappears; the next run tries again.
        console.warn("[canvas-agent] could not save the conversation:", error);
        toast.error("The assistant's conversation could not be saved for your collaborators.");
      }
    },
    [convex],
  );

  const send = useCallback(
    async (prompt: string, provider?: AIModelProvider, model?: string) => {
      const text = prompt.trim();
      const c = latest.current;
      if (!text || running) return;
      if (!c.whiteboardAccess.hasEditAccess) {
        toast.error("You don't have permission to change this whiteboard.");
        return;
      }
      const whiteboardId = String(c.whiteboard?._id ?? "");
      if (!whiteboardId) return;

      setMessages((prev) => [...prev, { id: nextId(), kind: "user", text }]);
      providerRef.current = provider;
      setRunning(true);
      setLastRun(null);
      const abort = new AbortController();
      abortRef.current = abort;
      await nextTick();

      const executor = createCanvasTools({
        host,
        session: { log: (event) => console.info("[canvas-agent]", JSON.stringify({ tool: event.tool, ok: event.ok, code: event.code, ms: event.ms, created: event.created, updated: event.updated, removed: event.removed })) },
      });
      const startRevision = revisionOf(host.getStored());
      try {
        const run = await runCanvasAgent({
          prompt: text,
          history: historyRef.current,
          executor,
          unified,
          callTurn: createTurnClient({ whiteboardId, provider, model, signal: abort.signal }),
          signal: abort.signal,
          onEvent: record,
        });
        historyRef.current = trimHistory(run.messages);
        const tone = run.status === "done" && run.totals.failed === 0 ? "ok" : run.status === "done" ? "warn" : run.status === "aborted" ? "warn" : "error";
        const lead = run.status === "done" ? "" : run.status === "aborted" ? "Stopped. " : `${run.error ?? "The run did not finish."} `;
        setMessages((prev) => [...prev, { id: nextId(), kind: "status", tone, text: `${lead}${describeRun(run)}` }]);
        const endRevision = revisionOf(host.getStored());
        const writes = run.results.filter((r) => r.ok && (r.affected.created.length + r.affected.updated.length + r.affected.removed.length > 0)).length;
        if (writes > 0 && endRevision !== startRevision) setLastRun({ steps: writes, revision: endRevision });
      } finally {
        abortRef.current = null;
        setActivity(null);
        if (unified) await persistRun(whiteboardId);
        setRunning(false);
      }
    },
    [host, record, running, unified, persistRun],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    resolveConfirmation(false);
  }, [resolveConfirmation]);

  const clear = useCallback(() => {
    if (running) return;
    setMessages([]);
    historyRef.current = [];
    setLastRun(null);
    if (unified && boardId) convex.mutation(api.aiConversation.clear, { whiteboardId: boardId }).catch((error) => console.warn("[canvas-agent] could not clear the conversation:", error));
  }, [running, unified, boardId, convex]);

  /** Undo what the last run changed: only while the board is exactly as that run left it, so nobody else's edit is undone with it. */
  const undoRun = useCallback(async () => {
    if (!lastRun) return;
    if (revisionOf(host.getStored()) !== lastRun.revision) {
      toast.error("The board changed after the assistant finished, so it was not undone. Use Undo to step back manually.");
      setLastRun(null);
      return;
    }
    for (let i = 0; i < lastRun.steps; i += 1) await host.undo?.();
    setLastRun(null);
    setMessages((prev) => [...prev, { id: nextId(), kind: "status", tone: "ok", text: `Undid ${lastRun.steps} change${lastRun.steps === 1 ? "" : "s"}.` }]);
  }, [host, lastRun]);

  return { messages: unified ? [...savedMessages, ...messages] : messages, shared: unified, activity, running, send, stop, clear, undoRun, canUndoRun: lastRun !== null && !running, confirmation, resolveConfirmation };
};

