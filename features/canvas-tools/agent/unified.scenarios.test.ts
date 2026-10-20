import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { find, idsOf, node } from "../test-helpers";
import { call, enable, reply, scriptedRun } from "./test-support";

const diagram = (): DrawingElement[] => [
  node("api", "API", 0, 0, { ai: { semanticId: "api", role: "node" } }),
  node("db", "Postgres", 300, 0, { ai: { semanticId: "db", role: "node" } }),
];

describe("unified agent, end to end with a scripted model", () => {
  it("draws a new diagram with generate_diagram, then edits it with the normal tools, and it all undoes", async () => {
    const { run, mem, turns } = await scriptedRun({
      prompt: "Draw an architecture diagram of an API with a database, then rename the database to Orders DB",
      board: { generate: () => ({ elements: diagram(), warnings: [] }) },
      script: [
        reply("Drawing it.", [call("generate_diagram", { description: "An API with a database", diagram_type: "architecture" })]),
        reply("Renaming.", [call("update_semantic_node", { ids: ["db"], label: "Orders DB" })]),
        reply("I drew an API and a database and renamed the database to Orders DB."),
      ],
    });
    expect(run.status).toBe("done");
    expect(run.totals).toMatchObject({ calls: 2, failed: 0, created: 2, updated: 1 });
    expect(find(mem.stored, "db").label).toBe("Orders DB");
    expect(mem.calls.generates).toEqual([{ description: "An API with a database", diagramType: "architecture" }]);
    // generate was suggested from the words of the request, so no enable_tools round trip, and the model saw its tool.
    expect(turns[0].specs).toContain("generate_diagram");
    expect(turns[0].system).toContain("generate_diagram");
    // Two undo steps: the rename, then the whole generated diagram as one.
    await mem.host.undo!();
    await mem.host.undo!();
    expect(idsOf(mem.stored)).toEqual([]);
  });

  it("reports a failed generation as it is and leaves the board alone", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Draw a diagram of a web shop",
      board: { elements: [node("keep", "Keep me", 0, 0)], generate: () => Promise.reject(new Error("The AI provider timed out.")) as never },
      script: [reply("", [call("generate_diagram", { description: "A web shop" })]), reply("The diagram could not be generated, so the board is unchanged.")],
    });
    expect(run.results[0].ok).toBe(false);
    expect(run.results[0].error?.message).toContain("timed out");
    expect(run.totals.created).toBe(0);
    expect(idsOf(mem.stored)).toEqual(["keep"]);
  });

  it("stops cleanly when the person presses Stop during generation", async () => {
    const controller = new AbortController();
    const { run, mem } = await scriptedRun({
      prompt: "Draw a diagram of a web shop",
      signal: controller.signal,
      board: {
        generate: () =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
            queueMicrotask(() => controller.abort());
          }),
      },
      script: [reply("", [call("generate_diagram", { description: "A web shop" })]), reply("never reached")],
    });
    expect(run.status).toBe("aborted");
    expect(mem.stored).toEqual([]);
  });

  it("remembers an explicit preference, and the next conversation sees it as data that the live board overrides", async () => {
    const first = await scriptedRun({
      prompt: "Remember that we always draw databases in blue",
      script: [reply("Saving that.", [call("remember", { kind: "preference", text: "Databases are drawn in blue." })]), reply("Noted: databases will be blue.")],
    });
    expect(first.run.status).toBe("done");
    expect(first.mem.calls.remembered).toEqual([{ kind: "preference", text: "Databases are drawn in blue." }]);
    expect(first.mem.stored).toEqual([]);

    const second = await scriptedRun({
      memories: first.mem.calls.remembered,
      prompt: "Add a database",
      script: [reply("Checking the board.", [call("get_document_state")]), reply("Done.")],
    });
    expect(second.turns[0].system).toContain("- (preference) Databases are drawn in blue.");
    expect(second.turns[0].system).toContain("the live board and the person's current request always win");
    // The tool results the model works from come from the board, never from memory.
    expect(second.run.results[0].tool).toBe("get_document_state");
  });

  it("does not let a request for secrets through remember", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Remember my key sk-abcdefghijklmnopqrstuvwxyz123456",
      script: [reply("", [call("remember", { kind: "fact", text: "key sk-abcdefghijklmnopqrstuvwxyz123456" })]), reply("I did not save that: it looks like a secret.")],
    });
    expect(run.results[0]).toMatchObject({ ok: false, error: { code: "invalid_arguments" } });
    expect(mem.calls.remembered).toEqual([]);
  });

  it("refuses generation for a viewer", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Draw a diagram of a web shop",
      board: { document: { canEdit: false }, generate: () => ({ elements: diagram() }) },
      script: [reply("", [enable("generate")]), reply("", [call("generate_diagram", { description: "A web shop" })]), reply("You can only view this board.")],
    });
    expect(run.results.at(-1)?.ok).toBe(false);
    expect(mem.calls.generates).toEqual([]);
    expect(mem.stored).toEqual([]);
  });
});

describe("icons and groups on a plain request", () => {
  it("tells the model to choose icons and groups itself, and offers the grouping tools for a draw request", async () => {
    const { run, mem, turns } = await scriptedRun({
      prompt: "Draw a web app backend with a CDN, API gateway, auth, orders service and Postgres",
      board: { generate: () => ({ elements: [node("auth", "Auth", 0, 0), node("orders", "Orders", 200, 0), node("db", "Orders DB", 400, 0)] }) },
      script: [
        reply("", [call("generate_diagram", { description: "A web app backend", diagram_type: "architecture" })]),
        reply("", [call("group_elements", { ids: ["auth", "orders"], name: "Backend services", id: "services" })]),
        reply("Drew the backend and grouped the services."),
      ],
    });
    expect(turns[0].system).toContain("use judgment, the person should not have to ask");
    expect(turns[0].system).toContain("group each cluster");
    expect(turns[0].specs).toEqual(expect.arrayContaining(["generate_diagram", "group_elements", "create_icon"]));
    expect(run.status).toBe("done");
    expect(run.totals.failed).toBe(0);
    expect(find(mem.stored, "services")).toMatchObject({ type: "group", name: "Backend services" });
  });
});

describe("icons first in the agent prompt", () => {
  it("makes icons the default for recognisable things, keeps boxes for text, treats both equally and lets explicit wording win", async () => {
    const { buildSystemPrompt } = await import("./prompt");
    const text = buildSystemPrompt({ groups: ["create"], specs: [], protocol: "native" });
    expect(text).toMatch(/Icons come first\..*create_icon.*by default/);
    expect(text).toMatch(/create_semantic_node, a labelled box.*longer text, steps, decisions/);
    expect(text).toMatch(/as equals/);
    expect(text).toMatch(/\"no icons\", \"plain boxes\"/);
  });
});
