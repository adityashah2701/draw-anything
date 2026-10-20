import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

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
});
