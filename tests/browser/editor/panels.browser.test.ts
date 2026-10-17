import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, scripted, turn } from "@/features/ai/diagram-agent/builder/testing";
import { streamDiagramBuilderEvents } from "@/features/ai/diagram-agent/run-builder";
import { encodeSse, toV1CompatibilityEvents } from "@/features/ai/server/sse";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

const LOGIN_PROMPT =
  "Flowchart of a login with a retry: Start, then Enter Credentials, then a decision Valid?. If yes go to a decision MFA Required?, and if no go to Show Error, which retries back to Enter Credentials. If MFA is not required go to Create Session and then Done. Draw Start and Done as pill terminators, both decisions as diamonds, and Show Error as boxes with icons. Label the yes/no branches and the retry arrow.";

const LOGIN = [
  "type flowchart",
  "Start [kind: start]",
  "Enter Credentials [kind: workflow]",
  "Valid? [kind: decision]",
  "MFA Required? [kind: decision]",
  "Create Session [kind: workflow]",
  "Show Error [kind: alerting]",
  "Start > Enter Credentials > Valid?",
  "Valid? > MFA Required?: yes",
  "Valid? > Show Error: no",
  "Show Error > Enter Credentials: retry",
  "MFA Required? > Create Session: no",
];

const run = async () => {
  let body = "";
  const model = scripted([
    turn(call("search_icons", "start, end, decision, box")),
    turn(call("search_icons", "error, verification, session")),
    turn(call("search_icons", "warning, authentication, server")),
    { text: "The entry point goes first so the flow reads top to bottom; both decisions are diamonds so the branches stay visible.", toolCalls: [call("add", LOGIN.slice(0, 7).join("\n"))] },
    { text: "Now the connections. The retry loops back to Enter Credentials, which will share lines with the forward arrows.", toolCalls: [call("add", LOGIN.slice(7).join("\n"))] },
    { text: "Two arrows share a line. Sending the retry out of the right side separates them.", toolCalls: [call("finish")] },
    { text: "Routing the retry around the right.", toolCalls: [call("adjust", "sides Show Error > Enter Credentials: right, right")] },
    turn(call("finish")),
  ]);
  for await (const event of streamDiagramBuilderEvents({ request: { prompt: "login flow", provider: "groq" }, transport: model.transport, revealMs: 0 })) {
    body += encodeSse(event) + toV1CompatibilityEvents(event).map(encodeSse).join("");
  }
  return body;
};

suite("agent and code panels in the real editor", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  it("the code editor is a panel of its own: open it from the sidebar, write code with a position, draw it exactly there", async () => {
    await s.page.getByRole("button", { name: "Open the diagram code editor" }).click();
    const panel = s.page.getByRole("complementary", { name: "Diagram code" });
    await panel.waitFor();
    expect(await s.page.getByRole("complementary", { name: "AI agent" }).count()).toBe(0);

    await panel.getByLabel("Diagram code").fill("API [x: 300, y: 200, w: 220, h: 90]\nDB [x: 300, y: 400]\nAPI > DB: [from: bottom, to: top]");
    await panel.getByRole("button", { name: /Add to canvas/ }).click();

    const nodes = (await s.elements()).filter((e: Record<string, any>) => e.ai?.role === "node") as Array<Record<string, any>>;
    const api = nodes.find((n) => n.label === "API")!;
    expect([api.points[0].x, api.points[0].y, api.points[1].x - api.points[0].x, api.points[1].y - api.points[0].y]).toEqual([300, 200, 220, 90]);
    const arrow = (await s.elements()).find((e: Record<string, any>) => e.type === "arrow") as Record<string, any>;
    expect(arrow.startConnection.anchorId).toMatch(/bottom/);
    expect(arrow.endConnection.anchorId).toMatch(/top/);
  });

  it("applies with Cmd/Ctrl+Enter and loads the canvas back as code with position, size and sides", async () => {
    await s.page.getByRole("button", { name: "Open the diagram code editor" }).click();
    const panel = s.page.getByRole("complementary", { name: "Diagram code" });
    const area = panel.getByLabel("Diagram code");
    await area.fill("A [x: 100, y: 100]\nB [x: 100, y: 300]\nA > B");
    await area.press("Control+Enter");
    await s.page.waitForFunction(() => window.__editor.controller!.elements.length >= 3);
    await panel.getByRole("button", { name: "Load canvas" }).click();
    const loaded = await area.inputValue();
    expect(loaded).toMatch(/x: 100, y: 100, w: \d+, h: \d+/);
    expect(loaded).toMatch(/\[from: (top|right|bottom|left), to: (top|right|bottom|left)\]/);
  });

  it("opens beside the agent, not under it", async () => {
    await s.page.getByRole("button", { name: "Open the AI agent" }).click();
    await s.page.waitForTimeout(300); // the panel slides in; a click on a moving target is refused
    await s.page.getByRole("button", { name: "Open the diagram code editor" }).first().click();
    await s.page.waitForTimeout(400);
    const agent = await s.page.getByRole("complementary", { name: "AI agent" }).boundingBox();
    const code = await s.page.getByRole("complementary", { name: "Diagram code" }).boundingBox();
    expect(agent && code).toBeTruthy();
    expect(code!.x + code!.width).toBeLessThanOrEqual(agent!.x + 1);
  });

  it("shows the agent's thinking, what it did and what it found, as a timeline", async () => {
    const body = await run();
    await s.page.route("**/api/ai/generate-diagram", (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 200, contentType: "text/event-stream", body }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ providers: ["groq"] }) }),
    );
    await s.page.getByRole("button", { name: "Open the AI agent" }).click();
    const agent = s.page.getByRole("complementary", { name: "AI agent" });
    await s.page.waitForTimeout(300);
    await agent.getByLabel("Describe your diagram").fill("login flow");
    await agent.getByRole("button", { name: "Send" }).click();
    await agent.getByText("Open as code").waitFor({ timeout: 15_000 });

    const text = await agent.innerText();
    expect(text).toContain("The entry point goes first so the flow reads top to bottom");
    expect(text).toMatch(/Added 6 components/);
    expect(text).toMatch(/Review 1: \d+ things? to fix/);
    expect(text).toContain("Show Error > Enter Credentials");
    expect(text).toMatch(/Done: 6 components and 6 connections/);

    await agent.getByRole("button", { name: "Open as code" }).click();
    const code = await s.page.getByRole("complementary", { name: "Diagram code" }).getByLabel("Diagram code").inputValue();
    expect(code).toContain("Enter Credentials");
    expect(code).toMatch(/x: -?\d+, y: -?\d+/);
    expect(s.problems.filter((p) => p.startsWith("pageerror"))).toEqual([]);
  });

  it("leaves the canvas room when both panels are open, and keeps the floating bar in the free part", async () => {
    await s.page.setViewportSize({ width: 1360, height: 850 });
    await s.page.getByRole("button", { name: "Open the AI agent" }).click();
    await s.page.waitForTimeout(300);
    await s.page.getByRole("button", { name: "Open the diagram code editor" }).first().click();
    await s.page.waitForTimeout(400);
    const agent = (await s.page.getByRole("complementary", { name: "AI agent" }).boundingBox())!;
    const code = (await s.page.getByRole("complementary", { name: "Diagram code" }).boundingBox())!;
    expect(code.x).toBeGreaterThan(1360 * 0.4);
    expect(agent.width + code.width).toBeLessThan(1360 * 0.6);
    const hideUi = (await s.page.getByRole("button", { name: /Hide toolbars|Hide UI/ }).boundingBox())!;
    expect(hideUi.x + hideUi.width).toBeLessThanOrEqual(code.x);
  });

  it("collapses a run of icon lookups into one entry and does not repeat boilerplate", async () => {
    const body = await run();
    await s.page.route("**/api/ai/generate-diagram", (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 200, contentType: "text/event-stream", body }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ providers: ["groq"] }) }),
    );
    await s.page.setViewportSize({ width: 1360, height: 850 });
    await s.page.getByRole("button", { name: "Open the AI agent" }).click();
    const agent = s.page.getByRole("complementary", { name: "AI agent" });
    await s.page.waitForTimeout(300);
    await agent.getByLabel("Describe your diagram").fill(LOGIN_PROMPT);
    await agent.getByRole("button", { name: "Send" }).click();
    await agent.getByText("Open as code").waitFor({ timeout: 15_000 });
    const text = await agent.innerText();
    expect(text.match(/Looked up icons/g)).toHaveLength(1);
    expect(text).not.toContain("Looking up icons");
    expect(text).not.toContain("Request understood");
    expect(text).not.toContain("AI Agent started");
    expect(text).toContain("start, end, decision, box");
    expect(text).toContain("error, verification, session");
  });
});
