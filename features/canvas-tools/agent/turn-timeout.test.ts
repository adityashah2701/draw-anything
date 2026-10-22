import { describe, expect, it } from "vitest";
import { createCanvasTools } from "../runtime";
import { createMemoryHost } from "../memory-host";
import { runCanvasAgent } from "./run-agent";

describe("a model turn that never answers", () => {
  it("ends the run with a message that names the step and how to go on, instead of waiting forever", async () => {
    const mem = createMemoryHost();
    const executor = createCanvasTools({ host: mem.host });
    let calls = 0;
    const run = await runCanvasAgent({
      prompt: "Draw something",
      executor,
      budget: { turnMs: 40 },
      callTurn: () => {
        calls += 1;
        return calls === 1 ? Promise.resolve({ text: "", calls: [{ id: "a", name: "get_document_state", args: {} }], transport: "native" as const }) : new Promise<never>(() => {});
      },
    });
    expect(run.status).toBe("error");
    expect(run.error).toMatch(/took longer than .* step 2/);
    expect(run.error).toMatch(/continue/);
  });
});
