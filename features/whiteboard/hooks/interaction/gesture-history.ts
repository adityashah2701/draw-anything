export interface PausableHistory {
  pause: () => void;
  resume: () => void;
}

export interface GestureHistory {
  /** Start merging every change into one undo step. Safe to call repeatedly. */
  begin: () => void;
  /** Stop merging. Safe to call when no gesture is active. */
  end: () => void;
  isActive: () => boolean;
}

/**
 * One drag, resize or erase stroke produces a stream of small writes. Without
 * grouping each write is its own undo step, so Ctrl+Z would move a shape back
 * by a single mouse-move. This pauses history for the length of a gesture and
 * guarantees pause/resume stay paired: `begin` and `end` are idempotent, so a
 * repeated or missing call cannot leave history permanently paused.
 */
export const createGestureHistory = (history: PausableHistory): GestureHistory => {
  let active = false;
  return {
    begin: () => {
      if (active) return;
      active = true;
      history.pause();
    },
    end: () => {
      if (!active) return;
      active = false;
      history.resume();
    },
    isActive: () => active,
  };
};
