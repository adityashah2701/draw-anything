import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AutosaveStatus,
  createAutosaveController,
} from "./autosave-controller";

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = (overrides: Partial<Parameters<typeof createAutosaveController>[0]> = {}) => {
  const saved: string[] = [];
  const statuses: AutosaveStatus[] = [];
  const save = vi.fn(async (token: string) => {
    saved.push(token);
  });
  const controller = createAutosaveController({
    save,
    debounceMs: 1000,
    maxWaitMs: 5000,
    retryDelaysMs: [100, 200, 400],
    onStatus: (s) => statuses.push(s),
    ...overrides,
  });
  return { controller, save, saved, statuses };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("autosave controller", () => {
  it("treats the first observed state as the baseline and does not save it", async () => {
    const { controller, save } = setup();
    controller.observe("A");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores a not-ready (null) state, so an unsynced empty board is never written", async () => {
    const { controller, save } = setup();
    controller.observe(null); // storage not loaded yet
    controller.observe("A");
    controller.observe(null);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a change that does not alter the element count (moves, recolours, text edits)", async () => {
    const { controller, saved } = setup();
    controller.observe('[{"id":"a","x":0}]');
    controller.observe('[{"id":"a","x":40}]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(['[{"id":"a","x":40}]']);
  });

  it("debounces a burst of changes into one save of the latest state", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    for (const token of ["B", "C", "D"]) {
      controller.observe(token);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(["D"]);
  });

  it("still saves during continuous editing once maxWait is reached", async () => {
    const { controller, saved } = setup();
    controller.observe("0");
    for (let i = 1; i <= 20; i += 1) {
      controller.observe(String(i));
      await vi.advanceTimersByTimeAsync(400); // never idle for the full debounce
    }
    expect(saved.length).toBeGreaterThanOrEqual(1);
  });

  it("does not save again for a state it already persisted", async () => {
    const { controller, save } = setup();
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(1000);
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending save when the board returns to the persisted state (undo)", async () => {
    const { controller, save } = setup();
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(400);
    controller.observe("A");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the newest state after an in-flight save, instead of dropping it", async () => {
    const first = deferred();
    const saved: string[] = [];
    const save = vi.fn(async (token: string) => {
      saved.push(token);
      if (saved.length === 1) await first.promise;
    });
    const controller = createAutosaveController({ save, debounceMs: 1000, maxWaitMs: 5000 });
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(1000); // save("B") starts and hangs
    expect(saved).toEqual(["B"]);

    controller.observe("C"); // edit lands while the save is in flight
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toEqual(["B"]); // single-flight

    first.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(["B", "C"]); // not lost
  });

  it("retries transient failures with backoff and keeps the change dirty", async () => {
    let attempts = 0;
    const save = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("network");
    });
    const statuses: AutosaveStatus[] = [];
    const controller = createAutosaveController({
      save,
      debounceMs: 1000,
      maxWaitMs: 5000,
      retryDelaysMs: [100, 200, 400],
      onStatus: (s) => statuses.push(s),
    });
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toMatchObject({ hasPendingChanges: true });
    expect(statuses.at(-1)?.error).toBeTruthy();

    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(3);
    expect(statuses.at(-1)).toMatchObject({ hasPendingChanges: false, error: null });
  });

  it("stops retrying after a fatal (permission) error", async () => {
    const save = vi.fn(async () => {
      throw new Error("Unauthorized to update this whiteboard");
    });
    const controller = createAutosaveController({
      save,
      debounceMs: 1000,
      maxWaitMs: 5000,
      isFatal: (e) => /unauthorized/i.test(String(e)),
    });
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("defers saving while a gesture is active, then saves", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    controller.setCanSave(false);
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saved).toEqual([]);
    controller.setCanSave(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(["B"]);
  });

  it("does not fire an already-scheduled save once a gesture starts", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    controller.observe("B"); // save scheduled for +1000ms
    await vi.advanceTimersByTimeAsync(500);
    controller.setCanSave(false); // user grabs a shape
    await vi.advanceTimersByTimeAsync(5000);
    expect(saved).toEqual([]);
    controller.setCanSave(true); // gesture ends
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(["B"]);
  });

  it("flush() saves even while a gesture is active (e.g. the tab is closing)", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    controller.setCanSave(false);
    controller.observe("B");
    await controller.flush();
    expect(saved).toEqual(["B"]);
  });

  it("flush() saves immediately and awaits completion; it is a no-op when clean", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    await controller.flush();
    expect(saved).toEqual([]);
    controller.observe("B");
    await controller.flush();
    expect(saved).toEqual(["B"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saved).toEqual(["B"]);
  });

  it("flush({ force }) writes a state that looks clean, once", async () => {
    const { controller, saved } = setup();
    controller.observe("A");
    await controller.flush();
    expect(saved).toEqual([]);
    await controller.flush({ force: true });
    expect(saved).toEqual(["A"]);
    await controller.flush();
    expect(saved).toEqual(["A"]); // not repeated
  });

  it("flush() waits for an in-flight save, then saves what changed meanwhile", async () => {
    const gate = deferred();
    const saved: string[] = [];
    const save = vi.fn(async (token: string) => {
      saved.push(token);
      if (saved.length === 1) await gate.promise;
    });
    const controller = createAutosaveController({ save, debounceMs: 1000, maxWaitMs: 5000 });
    controller.observe("A");
    controller.observe("B");
    await vi.advanceTimersByTimeAsync(1000);
    controller.observe("C");
    const flushed = controller.flush();
    gate.resolve();
    await flushed;
    expect(saved).toEqual(["B", "C"]);
  });

  it("dispose() cancels timers", async () => {
    const { controller, save } = setup();
    controller.observe("A");
    controller.observe("B");
    controller.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });
});
