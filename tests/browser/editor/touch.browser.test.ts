import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

suite("editor touch", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  const touchSession = async () => {
    const cdp = await s.page.context().newCDPSession(s.page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const send = (type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id: number }>) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
    return { send };
  };

  it("two fingers moving apart zoom in, and nothing is drawn", async () => {
    await s.pickTool("r");
    const { send } = await touchSession();
    const before = await s.view();
    await send("touchStart", [{ x: 600, y: 400, id: 1 }, { x: 700, y: 400, id: 2 }]);
    for (let i = 1; i <= 6; i += 1) {
      await send("touchMove", [{ x: 600 - i * 20, y: 400, id: 1 }, { x: 700 + i * 20, y: 400, id: 2 }]);
    }
    await send("touchEnd", []);
    const after = await s.view();
    expect(after.zoom).toBeGreaterThan(before.zoom * 2);
    expect(await s.elements()).toHaveLength(0);
  });

  it("two fingers dragging together pan without changing the zoom", async () => {
    const { send } = await touchSession();
    const before = await s.view();
    await send("touchStart", [{ x: 600, y: 400, id: 1 }, { x: 700, y: 400, id: 2 }]);
    for (let i = 1; i <= 5; i += 1) {
      await send("touchMove", [{ x: 600 + i * 20, y: 400 + i * 10, id: 1 }, { x: 700 + i * 20, y: 400 + i * 10, id: 2 }]);
    }
    await send("touchEnd", []);
    const after = await s.view();
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(after.pan.x - before.pan.x).toBeCloseTo(100, 0);
    expect(after.pan.y - before.pan.y).toBeCloseTo(50, 0);
  });

  it("a second finger cancels a shape the first one was drawing", async () => {
    await s.pickTool("r");
    const { send } = await touchSession();
    await send("touchStart", [{ x: 300, y: 300, id: 1 }]);
    await send("touchMove", [{ x: 400, y: 380, id: 1 }]);
    await send("touchStart", [{ x: 400, y: 380, id: 1 }, { x: 800, y: 500, id: 2 }]);
    await send("touchEnd", []);
    expect(await s.elements()).toHaveLength(0);
  });

  it("one finger still draws", async () => {
    await s.pickTool("r");
    const { send } = await touchSession();
    await send("touchStart", [{ x: 300, y: 300, id: 1 }]);
    for (let i = 1; i <= 5; i += 1) await send("touchMove", [{ x: 300 + i * 30, y: 300 + i * 20, id: 1 }]);
    await send("touchEnd", []);
    expect((await s.elements()).map((e) => e.type)).toEqual(["rectangle"]);
  });
});
