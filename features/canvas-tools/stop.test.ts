import { afterEach, describe, expect, it, vi } from "vitest";
import { call, reply, scriptedRun } from "./agent/test-support";
import { ALL_GROUPS, setup } from "./test-helpers";

afterEach(() => vi.restoreAllMocks());

const aborted = () => new DOMException("Stopped by the person.", "AbortError");

describe("pressing Stop during generate_diagram", () => {
  it("is a cancel: no console error, a 'cancelled' result, nothing changed", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup({ groups: [...ALL_GROUPS, "generate"], generate: async () => { throw aborted(); } });
    const result = await s.run("generate_diagram", { description: "a mind map for planning a product launch" });
    expect(result).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(result.error?.message).toMatch(/cancelled; nothing was changed/);
    expect(errors).not.toHaveBeenCalled();
    expect(s.mem.stored).toHaveLength(0);
  });

  it("a real failure still logs and reports the generator's message", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup({ groups: [...ALL_GROUPS, "generate"], generate: async () => { throw new Error("The model gave no sign of progress for 2 minutes, so the generator was stopped."); } });
    const result = await s.run("generate_diagram", { description: "a mind map for planning a product launch" });
    expect(result).toMatchObject({ ok: false, error: { code: "execution_failed" } });
    expect(result.error?.message).toMatch(/no sign of progress/);
    expect(errors).not.toHaveBeenCalled();
  });

  it("ends the run as stopped, and the cancelled call does not count as a failure", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = new AbortController();
    const { run } = await scriptedRun({
      prompt: "Draw a mind map for planning a product launch",
      signal: controller.signal,
      board: { generate: async () => { controller.abort(aborted()); throw aborted(); } },
      script: [reply("", [call("enable_tools", { groups: ["generate"] })]), reply("", [call("generate_diagram", { description: "a mind map for planning a product launch" })]), reply("Done.")],
    });
    expect(run.status).toBe("aborted");
    expect(run.totals.failed).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });
});
