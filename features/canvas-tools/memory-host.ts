import { applyPatch, isEmptyPatch, type DocPatch } from "@/core/groups/patch";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import type { CanvasHost, GenerateOutcome, GenerateRequest, MemoryKind, DocumentInfo, ExportOutcome, ExportRequest, HostCapabilities, LoadOutcome, LoadSource, ViewportInfo } from "./types";

export interface MemoryHostOptions {
  elements?: readonly StoredElement[];
  selection?: readonly string[];
  document?: Partial<DocumentInfo>;
  viewport?: ViewportInfo | null;
  capabilities?: Partial<HostCapabilities>;
  /** What `load` answers, by whiteboard id; anything else is refused like an unauthorised board. */
  library?: Record<string, LoadOutcome>;
  /** Answers `requestConfirmation`; default approves. */
  approve?: (request: { tool: string; message: string }) => boolean;
  getBounds?: (shape: DrawingElement) => Bounds | null;
  /** Answers `generateDiagram`; enables the `generate` capability when given. */
  generate?: (request: GenerateRequest) => GenerateOutcome | Promise<GenerateOutcome>;
}

/**
 * A board in memory with the same contract as the editor host: one patch = one history entry, undo and redo
 * restore whole snapshots, selection and viewport are plain state. The tool tests and the scripted-model
 * integration tests run on it, so they exercise the real tools, executor and commands without a browser.
 */
export const createMemoryHost = (options: MemoryHostOptions = {}) => {
  let stored: StoredElement[] = [...(options.elements ?? [])];
  let selection: string[] = [...(options.selection ?? [])];
  const past: StoredElement[][] = [];
  const future: StoredElement[][] = [];
  let counter = 0;
  const document: DocumentInfo = { id: "memory-board", title: "Memory board", canEdit: true, ...options.document };
  const calls = { saves: 0, fits: [] as Array<Bounds | null>, exports: [] as ExportRequest[], confirmations: [] as Array<{ tool: string; message: string }>, generates: [] as GenerateRequest[], remembered: [] as Array<{ kind: MemoryKind; text: string }>, loads: [] as LoadSource[] };

  const capabilities: HostCapabilities = { history: true, selection: true, viewport: true, save: true, load: true, export: true, confirm: true, generate: Boolean(options.generate), memory: true, ...options.capabilities };

  const host: CanvasHost = {
    capabilities,
    getStored: () => stored,
    getSelection: () => selection,
    getViewport: () => (options.viewport === undefined ? { zoom: 1, pan: { x: 0, y: 0 }, width: 1200, height: 800 } : options.viewport),
    getDocument: () => document,
    newId: () => `m${(counter += 1).toString(36)}`,
    getBounds: options.getBounds,
    applyPatch: (patch: DocPatch) => {
      if (isEmptyPatch(patch)) return;
      past.push(stored);
      future.length = 0;
      stored = applyPatch(stored, patch);
      selection = selection.filter((id) => stored.some((item) => item.id === id));
    },
    setSelection: (ids) => {
      selection = ids.filter((id) => stored.some((item) => item.id === id));
    },
    undo: async () => {
      const previous = past.pop();
      if (!previous) return { changed: false };
      future.push(stored);
      stored = previous;
      selection = selection.filter((id) => stored.some((item) => item.id === id));
      return { changed: true };
    },
    redo: async () => {
      const next = future.pop();
      if (!next) return { changed: false };
      past.push(stored);
      stored = next;
      return { changed: true };
    },
    fitView: (bounds) => {
      calls.fits.push(bounds);
    },
    save: async () => {
      calls.saves += 1;
      return { saved: true, message: "Saved." };
    },
    load: async (source) => {
      calls.loads.push(source);
      if (source.kind === "whiteboard") {
        const found = options.library?.[source.id];
        if (!found) throw new Error("You do not have access to that whiteboard.");
        return found;
      }
      const parsed = JSON.parse(source.content) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Not a saved board.");
      return { elements: parsed as StoredElement[] };
    },
    exportDiagram: async (request): Promise<ExportOutcome> => {
      calls.exports.push(request);
      return { filename: `board.${request.format}`, mime: request.format === "png" ? "image/png" : request.format === "svg" ? "image/svg+xml" : "application/pdf", bytes: 1024, width: 800, height: 600 };
    },
    ...(options.generate
      ? {
          generateDiagram: async (request: GenerateRequest) => {
            calls.generates.push(request);
            return options.generate!(request);
          },
        }
      : {}),
    remember: async (entry) => {
      const duplicate = calls.remembered.some((m) => m.text.toLowerCase() === entry.text.toLowerCase());
      if (!duplicate) calls.remembered.push(entry);
      return { duplicate };
    },
    requestConfirmation: async (request) => {
      calls.confirmations.push(request);
      return options.approve ? options.approve(request) : true;
    },
  };

  return {
    host,
    calls,
    document,
    /** Replace the board as if a collaborator edited it (not a history entry of this client). */
    external(next: readonly StoredElement[]) {
      stored = [...next];
    },
    get stored() {
      return stored;
    },
    get selection() {
      return selection;
    },
    historyDepth: () => ({ undo: past.length, redo: future.length }),
  };
};

export type MemoryHost = ReturnType<typeof createMemoryHost>;
