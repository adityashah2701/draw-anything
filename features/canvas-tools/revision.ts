import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

/**
 * A short fingerprint of the board's content (every element, in order). Two boards with the same content
 * have the same revision on every client, so a tool call can say "only if nothing changed since I looked".
 */
export const revisionOf = (stored: readonly StoredElement[]): string => {
  let hash = 0x811c9dc5;
  for (const item of stored) {
    const text = stable(item);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x7c;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
