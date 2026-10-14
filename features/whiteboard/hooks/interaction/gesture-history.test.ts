import { describe, expect, it, vi } from "vitest";
import { createGestureHistory } from "./gesture-history";

const fakeHistory = () => ({ pause: vi.fn(), resume: vi.fn() });

describe("createGestureHistory", () => {
  it("pauses on begin and resumes on end", () => {
    const history = fakeHistory();
    const gesture = createGestureHistory(history);
    gesture.begin();
    expect(history.pause).toHaveBeenCalledTimes(1);
    expect(history.resume).not.toHaveBeenCalled();
    expect(gesture.isActive()).toBe(true);
    gesture.end();
    expect(history.resume).toHaveBeenCalledTimes(1);
    expect(gesture.isActive()).toBe(false);
  });

  it("never pauses twice for overlapping begins (so one resume is enough)", () => {
    const history = fakeHistory();
    const gesture = createGestureHistory(history);
    gesture.begin();
    gesture.begin();
    gesture.begin();
    gesture.end();
    expect(history.pause).toHaveBeenCalledTimes(1);
    expect(history.resume).toHaveBeenCalledTimes(1);
  });

  it("ignores end without begin, so it cannot resume something it did not pause", () => {
    const history = fakeHistory();
    const gesture = createGestureHistory(history);
    gesture.end();
    gesture.end();
    expect(history.resume).not.toHaveBeenCalled();
  });

  it("can be reused for the next gesture", () => {
    const history = fakeHistory();
    const gesture = createGestureHistory(history);
    for (let i = 0; i < 3; i += 1) {
      gesture.begin();
      gesture.end();
    }
    expect(history.pause).toHaveBeenCalledTimes(3);
    expect(history.resume).toHaveBeenCalledTimes(3);
  });
});
