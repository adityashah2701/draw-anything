import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";

/** What the page is started with; written by openEditor() before the app boots. */
export interface EditorInit {
  boardId: string;
  /** Convex returns null for the board (no access): the editor mounts but cannot edit or seed. */
  readOnly: boolean;
  dark: boolean;
  /** Board content to store in the fake Convex on first load only (a reload keeps what was saved). */
  content: string | null;
  /** Read-only boards get their elements straight into the live room, since nothing seeds them. */
  roomElements: DrawingElement[];
}

/** Debug surface the fake layer publishes on `window`, so tests never reach into React internals. */
export interface EditorDebug {
  controller: WhiteboardPageController | null;
  room: {
    elements(): DrawingElement[];
    undoDepth(): number;
    redoDepth(): number;
    reset(elements: DrawingElement[]): void;
  };
  backend: {
    /** The `content` string the fake Convex currently stores (what autosave wrote). */
    savedContent(): string | null;
    saveCount(): number;
    seedComment(comment: { x: number; y: number; text: string; resolved?: boolean; authorName?: string; authorId?: string; mentionsMe?: boolean }): void;
    comments(): Array<{ _id: string; text: string; parentId?: string; resolved: boolean; x: number; y: number; sentMentions?: string[] }>;
    mutationLog(): string[];
    /** Another whiteboard this user may read (for loading one board into another). */
    seedOtherBoard(id: string, title: string, content: string): void;
    /** The unified agent's shared conversation, as the fake Convex holds it. */
    seedLegacyFrame(frameId: string, prompt: string): void;
    conversation(): { conversationId: string | null; history: string | null; summary: string | null; running: { runId: string; byName: string; mine: boolean; until: number } | null; messages: Array<{ id: string; role: string; content: string; ui?: unknown }> };
    memories(): Array<{ id: string; kind: string; text: string }>;
    seedLease(byName: string, ms?: number): void;
    clearLease(): void;
  };
}

declare global {
  interface Window {
    __fakeInit: EditorInit;
    __editor: EditorDebug;
  }
}
