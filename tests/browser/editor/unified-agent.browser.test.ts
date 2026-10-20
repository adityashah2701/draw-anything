import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { call, createScriptedHandler, reply, type ScriptStep } from "@/features/canvas-tools/agent/test-support";
import { createMemoryHost } from "@/features/canvas-tools/memory-host";
import { node } from "@/features/canvas-tools/test-helpers";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

type El = Record<string, any>;

const DIAGRAM = () => [node("g-api", "Gateway", 0, 0, { ai: { semanticId: "api", role: "node" } }), node("g-db", "Orders DB", 300, 0, { ai: { semanticId: "db", role: "node" } })];

const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

/** The real server handler with a scripted model, plus the diagram generator answering with a fixed stream. */
const serve = async (page: Page, script: ScriptStep[], opts: { generator?: () => { status: number; body: string; contentType?: string } } = {}) => {
  const scripted = createScriptedHandler({ script, mem: createMemoryHost() });
  const hits = { generate: 0 };
  await page.route("**/api/ai/generate-diagram", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ providers: ["groq"] }) });
    hits.generate += 1;
    const out = opts.generator?.() ?? { status: 200, body: sse([{ type: "frame.created", frame: { frameId: "f1" } }, { type: "element.batch", frameId: "f1", elements: DIAGRAM() }, { type: "frame.done", frameId: "f1", count: 2, graph: {} }]) };
    return route.fulfill({ status: out.status, contentType: out.contentType ?? "text/event-stream", body: out.body });
  });
  await page.route("**/api/ai/canvas-agent", async (route) => {
    const response = await scripted.handler(new Request("http://localhost/api/ai/canvas-agent", { method: "POST", body: route.request().postData() ?? "" }));
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
  return { scripted, hits };
};

const openAgent = async (s: EditorSession) => {
  await s.page.getByRole("button", { name: "Open the AI agent" }).click();
  const panel = s.page.getByRole("complementary", { name: "AI agent" });
  await panel.waitFor();
  await s.page.waitForTimeout(250);
  return panel;
};
const ask = async (panel: ReturnType<Page["getByRole"]>, text: string) => {
  await panel.getByLabel("Describe a diagram or a change to the board").fill(text);
  await panel.getByRole("button", { name: "Send" }).click();
};
const finished = (panel: ReturnType<Page["getByRole"]>, count = 1) => panel.getByTestId("agent-status").nth(count - 1).waitFor({ timeout: 20_000 });
const backend = (s: EditorSession) => s.page.evaluate(() => ({ conversation: window.__editor.backend.conversation(), memories: window.__editor.backend.memories(), log: window.__editor.backend.mutationLog() }));

suite("the unified agent in the real editor", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: [node("old", "Existing", 100, 100)] as never });
  });
  afterEach(async () => {
    await s?.close();
  });
  const noPageErrors = () => expect(s.problems.filter((p) => p.startsWith("pageerror"))).toEqual([]);

  it("opens on the board assistant with the privacy notice for collaborators", async () => {
    await serve(s.page, []);
    const panel = await openAgent(s);
    expect(await panel.getByTestId("agent-shared-notice").innerText()).toMatch(/shared with everyone who can open this board/);
    await panel.getByTestId("canvas-agent-empty").waitFor();
    // One conversation: no Generate / Edit board tabs, and the examples cover drawing and editing.
    expect(await panel.getByRole("tablist").count()).toBe(0);
    expect(await panel.getByTestId("agent-tab-generate").count()).toBe(0);
    const examples = await panel.getByTestId("canvas-agent-empty").getByRole("button").allInnerTexts();
    expect(examples.some((t) => /Draw a web app backend/i.test(t))).toBe(true);
    expect(examples.some((t) => /Group|Align|Tidy/.test(t))).toBe(true);
    noPageErrors();
  });

  it("an example prompt draws through the same conversation, shows what it is doing, and offers fit and code on the result", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await serve(s.page, [reply("", [call("generate_diagram", { description: "A web app backend" })]), reply("Drawn.")]);
    // Hold the generator open so the working state is visible.
    await s.page.route("**/api/ai/generate-diagram", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ providers: ["groq"] }) });
      await gate;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ type: "element.batch", frameId: "f1", elements: DIAGRAM() }, { type: "frame.done", frameId: "f1", count: 2, graph: {} }]) });
    });
    const panel = await openAgent(s);
    await panel.getByTestId("canvas-agent-empty").getByRole("button", { name: /Draw a web app backend/ }).click();
    await panel.getByTestId("agent-activity").filter({ hasText: "Generating the diagram" }).waitFor();
    release();
    await finished(panel);
    await panel.getByTestId("agent-fit").waitFor();
    await panel.getByTestId("agent-open-code").waitFor();
    expect(((await s.elements()) as El[]).map((e) => e.id).sort()).toEqual(["g-api", "g-db", "old"]);
    noPageErrors();
  });

  it("generates a diagram through the tool as one undo step, beside the existing content, and saves the conversation", async () => {
    const { hits } = await serve(s.page, [
      reply("Drawing it.", [call("generate_diagram", { description: "A gateway and an orders database", diagram_type: "architecture" })]),
      reply("I drew a gateway and an orders database."),
    ]);
    const panel = await openAgent(s);
    const undoBefore = await s.page.evaluate(() => window.__editor.room.undoDepth());
    await ask(panel, "Draw an architecture diagram with a gateway and an orders database");
    await finished(panel);

    expect(hits.generate).toBe(1);
    const elements = (await s.elements()) as El[];
    expect(elements.map((e) => e.id).sort()).toEqual(["g-api", "g-db", "old"]);
    expect(elements.find((e) => e.id === "old")!.label).toBe("Existing");
    expect(Math.min(...elements.find((e) => e.id === "g-api")!.points.map((p: { x: number }) => p.x))).toBeGreaterThan(Math.max(...elements.find((e) => e.id === "old")!.points.map((p: { x: number }) => p.x)));
    expect(await s.page.evaluate(() => window.__editor.room.undoDepth())).toBe(undoBefore + 1);
    expect(await panel.getByTestId("agent-step").first().getAttribute("data-tool")).toBe("generate_diagram");

    // The transcript now comes from the shared conversation, not from local state.
    await s.page.waitForFunction(() => window.__editor.backend.conversation().messages.length >= 4);
    const stored = await backend(s);
    expect(stored.conversation.messages.map((m: El) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "status"]);
    expect(stored.conversation.messages[0]).toMatchObject({ role: "user", content: "Draw an architecture diagram with a gateway and an orders database" });
    expect(JSON.parse(stored.conversation.history!)[0]).toMatchObject({ role: "user" });
    expect(await panel.getByTestId("agent-user").count()).toBe(1);

    await s.page.keyboard.press("Escape");
    await s.page.evaluate(() => window.__editor.controller!.history.undo());
    expect(((await s.elements()) as El[]).map((e) => e.id)).toEqual(["old"]);
    noPageErrors();
  });

  it("keeps the conversation across a reload, hands the earlier turns to the model, and imports legacy generations once", async () => {
    await s.page.evaluate(() => window.__editor.backend.seedLegacyFrame("legacy1", "An older generated flowchart"));
    const { scripted } = await serve(s.page, [reply("Hello again."), reply("Still here.")]);
    let panel = await openAgent(s);
    await ask(panel, "First question");
    await finished(panel);
    await s.page.waitForFunction(() => window.__editor.backend.conversation().history !== null);

    await s.reload();
    await serve(s.page, [reply("Still here.")]);
    panel = await openAgent(s);
    const users = await panel.getByTestId("agent-user").allInnerTexts();
    expect(users).toEqual(["An older generated flowchart", "First question"]);
    expect(await panel.getByTestId("agent-assistant").allInnerTexts()).toContain("Hello again.");
    expect((await backend(s)).log.filter((n: string) => n === "aiConversation:importLegacyFrames").length).toBeGreaterThanOrEqual(1);

    const second = await serve(s.page, [reply("Still here.")]);
    await ask(panel, "Second question");
    await panel.getByTestId("agent-status").nth(1).waitFor({ timeout: 20_000 });
    const seen = second.scripted.turns[0].messages.filter((m) => m.role === "user").map((m) => (m as { content: string }).content);
    expect(seen).toEqual(["First question", "Second question"]); // history came back from the board, not from this page
    void scripted;
    noPageErrors();
  });

  it("remember saves a note to the board's memory, shown as a step", async () => {
    await serve(s.page, [reply("Saving.", [call("remember", { kind: "preference", text: "Databases are drawn in blue." })]), reply("Noted.")]);
    const panel = await openAgent(s);
    await ask(panel, "Remember that we always draw databases in blue");
    await finished(panel);
    expect((await backend(s)).memories).toEqual([{ id: "mem1", kind: "preference", text: "Databases are drawn in blue." }]);
    expect(await panel.getByTestId("agent-step").first().getAttribute("data-tool")).toBe("remember");
    noPageErrors();
  });

  it("shows a failed generation as a failed step and leaves the board alone", async () => {
    await serve(s.page, [reply("", [call("generate_diagram", { description: "A gateway and an orders database" })]), reply("It failed, so the board is unchanged.")], {
      generator: () => ({ status: 200, body: sse([{ type: "frame.error", frameId: "f1", message: "Model overloaded" }]) }),
    });
    const panel = await openAgent(s);
    await ask(panel, "Draw a diagram of a gateway and an orders database");
    await finished(panel);
    expect(await panel.getByTestId("agent-step").first().getAttribute("data-ok")).toBe("false");
    expect(((await s.elements()) as El[]).map((e) => e.id)).toEqual(["old"]);
    noPageErrors();
  });

  it("waits while a collaborator's run holds the board, then takes its own turn with a lease it releases", async () => {
    const { scripted } = await serve(s.page, [reply("Hi there.")]);
    const panel = await openAgent(s);
    await s.page.evaluate(() => window.__editor.backend.seedLease("Sam Rivera"));
    const input = panel.getByLabel("Describe a diagram or a change to the board");
    await input.waitFor();
    await s.page.waitForFunction(() => document.querySelector("textarea")?.getAttribute("placeholder")?.includes("Sam Rivera is using the assistant"));
    expect(await input.isDisabled()).toBe(true);
    expect(await panel.getByRole("button", { name: "Send" }).isDisabled()).toBe(true);

    await s.page.evaluate(() => window.__editor.backend.clearLease());
    await s.page.waitForFunction(() => !document.querySelector("textarea")?.hasAttribute("disabled"));
    await ask(panel, "Say hi");
    await finished(panel);
    expect(scripted.turns).toHaveLength(1);
    const log = (await backend(s)).log;
    expect(log.indexOf("aiConversation:acquireRun")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("aiConversation:releaseRun")).toBeGreaterThan(log.indexOf("aiConversation:append")); // released after the transcript is saved
    expect((await backend(s)).conversation.running).toBeNull();
    noPageErrors();
  });

  it("keeps a summary of the turns that leave the history window", async () => {
    const script: ScriptStep[] = Array.from({ length: 18 }, (_, i) => reply(`Answer ${i}.`));
    await serve(s.page, script);
    const panel = await openAgent(s);
    for (let i = 0; i < 18; i += 1) {
      await ask(panel, `Question ${i}`);
      await panel.getByTestId("agent-status").nth(i).waitFor({ timeout: 20_000 });
    }
    const { conversation } = await backend(s);
    expect(JSON.parse(conversation.history!)).toHaveLength(30);
    expect(conversation.summary).toContain('- Asked: "Question 0" → no board changes; said: "Answer 0."');
    expect(conversation.summary).not.toContain("Question 17");
    noPageErrors();
  });
});
