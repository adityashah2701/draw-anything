"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ClientSideSuspense } from "@liveblocks/react";
import { LiveList } from "@liveblocks/client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RoomProvider } from "@/liveblocks.config";
import { WhiteboardCanvasRoom } from "@/features/whiteboard/components/canvas/whiteboard-canvas-room";
import { resolveWhiteboardAccess } from "@/features/whiteboard/hooks/access/whiteboard-access";
import { LogoLoader } from "@/components/shared/logo-mark";
import { isPlausibleWhiteboardId } from "@/lib/whiteboard-id";

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3 px-4 text-center">
      {children}
    </div>
  </div>
);

export default function WhiteboardCanvasRoomPage() {
  const params = useParams();
  const rawId = params.id;
  // A malformed id must never reach Convex: its validator throws and that used
  // to crash the page (DA-006). It gets the same "not found" as a missing board.
  const whiteboardId = isPlausibleWhiteboardId(rawId) ? rawId : undefined;

  // Ask the server before opening a realtime connection: people without access
  // get a clear message instead of a spinner that never ends.
  const access = useQuery(
    api.whiteboard.getAccess,
    whiteboardId ? { id: whiteboardId as Id<"whiteboards"> } : "skip",
  );
  const { status } = resolveWhiteboardAccess(whiteboardId ? access : null);

  if (status === "loading") {
    return (
      <Centered>
        <LogoLoader label="Checking access" />
      </Centered>
    );
  }

  if (status === "denied" || !whiteboardId) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold text-foreground">
          Whiteboard not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or you may not have access to it. Check that
          you are signed in to the right account and organization.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-indigo-600 underline underline-offset-4"
        >
          Back to your whiteboards
        </Link>
      </Centered>
    );
  }

  return (
    <RoomProvider
      id={whiteboardId}
      initialPresence={{ cursor: null, selection: [], pencilDraft: null }}
      initialStorage={{ elements: new LiveList([]) }}
    >
      <ClientSideSuspense
        fallback={
          <Centered>
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500"></div>
            <p className="text-sm font-medium text-muted-foreground">
              Connecting to room…
            </p>
          </Centered>
        }
      >
        <WhiteboardCanvasRoom whiteboardId={whiteboardId} />
      </ClientSideSuspense>
    </RoomProvider>
  );
}
