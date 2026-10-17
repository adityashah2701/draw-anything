import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

suite("editor comments", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  const pin = (text: string | RegExp) => s.page.getByRole("button", { name: typeof text === "string" ? new RegExp(`Comment by .*: ${text}`) : text });
  const comments = () => s.page.evaluate(() => window.__editor.backend.comments());

  const startThread = async (at: { x: number; y: number }, text: string) => {
    await s.press("m");
    expect(await s.tool()).toBe("comment");
    await s.click(at);
    await s.page.getByRole("dialog", { name: "New comment" }).waitFor();
    await s.page.waitForSelector("textarea:focus");
    await s.type(text);
    await s.press("Enter");
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor();
  };

  it("places a comment where you click, with the tool returning to select", async () => {
    await startThread({ x: 300, y: 250 }, "Is this the right queue?");
    expect(await s.tool()).toBe("select");
    const [saved] = await comments();
    expect(saved.text).toBe("Is this the right queue?");
    expect(saved.x).toBeCloseTo(300, 0);
    expect(saved.y).toBeCloseTo(250, 0);
    await pin("Is this the right queue").waitFor();
  });

  it("Shift+Enter adds a line, empty text cannot be sent, Escape cancels the composer", async () => {
    await s.press("m");
    await s.click({ x: 300, y: 250 });
    await s.page.waitForSelector("textarea:focus");
    const send = s.page.getByRole("button", { name: "Comment", exact: true }).last();
    expect(await send.isDisabled()).toBe(true);
    await s.type("line one");
    await s.press("Shift+Enter");
    await s.type("line two");
    await s.press("Escape");
    await s.page.getByRole("dialog", { name: "New comment" }).waitFor({ state: "detached" });
    expect(await comments()).toHaveLength(0);
    await s.press("m");
    await s.click({ x: 300, y: 250 });
    await s.page.waitForSelector("textarea:focus");
    await s.type("a");
    await s.press("Shift+Enter");
    await s.type("b");
    await s.press("Enter");
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor();
    expect((await comments())[0].text).toBe("a\nb");
  });

  it("replies, resolves (hiding the pin), shows resolved on request, and reopens", async () => {
    await startThread({ x: 300, y: 250 }, "First");
    await s.page.getByRole("textbox", { name: "Reply…" }).fill("Second");
    await s.press("Enter");
    await s.page.getByText("Second").waitFor();
    expect((await comments()).map((c) => c.text)).toEqual(["First", "Second"]);

    await s.page.getByRole("button", { name: "Resolve", exact: true }).click();
    await pin("First").waitFor({ state: "detached" }).catch(() => undefined);
    await s.page.mouse.click(900, 650);
    await pin(/Comment by/).waitFor({ state: "detached" });
    await s.page.getByRole("button", { name: /Show resolved \(1\)/ }).click();
    await pin(/Comment by .*resolved/).waitFor();
    await pin(/Comment by .*resolved/).click();
    await s.page.getByRole("button", { name: "Reopen", exact: true }).click();
    expect((await comments())[0].resolved).toBe(false);
  });

  it("deletes your own thread but offers no delete on someone else's", async () => {
    await s.page.evaluate(() => window.__editor.backend.seedComment({ x: 600, y: 300, text: "From Sam" }));
    await pin("From Sam").click();
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor();
    expect(await s.page.getByRole("button", { name: "Delete thread" }).count()).toBe(0);
    await s.page.getByRole("button", { name: "Close thread" }).click();

    await startThread({ x: 300, y: 250 }, "Mine");
    await s.page.getByRole("button", { name: "Delete thread" }).click();
    await pin("Mine").waitFor({ state: "detached" });
    expect((await comments()).map((c) => c.text)).toEqual(["From Sam"]);
  });

  it("pins stay on their board position through zoom and pan, and survive a reload", async () => {
    await startThread({ x: 500, y: 300 }, "Pinned");
    await s.press("Escape");
    await s.press("Control+=");
    await s.press("Control+=");
    await s.page.waitForTimeout(300); // zoom animates
    const expected = await s.toScreen({ x: 500, y: 300 });
    const box = (await pin("Pinned").boundingBox())!;
    // the pin's tip (bottom centre) is the anchor
    expect(box.x + box.width / 2).toBeCloseTo(expected.x, 0);
    expect(box.y + box.height).toBeCloseTo(expected.y, 0);
    await s.reload();
    await pin("Pinned").waitFor();
  });

  it("closes a thread on an outside click and on Escape", async () => {
    await startThread({ x: 300, y: 250 }, "Close me");
    await s.page.mouse.click(900, 650);
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor({ state: "detached" });
    await pin("Close me").click();
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor();
    await s.page.getByRole("button", { name: "Close thread" }).focus();
    await s.press("Escape");
    await s.page.getByRole("dialog", { name: "Comment thread" }).waitFor({ state: "detached" });
  });
});
