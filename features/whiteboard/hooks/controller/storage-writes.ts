import { LiveObject, type LiveList } from "@liveblocks/client";
import { stampForAdd, stampForUpdate, withStamp, withUpdateStamp } from "@/core/layout/placement";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { DrawingElementJson } from "@/liveblocks.config";

/**
 * THE storage boundary for writes to an existing element (and `pushElement` below for new ones): the one place
 * that stamps who placed an element (`core/layout/placement.ts`). Callers never stamp, so no path can forget.
 */
export const writeElement = (live: LiveObject<DrawingElementJson>, element: DrawingElementJson, origin: "user" | "layout" = "user", override?: "auto" | "user") => {
  const stamped = withUpdateStamp(element, stampForUpdate(live.toImmutable() as unknown as DrawingElement, element as unknown as Partial<DrawingElement>, origin, override));
  const fields = stamped as unknown as Record<string, unknown>;
  const cleared = Object.keys(fields).filter((key) => fields[key] === undefined);
  live.update(stamped);
  for (const key of cleared) live.delete(key as keyof DrawingElementJson);
};

export const pushElement = (list: LiveList<LiveObject<DrawingElementJson>>, element: DrawingElementJson, origin: "user" | "layout" = "user", override?: "auto" | "user") => {
  list.push(new LiveObject(withStamp(element, stampForAdd(element as unknown as { type?: unknown; isGuide?: unknown }, origin, override))));
};

