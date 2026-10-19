import type {
  StoredElement,
  WhiteboardData,
} from "@/features/whiteboard/types/whiteboard.types";

export type SavedContent =
  | { status: "empty" }
  | { status: "ok"; elements: StoredElement[]; data: Partial<WhiteboardData> }
  | { status: "corrupt" };

/**
 * Read the JSON snapshot stored in `whiteboards.content`. A snapshot that is
 * present but unreadable is reported as `corrupt`, not `empty`, so callers can
 * refuse to overwrite something that might still be recoverable.
 */
export const parseSavedContent = (content: string | undefined | null): SavedContent => {
  if (content === undefined || content === null || content.trim() === "") {
    return { status: "empty" };
  }
  try {
    const data = JSON.parse(content) as Partial<WhiteboardData> | null;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { status: "corrupt" };
    }
    if (data.elements === undefined) return { status: "empty" };
    if (!Array.isArray(data.elements)) return { status: "corrupt" };
    return { status: "ok", elements: data.elements, data };
  } catch {
    return { status: "corrupt" };
  }
};
