import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/**
 * Render-only reveal of what the agent adds: the patch is stored at once (one undo step), and the canvas draws its
 * elements one after another in reading order, so a diagram written as code appears on the board piece by piece.
 */
const shownAt = new Map<string, number>();
const STEP_MS = 70;
const MIN_ELEMENTS = 4;

type Revealable = StoredElement & { type: string; points?: Array<{ x: number; y: number }>; startConnection?: { elementId?: string }; endConnection?: { elementId?: string }; frameId?: string; ai?: { role?: string } };

export const scheduleReveal = (added: readonly StoredElement[], now = performance.now()): void => {
  if (added.length < MIN_ELEMENTS) return;
  const all = added as Revealable[];
  const top = (el: Revealable) => Math.min(...(el.points ?? [{ x: 0, y: 0 }]).map((p) => p.y));
  const left = (el: Revealable) => Math.min(...(el.points ?? [{ x: 0, y: 0 }]).map((p) => p.x));
  const isLink = (el: Revealable) => el.type === "arrow" || el.type === "arrow-bidirectional" || el.ai?.role === "edge-label";
  const frames = all.filter((el) => el.type === "frame").sort((a, b) => top(a) - top(b) || left(a) - left(b));
  const nodes = all.filter((el) => el.type !== "frame" && !isLink(el)).sort((a, b) => left(a) - left(b) || top(a) - top(b));
  let t = now;
  for (const el of frames) shownAt.set(el.id, (t += STEP_MS));
  for (const el of nodes) shownAt.set(el.id, (t += STEP_MS));
  // A connector appears once both of its ends are on the board.
  for (const el of all.filter(isLink)) {
    const ends = [el.startConnection?.elementId, el.endConnection?.elementId].map((id) => (id ? (shownAt.get(id) ?? now) : now));
    shownAt.set(el.id, Math.max(...ends) + STEP_MS);
  }
};

/** False while an element is still waiting for its turn to appear. */
export const isRevealed = (id: string, now = performance.now()): boolean => {
  const at = shownAt.get(id);
  if (at === undefined) return true;
  if (now < at) return false;
  shownAt.delete(id);
  return true;
};

/** True while something is still to appear; entries long overdue (elements removed before they were drawn) are dropped. */
export const revealPending = (now = performance.now()): boolean => {
  for (const [id, at] of shownAt) if (at < now - 1000) shownAt.delete(id);
  return shownAt.size > 0;
};
