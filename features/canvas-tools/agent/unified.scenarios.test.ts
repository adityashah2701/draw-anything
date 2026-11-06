import { describe, expect, it } from "vitest";
import { call, reply, scriptedRun } from "./test-support";

const nodesOf = (all: readonly unknown[]) => (all as { ai?: { role?: string }; label?: string; name?: string }[]).filter((el) => el.ai?.role === "node").map((el) => el.label ?? el.name).sort();

describe("the builder agent, end to end with a scripted model", () => {
  it("plans, draws a new diagram in steps on the board, finishes, and the run undoes", async () => {
    const { run, mem, turns } = await scriptedRun({
      prompt: "Draw an architecture of a web app with an API and a database",
      script: [
        reply("Planning.", [call("set_plan", { plan: "type architecture, direction right. Nodes: Web App, API, Orders DB. Steps: 1 nodes and links.", new_diagram: true })]),
        reply("Drawing.", [call("add_to_diagram", { code: "type architecture\ndirection right\nWeb App [icon: browser, shape: icon]\nAPI [icon: api, shape: icon]\nOrders DB [icon: postgres, shape: icon]\nWeb App > API: HTTPS\nAPI > Orders DB" })]),
        reply("Adding a cache.", [call("add_to_diagram", { code: "Cache [icon: redis, shape: icon]\nAPI > Cache" })]),
        reply("", [call("finish", { summary: "A web app, its API, a database and a cache." })]),
        reply("never reached"),
      ],
    });
    expect(run.status).toBe("done");
    expect(nodesOf(mem.stored)).toEqual(["API", "Cache", "Orders DB", "Web App"]);
    // Every turn ends with the board state, rebuilt from the board: the second step saw the first step's code.
    expect(turns[0].messages.at(-1)?.content).toContain("<board_state>");
    expect(turns[2].messages.at(-1)?.content).toMatch(/Web App[\s\S]*Orders DB/);
    expect(turns[0].specs).toEqual(expect.arrayContaining(["set_plan", "adjust_diagram", "finish"]));
  });

  it("draws without a plan too, and edits the diagram that is there instead of drawing a second one", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Draw a web app and an API, then add a database behind the API",
      script: [
        reply("", [call("set_plan", { plan: "New diagram: Web App > API. Then add Orders DB behind API.", new_diagram: true })]),
        reply("", [call("add_to_diagram", { code: "type architecture\nWeb App > API" })]),
        reply("", [call("add_to_diagram", { code: "Orders DB [icon: postgres]\nAPI > Orders DB" })]),
        reply("", [call("adjust_diagram", { commands: "rename Orders DB: Orders Store\nlabel API > Orders Store: SQL" })]),
        reply("", [call("finish", {})]),
      ],
    });
    expect(nodesOf(mem.stored)).toEqual(["API", "Orders Store", "Web App"]);
    expect(run.status).toBe("done");
  });

  it("refuses finish while the diagram has a fault, and accepts it once fixed", async () => {
    const { run } = await scriptedRun({
      prompt: "Draw an ER diagram of users and orders",
      script: [
        reply("", [call("set_plan", { plan: "type entity-relationship: Users, Orders tables, one-to-many.", new_diagram: true })]),
        reply("", [call("add_to_diagram", { code: 'type entity-relationship\nUsers [icon: user]\nOrders [shape: entity, rows: "id int pk; user_id int -> users.id"]\nUsers > Orders [relation: er-relationship, from: one, to: zero-or-many]' })]),
        reply("", [call("finish", {})]),
        reply("", [call("adjust_diagram", { commands: "remove Users" })]),
        reply("", [call("add_to_diagram", { code: 'Users [shape: entity, rows: "id int pk"]\nUsers > Orders [relation: er-relationship, from: one, to: zero-or-many]' })]),
        reply("", [call("finish", {})]),
      ],
    });
    const finishes = run.results.filter((r) => r.tool === "finish");
    expect(finishes[0].data).toMatchObject({ accepted: false });
    expect(finishes.at(-1)?.data).toMatchObject({ accepted: true });
    expect(run.status).toBe("done");
  });
});

describe("the agent writes the diagram as code", () => {
  it("draws a fenced diagram block from a reply without tool calls, with components as captioned icons", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Design a URL shortener",
      script: [reply("Here it is.\n```diagram\ntype architecture\ndirection right\nWeb [icon: browser]\nAPI [icon: server]\nLinks DB [icon: postgres]\nWeb > API: HTTPS\nAPI > Links DB\n```"), reply("", [call("finish", {})])],
    });
    expect(run.results[0]).toMatchObject({ tool: "add_to_diagram", ok: true });
    expect(nodesOf(mem.stored)).toEqual(["API", "Links DB", "Web"]);
    expect((mem.stored as Array<{ type: string; ai?: { role?: string } }>).filter((el) => el.ai?.role === "node").every((el) => el.type === "icon")).toBe(true);
    expect(run.status).toBe("done");
  });
});

describe("reprompting edits the diagram that is there", () => {
  it("a change request written as code updates the same diagram instead of drawing a second one", async () => {
    const first = await scriptedRun({
      prompt: "Design a URL shortener",
      script: [reply("```diagram\ntype class\nLink [shape: class, attributes: \"-code: string\"]\nStatus [shape: enum, attributes: \"ACTIVE\"]\nLink > Status\n```"), reply("", [call("finish", {})])],
    });
    const { run, mem } = await scriptedRun({
      prompt: "Give Status an EXPIRED value and remove nothing else",
      board: { elements: first.mem.stored.filter((e) => e.type !== "group") as never },
      script: [reply("```diagram\nStatus [shape: enum, attributes: \"ACTIVE; EXPIRED\"]\n```"), reply("", [call("finish", {})])],
    });
    expect(run.results[0]).toMatchObject({ tool: "add_to_diagram", ok: true });
    expect(nodesOf(mem.stored)).toEqual(["Link", "Status"]);
    const status = (mem.stored as Array<{ type: string; name?: string; attributes?: string[] }>).find((e) => e.type === "uml-classifier" && e.name === "Status");
    expect(status?.attributes).toEqual(["ACTIVE", "EXPIRED"]);
  });
});

describe("the builder prompt", () => {
  it("teaches the loop, frames, icons and the language, and adds the system-design guide only when asked to design a system", async () => {
    const { turns } = await scriptedRun({ prompt: "Design WhatsApp", script: [reply("Done.")] });
    const text = turns[0].system;
    expect(text).toContain("```diagram");
    expect(turns[0].specs).not.toContain("add_to_diagram");
    expect(text).toMatch(/frames by layer or domain/);
    expect(text).toMatch(/captioned icon/);
    expect(text).toContain("SYSTEM DESIGN");
    expect(text).toContain("frame Messaging");
    const plain = await scriptedRun({ prompt: "Make the selected box blue", script: [reply("Done.")] });
    expect(plain.turns[0].system).not.toContain("SYSTEM DESIGN");
  });
});
