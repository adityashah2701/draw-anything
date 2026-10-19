import { isGroupRecord } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { revisionOf } from "../revision";
import type { CanvasHost, DocumentInfo, GenerateOutcome, GenerateRequest, MemoryKind, ExportOutcome, ExportRequest, LoadOutcome, LoadSource, ViewportInfo } from "../types";

/** What the host needs from the running editor; each is read at the moment of the call, never captured. */
export interface EditorHandles {
  /** The board right now, read from shared storage. */
  stored(): readonly StoredElement[];
  /** One storage mutation = one undo step. */
  applyPatch(patch: DocPatch): void;
  selection: { get(): string[]; set(ids: string[]): void };
  viewport(): ViewportInfo | null;
  document(): DocumentInfo;
  newId(): string;
  bounds(shape: DrawingElement): Bounds | null;
  history: { undo(): void; redo(): void };
  fit(bounds: Bounds | null): void;
  save(): Promise<{ saved: boolean; message?: string }>;
  /** Another whiteboard, as Convex returns it to this user: null when it does not exist or is not theirs. */
  loadBoard(id: string): Promise<{ content?: string; title?: string } | null>;
  exportBoard(request: ExportRequest): Promise<ExportOutcome>;
  /** Asks the person; resolves false when they decline or when no one can be asked. */
  confirm(request: { tool: string; message: string }): Promise<boolean>;
  /** Present only when the unified agent is on. */
  generate?(request: GenerateRequest): Promise<GenerateOutcome>;
  remember?(entry: { kind: MemoryKind; text: string }): Promise<{ duplicate: boolean }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Elements from a saved document that look like board elements, first occurrence of each id; the rest are dropped here and the tool's integrity check rejects a document that is still broken. */
export const sanitizeLoaded = (elements: readonly unknown[]): StoredElement[] => {
  const seen = new Set<string>();
  const out: StoredElement[] = [];
  for (const item of elements) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" || seen.has(item.id)) continue;
    if (!isGroupRecord(item) && !Array.isArray(item.points)) continue;
    seen.add(item.id);
    out.push(structuredClone(item) as unknown as StoredElement);
  }
  return out;
};

const loadFromContent = (content: string, title?: string): LoadOutcome => {
  const saved = parseSavedContent(content);
  if (saved.status !== "ok") throw new Error(saved.status === "empty" ? "The document has no elements." : "The document is not a saved board.");
  return { elements: sanitizeLoaded(saved.elements), ...(title ? { title } : {}) };
};

/** The editor as a `CanvasHost`: the one door the AI tools reach the live board through. */
export const createEditorHost = (h: EditorHandles): CanvasHost => ({
  capabilities: { history: true, selection: true, viewport: true, save: true, load: true, export: true, confirm: true, generate: Boolean(h.generate), memory: Boolean(h.remember) },
  getStored: () => h.stored(),
  getSelection: () => h.selection.get(),
  getViewport: () => h.viewport(),
  getDocument: () => h.document(),
  newId: () => h.newId(),
  getBounds: (shape) => h.bounds(shape),
  applyPatch: (patch) => h.applyPatch(patch),
  setSelection: (ids) => h.selection.set(ids),
  undo: async () => {
    const before = revisionOf(h.stored());
    h.history.undo();
    return { changed: revisionOf(h.stored()) !== before };
  },
  redo: async () => {
    const before = revisionOf(h.stored());
    h.history.redo();
    return { changed: revisionOf(h.stored()) !== before };
  },
  fitView: (bounds) => h.fit(bounds),
  save: () => h.save(),
  load: async (source: LoadSource): Promise<LoadOutcome> => {
    if (source.kind === "content") return loadFromContent(source.content);
    // Whatever the backend says stays on the server side of this line: the model sees one sentence for "missing" and "not yours".
    const board = await h.loadBoard(source.id).catch(() => null);
    if (!board) throw new Error("That whiteboard does not exist or you do not have access to it.");
    return loadFromContent(board.content ?? "", board.title);
  },
  exportDiagram: (request) => h.exportBoard(request),
  requestConfirmation: (request) => h.confirm(request),
  ...(h.generate ? { generateDiagram: h.generate } : {}),
  ...(h.remember ? { remember: h.remember } : {}),
});
