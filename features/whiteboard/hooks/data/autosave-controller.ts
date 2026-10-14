export interface AutosaveStatus {
  isSaving: boolean;
  hasPendingChanges: boolean;
  lastSavedAt: number | null;
  error: unknown | null;
}

export interface AutosaveOptions {
  /** Persists the board. `token` is the state being saved (an opaque snapshot). */
  save: (token: string) => Promise<void>;
  /** Quiet period after the last change before saving. */
  debounceMs?: number;
  /** Upper bound on how long continuous editing can postpone a save. */
  maxWaitMs?: number;
  /** Backoff between retries of a failed save; the last value repeats. */
  retryDelaysMs?: number[];
  /** Errors that retrying cannot fix (e.g. permission denied). */
  isFatal?: (error: unknown) => boolean;
  onStatus?: (status: AutosaveStatus) => void;
  now?: () => number;
}

export interface AutosaveController {
  /**
   * Report the current board state. `null` means "not ready" (storage not
   * loaded, saved content not merged yet) and is ignored, so an unsynced empty
   * board can never overwrite a saved one. The first real state becomes the
   * baseline and is not saved.
   */
  observe: (token: string | null) => void;
  /** Allow/forbid saving, e.g. forbid while a drag is in progress. */
  setCanSave: (canSave: boolean) => void;
  /**
   * Save now if there is anything unsaved; resolves when it has settled.
   * `force` also writes a state that looks clean (a manual "Save").
   */
  flush: (options?: { force?: boolean }) => Promise<void>;
  dispose: () => void;
}

/**
 * Change-detecting, single-flight autosave.
 *
 * It compares whole-board snapshots (not element counts), never runs two saves
 * at once, re-saves whatever changed during a save, retries transient failures
 * and stops on permanent ones.
 */
export const createAutosaveController = ({
  save,
  debounceMs = 1500,
  maxWaitMs = 10_000,
  retryDelaysMs = [2_000, 5_000, 15_000],
  isFatal = () => false,
  onStatus,
  now = Date.now,
}: AutosaveOptions): AutosaveController => {
  let baseline: string | null = null; // last state known to be persisted
  let latest: string | null = null;
  let canSave = true;
  let fatal = false;
  let disposed = false;
  let isSaving = false;
  let lastSavedAt: number | null = null;
  let error: unknown | null = null;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt: number | null = null;
  let inFlight: Promise<void> | null = null;
  let forced = false;

  const isDirty = () => latest !== null && (forced || latest !== baseline);

  const emit = () =>
    onStatus?.({ isSaving, hasPendingChanges: isDirty(), lastSavedAt, error });

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      // A gesture may have started since this was scheduled; setCanSave(true)
      // re-schedules when it ends.
      if (canSave) void run();
    }, delay);
  };

  const scheduleDebounced = () => {
    if (disposed || fatal || !canSave || !isDirty() || isSaving) return;
    if (firstDirtyAt === null) firstDirtyAt = now();
    const untilMaxWait = Math.max(0, firstDirtyAt + maxWaitMs - now());
    schedule(Math.min(debounceMs, untilMaxWait));
  };

  const run = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (disposed || fatal || !isDirty()) return Promise.resolve();

    const token = latest as string;
    isSaving = true;
    emit();
    inFlight = (async () => {
      try {
        await save(token);
        baseline = token;
        if (latest === token) forced = false;
        lastSavedAt = now();
        error = null;
        attempts = 0;
        firstDirtyAt = null;
      } catch (e) {
        error = e;
        if (isFatal(e)) fatal = true;
      } finally {
        isSaving = false;
        inFlight = null;
      }
      emit();
      if (disposed || fatal) return;
      if (error !== null) {
        // Transient failure: stay dirty and try again with backoff.
        const delay = retryDelaysMs[Math.min(attempts, retryDelaysMs.length - 1)];
        attempts += 1;
        if (isDirty()) schedule(delay);
      } else if (isDirty() && canSave) {
        // Something changed while we were saving: save that too.
        firstDirtyAt = now();
        scheduleDebounced();
      }
    })();
    return inFlight;
  };

  return {
    observe: (token) => {
      if (disposed || token === null) return;
      if (baseline === null) {
        baseline = token;
        latest = token;
        return;
      }
      latest = token;
      if (!isDirty()) {
        // Back to what is already saved (e.g. undo): a pending timer will find
        // nothing dirty and do nothing.
        firstDirtyAt = null;
        emit();
        return;
      }
      emit();
      scheduleDebounced();
    },
    setCanSave: (next) => {
      canSave = next;
      if (next) scheduleDebounced();
    },
    flush: async (options) => {
      if (disposed) return;
      if (options?.force && latest !== null) forced = true;
      clearTimer();
      // Wait for any save already running, then save whatever is still unsaved.
      while (!disposed && !fatal && (inFlight || isDirty())) {
        const before = baseline;
        await run();
        if (error !== null && baseline === before) break; // failed: do not spin
      }
    },
    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
};
