/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  createClient,
  JsonObject,
  LiveList,
  LiveObject,
} from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
} from "@/features/whiteboard/types/whiteboard.types";

const client = createClient({
  authEndpoint: "/api/liveblocks-auth",
  throttle: 32,
});

// Presence: real-time per-user state (cursor position)
type Presence = {
  cursor: { x: number; y: number } | null;
  selection: string[];
  pencilDraft: DrawingElementJson | null;
};

// DrawingElementJson is a plain JSON-serializable version of DrawingElement.
// Liveblocks requires storage types to extend JsonObject or LsonObject.
export type DrawingElementJson = JsonObject & {
  id: string;
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  fill?: string;
  label?: string;
  text?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  routingMode?: ArrowRoutingMode;
  routePreference?: ArrowRoutePreference;
  isManuallyRouted?: boolean;
  startConnection?: { elementId: string; handle: ConnectionHandle };
  endConnection?: { elementId: string; handle: ConnectionHandle };
};

// Storage: the shared document — all connected users read/write to this
type Storage = {
  elements: LiveList<LiveObject<DrawingElementJson>>;
};

// UserMeta: static metadata returned from your auth endpoint
type UserMeta = {
  id?: string;
  info: {
    name: string;
    pictureUrl: string;
  };
};

type RoomEvent = {};

export const {
  RoomProvider,
  useRoom,
  useMyPresence,
  useUpdateMyPresence,
  useSelf,
  useOthers,
  useOthersMapped,
  useOthersConnectionIds,
  useOther,
  useBroadcastEvent,
  useEventListener,
  useErrorListener,
  useStorage,
  useMutation,
  useHistory,
  useUndo,
  useRedo,
  useCanUndo,
  useCanRedo,
} = createRoomContext<Presence, Storage, UserMeta, RoomEvent>(client);
