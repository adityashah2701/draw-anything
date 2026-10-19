import { describe, expect, it } from "vitest";
import { suggestGroups } from "./agent/groups";
import { buildSystemPrompt } from "./agent/prompt";
import { call, reply, scriptedRun } from "./agent/test-support";
import { buildTools } from "./registry";
import { find, node, setup } from "./test-helpers";
import { TOOL_GROUPS } from "./types";

const board = () => [node("start", "Lamp doesn't work", 0, 0), node("plugged", "Lamp plugged in?", 0, 160, { ai: { semanticKind: "decision" } }), node("plug", "Plug in lamp", 300, 160)];

describe("tool names a model guesses", () => {
  it("an unknown tool names the closest real ones and what is on or off", async () => {
    const s = setup({ elements: board(), groups: ["inspect" as never] });
    const result = await s.run("edit_elements", { ids: ["plugged"] });
    expect(result.error?.code).toBe("unknown_tool");
    expect(result.error?.message).toMatch(/Closest real tools: .*update_element.*\(its group is off: enable_tools first\)/);
    expect(result.error?.message).toMatch(/Tools available now: .*get_document_state/);
    expect(result.error?.message).toMatch(/Off until enable_tools .*edit: .*change_shape/);
  });

  it("a real tool in a group that is off switches the group on, says what it takes, and works on the next call", async () => {
    const s = setup({ elements: board(), groups: ["inspect" as never] });
    const first = await s.run("update_element", { ids: ["plug"], color: "#ff0000" });
    expect(first.error).toMatchObject({ code: "tool_not_enabled" });
    expect(first.error?.message).toMatch(/on now, so call update_element again with only these arguments: ids, /);
    expect((await s.run("update_element", { ids: ["plug"], color: "#ff0000" })).ok).toBe(true);
  });

  it("the system prompt lists the real tool names of the groups that are off, and says never to invent one", () => {
    const text = buildSystemPrompt({ groups: ["inspect"], specs: [], protocol: "native", available: TOOL_GROUPS });
    expect(text).toMatch(/edit \(.*: update_element, change_shape/);
    expect(text).toMatch(/never invent one/);
  });

  it("a request to change shapes switches the edit tools on from the start", () => {
    expect(suggestGroups("Make the decision nodes diamonds")).toContain("edit");
    expect(suggestGroups("turn these into circles")).toContain("edit");
    expect(suggestGroups("Convert the rectangles to pills")).toContain("edit");
  });

  it("the run ends with a clear message after a few steps of nothing but invented tools", async () => {
    const { run } = await scriptedRun({
      prompt: "Make the decision nodes diamonds",
      board: { elements: board() },
      script: ["edit_elements", "update_style", "edit_element", "alter_shape", "more_guesses"].map((name) => reply("Let me try the available edit tools.", [call(name, { ids: ["plugged"] })])),
    });
    expect(run.status).toBe("stalled");
    expect(run.error).toMatch(/kept calling tools that do not exist \(edit_elements, update_style, edit_element\)/);
    expect(run.steps).toBe(3);
  });

  it("a real tool resets the count of invented ones", async () => {
    const { run } = await scriptedRun({
      prompt: "Make the decision nodes diamonds",
      board: { elements: board() },
      script: [reply("", [call("nope_a")]), reply("", [call("nope_b")]), reply("", [call("get_document_state")]), reply("", [call("nope_c")]), reply("", [call("nope_d")]), reply("Could not.")],
    });
    expect(run.status).toBe("done");
  });
});

describe("change_shape", () => {
  it("is a registered edit tool", () => {
    expect(buildTools(() => undefined).find((t) => t.name === "change_shape")?.group).toBe("edit");
  });

  it("turns a decision node into a diamond, keeping its id, text and connectors attached", async () => {
    const s = setup({ elements: board() });
    await s.ok("create_connector", { id: "c1", from: "start", to: "plugged" });
    await s.ok("create_connector", { id: "c2", from: "plugged", to: "plug" });
    const result = await s.ok("change_shape", { ids: ["plugged"], shape: "diamond" });
    expect(result.summary).toMatch(/to diamond/);
    const changed = find<any>(s.mem.stored, "plugged");
    expect(changed).toMatchObject({ type: "diamond", label: "Lamp plugged in?" });
    expect(changed.nodeStyle).toBeUndefined();
    const issues = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string }> }).issues.map((i) => i.code);
    expect(issues).not.toContain("dangling_connector");
    expect(issues).not.toContain("stale_connector");
    expect(issues).not.toContain("bad_anchor");
  });

  it("says plainly when nothing can be re-shaped", async () => {
    const s = setup({ elements: board() });
    await s.ok("create_connector", { id: "c1", from: "start", to: "plugged" });
    const connector = await s.run("change_shape", { ids: ["c1"], shape: "diamond" });
    expect(connector.ok).toBe(false);
    expect(connector.error?.message).toMatch(/cannot be re-shaped/);
    const same = await s.run("change_shape", { ids: ["plug"], shape: "semantic-node" });
    expect(same.error?.message).toMatch(/already a semantic-node/);
  });

  it("an agent run asked to make decisions diamonds does it with the real tool", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Make the decision nodes diamonds",
      board: { elements: board() },
      script: [reply("", [call("change_shape", { ids: ["plugged"], shape: "diamond" })]), reply("Done.")],
    });
    expect(run.status).toBe("done");
    expect(find<any>(mem.stored, "plugged").type).toBe("diamond");
  });
});
