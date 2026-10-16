/**
 * In-memory Convex for one board. Models: getById / update / the AI-frame bookkeeping the editor calls,
 * persisted to localStorage (so page.reload() reads back what autosave wrote). Does NOT model: auth,
 * organisations, access rules (convex/lib/access.ts), validators, other tables, realtime pushes, latency,
 * size limits. "Read-only" is how the real server expresses no access: getById returns null.
 */
import type { EditorInit } from "../types";

export interface FakeBoard {
  _id: string;
  _creationTime: number;
  title: string;
  content: string | undefined;
}

const listeners = new Set<() => void>();
let board: FakeBoard | null = null;
let saves = 0;
let readOnly = false;
const log: string[] = [];

const storageKey = (id: string) => `fake-convex:${id}`;
const notify = () => listeners.forEach((l) => l());

export const backend = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  /** Stable reference between changes: useQuery snapshots rely on it. */
  board: (): FakeBoard | null => board,
  configure(init: EditorInit) {
    readOnly = init.readOnly;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey(init.boardId));
    } catch {
      // storage blocked: behave like a board that has never been saved
    }
    const content = stored !== null ? (JSON.parse(stored) as { content?: string }).content : (init.content ?? undefined);
    board = readOnly ? null : { _id: init.boardId, _creationTime: 1_700_000_000_000, title: "Test Board", content };
    notify();
  },
  query(name: string): unknown {
    if (name === "whiteboard:getById" || name === "whiteboard:getAccess") return board;
    return null;
  },
  async mutate(name: string, args: Record<string, unknown> | undefined): Promise<unknown> {
    log.push(name);
    if (name === "whiteboard:update") {
      if (readOnly || !board) throw new Error("Unauthorized: you do not have permission to edit this whiteboard");
      const patch = args ?? {};
      board = {
        ...board,
        ...(typeof patch.content === "string" ? { content: patch.content } : {}),
        ...(typeof patch.title === "string" ? { title: patch.title } : {}),
      };
      saves += 1;
      try {
        localStorage.setItem(storageKey(board._id), JSON.stringify({ content: board.content }));
      } catch {
        // not persisted: reload will start empty, which a test would notice
      }
      notify();
      return null;
    }
    if (name === "aiFrames:create") return "fake-ai-frame";
    return null;
  },
  savedContent: () => board?.content ?? null,
  saveCount: () => saves,
  mutationLog: () => [...log],
};
