export type WhiteboardAccessStatus = "loading" | "granted" | "denied";

export interface ResolvedWhiteboardAccess {
  status: WhiteboardAccessStatus;
  hasEditAccess: boolean;
}

/**
 * Convex returns the whiteboard only to people who may use it (the creator and
 * members of its organization) and `null` to everyone else, so the document's
 * presence *is* the permission. `undefined` means the query is still loading,
 * and loading never grants edit rights.
 */
export const resolveWhiteboardAccess = (
  whiteboard: object | null | undefined,
): ResolvedWhiteboardAccess => {
  if (whiteboard === undefined) return { status: "loading", hasEditAccess: false };
  if (whiteboard === null) return { status: "denied", hasEditAccess: false };
  return { status: "granted", hasEditAccess: true };
};
