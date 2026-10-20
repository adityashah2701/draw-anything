import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { call, createScriptedHandler, enable, reply, type ScriptStep } from "@/features/canvas-tools/agent/test-support";
import { createMemoryHost } from "@/features/canvas-tools/memory-host";
import { node } from "@/features/canvas-tools/test-helpers";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

const BOARD = () => [
  node("api", "API Gateway", 100, 100),
  node("orders", "Orders", 420, 100),
  node("db", "Orders DB", 420, 320, { ai: { icon: "database", semanticKind: "database" } }),
];

type El = Record<string, any>;

/**
 * The real server handler (auth, access, validation, system prompt, call checking) answers the page's
 * requests with a scripted model behind it. Everything in the browser is the real editor: the hook, the loop,
 * the executor, the tools, the commands, the storage mutation, the history and the canvas.
 */
const serve = async (page: Page, script: ScriptStep[], extra: Partial<Parameters<typeof createScriptedHandler>[0]> = {}) => {
  const scripted = createScriptedHandler({ script, mem: createMemoryHost(), ...extra });
  await page.route("**/api/ai/generate-diagram", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ providers: ["groq"] }) }));
  await page.route("**/api/ai/canvas-agent", async (route) => {
    const response = await scripted.handler(new Request("http://localhost/api/ai/canvas-agent", { method: "POST", body: route.request().postData() ?? "" }));
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
  return scripted;
};

const openAgent = async (s: EditorSession) => {
  await s.page.getByRole("button", { name: "Open the AI agent" }).click();
  const panel = s.page.getByRole("complementary", { name: "AI agent" });
  await panel.waitFor();
  await s.page.waitForTimeout(250);
  return panel;
};

const ask = async (s: EditorSession, panel: ReturnType<Page["getByRole"]>, text: string) => {
  await panel.getByLabel("Describe a diagram or a change to the board").fill(text);
  await panel.getByRole("button", { name: "Send" }).click();
};

const finished = (panel: ReturnType<Page["getByRole"]>, count = 1) => panel.getByTestId("agent-status").nth(count - 1).waitFor({ timeout: 20_000 });

/** RGBA of the canvas at a board point. */
const pixelAt = async (s: EditorSession, world: { x: number; y: number }) => {
  const at = await s.toScreen(world);
  return s.page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("canvas")!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return Array.from(canvas.getContext("2d")!.getImageData(Math.round((x - rect.left) * scale), Math.round((y - rect.top) * scale), 1, 1).data);
  }, at);
};

suite("the AI canvas agent in the real editor", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: BOARD() as never });
  });
  afterEach(async () => {
    await s?.close();
  });

  const noPageErrors = () => expect(s.problems.filter((p) => p.startsWith("pageerror"))).toEqual([]);

  it("adds a node and a connector through the editor's own commands, shows each step, saves, and draws them", async () => {
    await serve(s.page, [
      reply("Looking at the board.", [call("get_document_state")]),
      reply("Adding the database.", [
        call("create_semantic_node", { id: "pg", label: "PostgreSQL", kind: "database", icon: "logo-postgresql", x: 760, y: 320 }),
        call("create_connector", { id: "pg-link", from: "orders", to: "pg", label: "SQL" }),
      ]),
      reply("I added a PostgreSQL node and connected Orders to it."),
    ]);
    const panel = await openAgent(s);
    const undoBefore = await s.page.evaluate(() => window.__editor.room.undoDepth());
    await ask(s, panel, "Add a PostgreSQL database and connect the orders service to it");
    await finished(panel);

    const steps = panel.getByTestId("agent-step");
    expect(await steps.count()).toBe(3);
    expect(await steps.evaluateAll((els) => els.map((e) => e.getAttribute("data-ok")))).toEqual(["true", "true", "true"]);
    expect(await panel.getByTestId("agent-assistant").allInnerTexts()).toContain("I added a PostgreSQL node and connected Orders to it.");
    expect(await panel.getByTestId("agent-status").innerText()).toMatch(/3 added.*3 tool calls/);

    const elements = (await s.elements()) as El[];
    const pg = elements.find((e) => e.id === "pg")!;
    expect(pg).toMatchObject({ label: "PostgreSQL", ai: { icon: "logo-postgresql", semanticKind: "database" } });
    const link = elements.find((e) => e.id === "pg-link")!;
    expect(link.startConnection.elementId).toBe("orders");
    expect(link.endConnection.elementId).toBe("pg");
    expect(elements.find((e) => e.id === "pg-link-label")?.text).toBe("SQL");

    // one undo step per change, like anything done by hand
    expect(await s.page.evaluate(() => window.__editor.room.undoDepth())).toBe(undoBefore + 2);

    // the node is really drawn (not only stored): the canvas is not the background there
    const bg = await pixelAt(s, { x: 1200, y: 700 });
    const inside = await pixelAt(s, { x: 780, y: 395 });
    expect(inside).not.toEqual(bg);

    await s.waitForIdle();
    const saved = await s.saved();
    expect(saved!.elements.map((e: El) => e.id)).toEqual(expect.arrayContaining(["pg", "pg-link", "pg-link-label"]));
    noPageErrors();
  });

  it("'Undo this run' takes back exactly what the run did, and only while nobody else has edited", async () => {
    await serve(s.page, [reply("", [call("create_shape", { id: "box", shape: "rectangle", x: 700, y: 100 }), call("create_shape", { id: "oval", shape: "ellipse", x: 700, y: 300 })]), reply("Added two shapes.")]);
    const panel = await openAgent(s);
    await ask(s, panel, "Add a box and an oval");
    await finished(panel);
    expect((await s.elements()).map((e: El) => e.id)).toEqual(expect.arrayContaining(["box", "oval"]));
    await panel.getByTestId("agent-undo-run").click();
    await s.page.waitForFunction(() => window.__editor.controller!.elements.length === 3);
    expect((await s.elements()).map((e: El) => e.id).sort()).toEqual(["api", "db", "orders"]);
    noPageErrors();
  });

  it("refuses to undo the run after the person edited the board since", async () => {
    await serve(s.page, [reply("", [call("create_shape", { id: "box", shape: "rectangle", x: 700, y: 100 })]), reply("Added.")]);
    const panel = await openAgent(s);
    await ask(s, panel, "Add a box");
    await finished(panel);
    await s.page.evaluate(() => {
      const c = window.__editor.controller!;
      c.setSelectedElements(["api"]);
    });
    await s.page.waitForTimeout(100);
    await s.page.evaluate(() => window.__editor.controller!.elementCommands.nudge(40, 0));
    await panel.getByTestId("agent-undo-run").click();
    await s.page.waitForTimeout(300);
    await s.page.getByText(/changed after the assistant finished/).first().waitFor({ timeout: 5_000 });
    const els = (await s.elements()) as El[];
    expect(els.map((e) => e.id)).toContain("box");
    expect(els.find((e) => e.id === "api")!.points[0].x).toBe(140);
  });

  it("acts on the current selection and leaves it selected", async () => {
    await serve(s.page, [reply("", [call("get_selection"), call("align_elements", { ids: ["@selection"], mode: "top" }), call("distribute_elements", { ids: ["@selection", "db"], axis: "horizontal" })]), reply("Aligned.")]);
    await s.page.evaluate(() => window.__editor.controller!.setSelectedElements(["orders", "db"]));
    await s.page.waitForFunction(() => window.__editor.controller!.selectedElements.length === 2);
    const panel = await openAgent(s);
    await ask(s, panel, "Align the selected nodes to the top");
    await finished(panel);
    const els = (await s.elements()) as El[];
    const top = (id: string) => els.find((e) => e.id === id)!.points[0].y;
    expect(top("orders")).toBe(top("db"));
    expect(top("api")).toBe(100);
    expect((await s.selected()).sort()).toEqual(["db", "orders"]);
  });

  it("asks before clearing the board: Decline leaves it alone, Approve clears it, Undo brings it back", async () => {
    await serve(s.page, [
      reply("", [enable("document")]),
      reply("", [call("clear_canvas", { confirm: true })]),
      reply("Tried to clear."),
      reply("", [call("clear_canvas", { confirm: true })]),
      reply("Cleared."),
    ]);
    const panel = await openAgent(s);
    await ask(s, panel, "Clear the whole board");
    await panel.getByTestId("agent-confirm").waitFor();
    expect(await panel.getByTestId("agent-confirm").innerText()).toContain("Delete all 3 elements");
    await panel.getByTestId("agent-confirm-decline").click();
    await finished(panel);
    expect((await s.elements()).length).toBe(3);
    const failed = panel.getByTestId("agent-step").filter({ hasText: "confirmation_denied" });
    expect(await failed.count()).toBe(1);

    await ask(s, panel, "Yes, clear it");
    await panel.getByTestId("agent-confirm").waitFor();
    await panel.getByTestId("agent-confirm-approve").click();
    await finished(panel, 2);
    expect((await s.elements()).length).toBe(0);
    await s.page.evaluate(() => window.__editor.controller!.history.undo());
    await s.page.waitForFunction(() => window.__editor.controller!.elements.length === 3);
    noPageErrors();
  });

  it("shows a refusal as a refusal: a locked node is not renamed and the step is marked failed", async () => {
    await s.page.evaluate(() => window.__editor.controller!.updateElement({ ...window.__editor.controller!.elements.find((e) => e.id === "db")!, locked: true } as never));
    await s.page.waitForFunction(() => window.__editor.controller!.elements.find((e) => e.id === "db")?.locked === true);
    await serve(s.page, [reply("", [call("update_text", { ids: ["db"], text: "Billing DB" })]), reply("The database is locked, so I left it as it was.")]);
    const panel = await openAgent(s);
    await ask(s, panel, "Rename the database to Billing DB");
    await finished(panel);
    const step = panel.getByTestId("agent-step").first();
    expect(await step.getAttribute("data-ok")).toBe("false");
    expect(await step.innerText()).toContain("locked");
    expect(await panel.getByTestId("agent-status").innerText()).toContain("1 failed");
    expect(((await s.elements()) as El[]).find((e) => e.id === "db")!.label).toBe("Orders DB");
  });

  it("a server failure shows a plain message, leaks nothing and changes nothing", async () => {
    await serve(s.page, [], { fail: () => new Error("401 invalid api key sk-SECRET-123 at https://provider.internal/v1") });
    const panel = await openAgent(s);
    await ask(s, panel, "Add a box");
    await finished(panel);
    const text = await panel.innerText();
    expect(text).not.toContain("sk-SECRET");
    expect(text).not.toContain("provider.internal");
    expect(await panel.getByTestId("agent-status").getAttribute("data-tone")).toBe("error");
    expect((await s.elements()).length).toBe(3);
  });

  it("Stop ends the run between turns and leaves what was done", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let turns = 0;
    await serve(s.page, [reply("", [call("create_shape", { id: "first", shape: "rectangle", x: 700, y: 100 })]), reply("", [call("create_shape", { id: "second", shape: "rectangle", x: 700, y: 300 })]), reply("done")], {
      beforeReply: async () => {
        turns += 1;
        if (turns === 2) await gate;
      },
    });
    const panel = await openAgent(s);
    await ask(s, panel, "Add two boxes");
    await panel.getByTestId("agent-stop").waitFor();
    await s.page.waitForFunction(() => window.__editor.controller!.elements.some((e) => e.id === "first"));
    await panel.getByTestId("agent-stop").click();
    release();
    await finished(panel);
    expect(await panel.getByTestId("agent-status").innerText()).toMatch(/^Stopped/);
    const ids = (await s.elements()).map((e: El) => e.id);
    expect(ids).toContain("first");
    expect(ids).not.toContain("second");
    noPageErrors();
  });

  it("hides and fades elements with the same behaviour as the menu: hidden ones leave the canvas and a chip brings them back", async () => {
    await s.page.evaluate(() => window.__editor.controller!.updateElement({ ...window.__editor.controller!.elements.find((e) => e.id === "api")!, fill: "#ff0000" } as never));
    await s.waitForIdle();
    const solid = await pixelAt(s, { x: 200, y: 170 });
    await serve(s.page, [reply("", [call("update_shape_style", { ids: ["api"], opacity: 0.25 }), call("hide_elements", { ids: ["db"] })]), reply("Faded the gateway and hid the database.")]);
    const panel = await openAgent(s);
    await ask(s, panel, "Make the gateway 25% opaque and hide the database");
    await finished(panel);
    await s.waitForIdle(); // the canvas repaints on the next frame
    const faded = await pixelAt(s, { x: 200, y: 170 });
    // the canvas is transparent over the page background, so opacity shows in the alpha channel
    expect(solid[3]).toBe(255);
    expect(faded[3]).toBeLessThan(100);
    expect(faded[3]).toBeGreaterThan(40);
    expect(await s.page.evaluate(() => window.__editor.controller!.elements.some((e) => e.id === "db"))).toBe(false);
    expect(((await s.elements()) as El[]).find((e) => e.id === "db")!.hidden).toBe(true);
    const chip = s.page.getByTestId("hidden-chip");
    expect(await chip.innerText()).toContain("1 hidden");
    await chip.click();
    await s.page.waitForFunction(() => window.__editor.controller!.elements.some((e) => e.id === "db"));
  });

  it("loads another board, exports, saves and fits the view", async () => {
    await s.page.evaluate(() => window.__editor.backend.seedOtherBoard("other-board-0001", "Other", JSON.stringify({ elements: [{ id: "x", type: "semantic-node", points: [{ x: 0, y: 0 }, { x: 168, y: 78 }], color: "#1f2937", strokeWidth: 2, fill: "#eef2ff", label: "Imported" }] })));
    await serve(s.page, [
      reply("", [enable("document")]),
      reply("", [
        call("load_document", { whiteboard_id: "other-board-0001", mode: "merge" }),
        call("load_document", { whiteboard_id: "not-my-board-0001", mode: "merge" }),
      ]),
      reply("", [call("save_document"), call("zoom_to_fit"), call("export_diagram", { format: "svg" })]),
      reply("Loaded one board; the other was not available."),
    ]);
    const panel = await openAgent(s);
    const saves = await s.page.evaluate(() => window.__editor.backend.saveCount());
    const download = s.page.waitForEvent("download");
    await ask(s, panel, "Load the other board, save, fit the view and export an SVG");
    await finished(panel);
    expect(((await s.elements()) as El[]).some((e) => e.label === "Imported")).toBe(true);
    const stepOk = await panel.getByTestId("agent-step").evaluateAll((els) => els.map((e) => [e.getAttribute("data-tool"), e.getAttribute("data-ok")]));
    expect(stepOk).toEqual([["enable_tools", "true"], ["load_document", "true"], ["load_document", "false"], ["save_document", "true"], ["zoom_to_fit", "true"], ["export_diagram", "true"]]);
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
    expect(await s.page.evaluate(() => window.__editor.backend.saveCount())).toBeGreaterThan(saves);
    noPageErrors();
  });
});
