/**
 * Cheap shape check for a whiteboard id taken from the URL, run BEFORE any
 * Convex query. Convex rejects a malformed id with ArgumentValidationError,
 * which used to crash the whole page (DA-006).
 *
 * Real Convex ids are 31-37 characters of lowercase base32
 * (0-9, a-z without i/l/o/u). This accepts a wider range (16-64 letters or
 * digits, any case) on purpose: it only has to turn obvious junk such as
 * "abc123" into a not-found page, and a false rejection is worse than a
 * crash. An id that passes here but is still invalid is caught by
 * app/whiteboard/[id]/error.tsx.
 */
const PLAUSIBLE_ID = /^[0-9a-z]{16,64}$/i;

export const isPlausibleWhiteboardId = (value: unknown): value is string =>
  typeof value === "string" && PLAUSIBLE_ID.test(value);
