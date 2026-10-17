import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./retry";

describe("retryAfterMs", () => {
  it.each([
    ["Rate limit reached ... Please try again in 7.605s. Need more tokens?", 7605],
    ["Please try again in 450ms.", 450],
    ["Please try again in 1m30s.", 90_000],
    ["Please try again in 2m.", 120_000],
    ["Please try again in 8m59.5s", 539_500],
  ])("%s", (message, ms) => {
    expect(retryAfterMs(message)).toBe(ms);
  });
  it("is undefined when the message names no wait", () => {
    expect(retryAfterMs("429 too many requests")).toBeUndefined();
    expect(retryAfterMs("try again in a while")).toBeUndefined();
  });
});
