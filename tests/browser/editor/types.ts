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
    mutationLog(): string[];
  };
}

declare global {
  interface Window {
    __fakeInit: EditorInit;
    __editor: EditorDebug;
  }
}
