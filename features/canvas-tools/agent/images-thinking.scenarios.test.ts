import { describe, expect, it } from "vitest";
import { compactHistory, parseHistory } from "./history";
import { imageNote } from "./images";
import { createMemoryHost } from "../memory-host";
import { createCanvasTools } from "../runtime";
import { runCanvasAgent, type AgentEvent } from "./run-agent";
import { call, reply, scriptedRun } from "./test-support";

const png = "data:image/png;base64,iVBORw0KGgo=";

describe("images, end to end with a scripted model", () => {
  it("sends the images with every turn of the run, and leaves none of them in what is kept for the board", async () => {
    const { run, turns } = await scriptedRun({
      prompt: "Recreate this sketch",
      images: [png],
      script: [reply("Looking.", [call("get_document_state", {})]), reply("Done.")],
    });
    expect(run.status).toBe("done");
    // Both model turns of the run saw the picture.
    for (const turn of turns) expect((turn.messages[0] as { images?: string[] }).images).toEqual([png]);
    // What the run returns for storage has a note instead of pixels.
    expect(JSON.stringify(run.messages)).not.toContain("base64");
    expect(run.messages[0]).toEqual({ role: "user", content: `Recreate this sketch\n${imageNote(1)}` });
    // The stored history is valid for the next run, and a later turn is sent without any image.
    const stored = JSON.stringify(compactHistory(run.messages, null).history);
    expect(stored).not.toContain("base64");
    const next = await scriptedRun({ prompt: "Now make it blue", history: parseHistory(stored), script: [reply("Ok.")] });
    expect(JSON.stringify(next.turns[0].messages)).not.toContain("base64");
    expect(JSON.stringify(next.turns[0].messages)).toContain("not kept after the run");
  });
});

describe("thinking, end to end with a scripted model", () => {
  it("reports each turn's reasoning as an event, before that turn's calls, and never stores it in the history", async () => {
    const events: AgentEvent[] = [];
    const { run } = await scriptedRun({
      prompt: "Add a database",
      onEvent: (event) => events.push(event),
      script: [{ text: "Checking.", thinking: "I need to see the board first.", calls: [call("get_document_state", {})] }, reply("Done.")],
    });
    const order = events.map((e) => e.type).filter((t) => t !== "turn");
    expect(order.slice(0, 4)).toEqual(["thinking", "assistant", "calling", "tool"]);
    expect(events.find((e) => e.type === "thinking")).toMatchObject({ step: 1, text: "I need to see the board first." });
    expect(events.filter((e) => e.type === "thinking")).toHaveLength(1); // the second turn exposed none
    expect(JSON.stringify(run.messages)).not.toContain("I need to see the board");
  });

  it("works the same when the model exposes no reasoning at all", async () => {
    const events: AgentEvent[] = [];
    const { run } = await scriptedRun({ prompt: "Add a database", onEvent: (event) => events.push(event), script: [reply("Nothing to change.")] });
    expect(run.status).toBe("done");
    expect(events.some((e) => e.type === "thinking")).toBe(false);
  });

  it("shows a notice from the server once per run, not once per turn", async () => {
    const events: AgentEvent[] = [];
    const notice = "NVIDIA GLM cannot read images, so NVIDIA Nemotron was used for this request.";
    let n = 0;
    await runCanvasAgent({
      prompt: "Use this",
      executor: createCanvasTools({ host: createMemoryHost().host }),
      onEvent: (event) => events.push(event),
      callTurn: async () => ({ text: "turn", calls: n++ === 0 ? [{ id: "a", name: "get_document_state", args: {} }] : [], transport: "native", notice }),
    });
    expect(events.filter((e) => e.type === "notice")).toEqual([{ type: "notice", text: notice }]);
  });
});
