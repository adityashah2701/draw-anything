// Bundled by bundle.ts. Mounts the real WhiteboardCanvasRoom with the real theme provider and toaster,
// on top of the fakes in ./fakes (Liveblocks, Convex, next/*).
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import WhiteboardCanvasRoom from "@/features/whiteboard/components/canvas/whiteboard-canvas-room";
import { ThemeProvider } from "@/providers/theme-provider";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { backend } from "./fakes/convex-backend";
import { RoomProvider, room } from "./fakes/liveblocks";

const init = window.__fakeInit;
backend.configure(init);
room.reset(init.roomElements as never);

window.__editor = {
  controller: null,
  room: {
    elements: () => JSON.parse(room.snapshot()) as DrawingElement[],
    undoDepth: room.undoDepth,
    redoDepth: room.redoDepth,
    reset: (elements) => room.reset(elements as never),
  },
  backend: {
    savedContent: backend.savedContent,
    seedComment: backend.seedComment,
    comments: backend.comments,
    saveCount: backend.saveCount,
    mutationLog: backend.mutationLog,
    seedOtherBoard: backend.seedOtherBoard,
  },
};

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme={init.dark ? "dark" : "light"} enableSystem={false} disableTransitionOnChange>
    <RoomProvider>
      <WhiteboardCanvasRoom whiteboardId={init.boardId} />
    </RoomProvider>
    <Toaster />
  </ThemeProvider>,
);
