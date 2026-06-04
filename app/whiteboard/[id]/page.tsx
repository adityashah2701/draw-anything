"use client";
import { useParams } from "next/navigation";
import { ClientSideSuspense } from "@liveblocks/react";
import { LiveList } from "@liveblocks/client";
import { RoomProvider } from "@/liveblocks.config";
import { WhiteboardCanvasRoom } from "@/features/whiteboard/components/whiteboard-canvas-room";

export default function WhiteboardCanvasRoomPage() {
  const params = useParams();
  const whiteboardId = params.id as string;

  return (
    <RoomProvider
      id={whiteboardId}
      initialPresence={{ cursor: null, selection: [], pencilDraft: null }}
      initialStorage={{ elements: new LiveList([]) }}
    >
      <ClientSideSuspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500"></div>
              <p className="text-sm font-medium text-gray-500">
                Connecting to room…
              </p>
            </div>
          </div>
        }
      >
        <WhiteboardCanvasRoom whiteboardId={whiteboardId} />
      </ClientSideSuspense>
    </RoomProvider>
  );
}
