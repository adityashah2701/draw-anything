import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentUiMessage } from "@/features/canvas-tools/editor/use-canvas-agent";
import { appCss } from "./css";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

declare global {
  interface Window {
    U: typeof import("./ui-entry");
    __sent?: Array<{ text: string; provider?: string; model?: string; images: string[] }>;
  }
}

/** A real PNG, drawn in the page: big enough that it must be shrunk, with transparency. */
const makeImage = (page: Page, width: number, height: number) =>
  page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#3b82f6";
      context.fillRect(width * 0.1, height * 0.1, width * 0.5, height * 0.5);
      context.fillStyle = "#ef4444";
      context.fillRect(width * 0.4, height * 0.4, width * 0.5, height * 0.5);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { width, height },
  );

suite("agent panel in real Chrome (real panel, real image shrinking)", () => {
  let s: BrowserSession;
  let page: Page;

  beforeAll(async () => {
    s = await openPage({ font: "system", ui: true, extraCss: await appCss() });
    page = s.page;
    await page.setViewportSize({ width: 1280, height: 760 });
    // The panel asks which providers have keys; the real route is not running here.
    await page.route("**/api/ai/generate-diagram", (route) => route.fulfill({ json: { providers: ["nvidia", "groq", "local"] } }));
  });
  afterAll(async () => {
    await s?.close();
  });
  beforeEach(async () => {
    await page.evaluate(() => {
      window.__sent = [];
      window.U.mountAgentPanel();
    });
    await page.waitForSelector('[data-testid="agent-composer"]');
  });

  it("attaches pictures from the file button, shrinks them, and sends them with the message", async () => {
    const big = await makeImage(page, 3000, 2000);
    await page.setInputFiles('[data-testid="agent-file-input"]', [{ name: "sketch.png", mimeType: "image/png", buffer: Buffer.from(big) }]);
    await page.waitForSelector('[data-testid="agent-attachments"] img');
    await page.locator("aside").screenshot({ path: process.env.PANEL_SHOTS ? `${process.env.PANEL_SHOTS}/attached.png` : undefined });
    await page.fill("textarea", "Recreate this");
    await page.click('button[aria-label="Send"]');
    const sent = await page.evaluate(() => window.__sent!);
    expect(sent).toHaveLength(1);
    expect(sent[0].images).toHaveLength(1);
    const url = sent[0].images[0];
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(url.length).toBeLessThan(1_000_000);
    const size = await page.evaluate(
      (src) =>
        new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.src = src;
        }),
      url,
    );
    expect(Math.max(size.w, size.h)).toBe(1280);
    expect(size.w / size.h).toBeCloseTo(1.5, 1);
    // The composer is emptied and the sent message shows the thumbnail.
    expect(await page.locator('[data-testid="agent-attachments"]').count()).toBe(0);
    expect(await page.locator('[data-testid="agent-user-images"] img').count()).toBe(1);
  });

  it("sends an image on its own with a default request, and removing a picture takes it out", async () => {
    const png = Buffer.from(await makeImage(page, 200, 100));
    await page.setInputFiles('[data-testid="agent-file-input"]', [
      { name: "a.png", mimeType: "image/png", buffer: png },
      { name: "b.png", mimeType: "image/png", buffer: png },
    ]);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="agent-attachments"] img').length === 2);
    await page.click('[data-testid="agent-attachment-remove"] >> nth=0', { force: true });
    expect(await page.locator('[data-testid="agent-attachments"] img').count()).toBe(1);
    await page.click('button[aria-label="Send"]');
    const sent = await page.evaluate(() => window.__sent!);
    expect(sent[0].text).toBe("Use the attached image.");
    expect(sent[0].images).toHaveLength(1);
  });

  it("takes pictures from a paste and from a drop, and ignores pasted text", async () => {
    const png = await makeImage(page, 300, 300);
    await page.evaluate((bytes) => {
      const file = new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" });
      const data = new DataTransfer();
      data.items.add(file);
      document.querySelector("textarea")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, png);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="agent-attachments"] img').length === 1);
    await page.evaluate((bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
      document.querySelector("form")!.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    }, png);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="agent-attachments"] img').length === 2);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "just words");
      document.querySelector("textarea")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(await page.locator('[data-testid="agent-attachments"] img').count()).toBe(2);
  });

  it("refuses files that are not images, with a message, and caps the count", async () => {
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('[data-testid="agent-file-input"]')!.removeAttribute("accept");
    });
    await page.setInputFiles('[data-testid="agent-file-input"]', [{ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }]);
    await page.waitForSelector("[data-sonner-toast]");
    expect(await page.locator("[data-sonner-toast]").first().innerText()).toMatch(/not a PNG, JPEG, WebP or GIF/);
    expect(await page.locator('[data-testid="agent-attachments"]').count()).toBe(0);
    const png = Buffer.from(await makeImage(page, 64, 64));
    await page.setInputFiles('[data-testid="agent-file-input"]', Array.from({ length: 6 }, (_, i) => ({ name: `i${i}.png`, mimeType: "image/png", buffer: png })));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="agent-attachments"] img').length === 4);
    expect(await page.locator('[data-testid="agent-attachments"] img').count()).toBe(4);
    expect(await page.locator('[data-testid="agent-attach"]').isDisabled()).toBe(true);
  });

  it("says so when the chosen model cannot read images, and has no attach button for the local model", async () => {
    const png = Buffer.from(await makeImage(page, 64, 64));
    await page.selectOption("#agent-model", "nvidia:z-ai/glm-5.3");
    await page.setInputFiles('[data-testid="agent-file-input"]', [{ name: "a.png", mimeType: "image/png", buffer: png }]);
    await page.waitForSelector('[data-testid="agent-attach-hint"]');
    expect(await page.locator('[data-testid="agent-attach-hint"]').innerText()).toMatch(/cannot read images.*Nemotron/);
    await page.locator("aside").screenshot({ path: process.env.PANEL_SHOTS ? `${process.env.PANEL_SHOTS}/text-only.png` : undefined });
    await page.selectOption("#agent-model", "nvidia");
    expect(await page.locator('[data-testid="agent-attach-hint"]').count()).toBe(0);
    await page.selectOption("#agent-model", "local");
    expect(await page.locator('[data-testid="agent-attach"]').count()).toBe(0);
  });

  it("shows thinking as a collapsible, secondary block: open and live while working, collapsed after, expandable again", async () => {
    const thinking = (id: string, text: string): AgentUiMessage => ({ id, kind: "thinking", text, source: "model" });
    await page.evaluate(
      (messages) => window.U.mountAgentPanel(messages, true),
      [
        { id: "u", kind: "user", text: "Draw a mind map for planning a product launch" },
        thinking("t1", "The request is a mind map, so a root with four branches: research, marketing, development, risks."),
        { id: "tool", kind: "tool", tool: "generate_diagram", ok: true, summary: "Generated a diagram", changed: 14, skipped: 0, warnings: [] },
        thinking("t2", "Checking the layout before I answer.\n\nThe branches do not overlap."),
      ] as AgentUiMessage[],
    );
    await page.waitForSelector('[data-testid="agent-thinking"]');
    const blocks = page.locator('[data-testid="agent-thinking"]');
    expect(await blocks.count()).toBe(2);
    expect(await blocks.nth(0).getAttribute("data-open")).toBe("false");
    expect(await blocks.nth(1).getAttribute("data-open")).toBe("true");
    expect(await blocks.nth(1).innerText()).toContain("The branches do not overlap.");
    await page.locator("aside").screenshot({ path: process.env.PANEL_SHOTS ? `${process.env.PANEL_SHOTS}/thinking-live.png` : undefined });
    await blocks.nth(0).locator("button").click();
    expect(await blocks.nth(0).innerText()).toContain("a root with four branches");
    await blocks.nth(0).locator("button").click();
    expect(await blocks.nth(0).getAttribute("data-open")).toBe("false");
    // Secondary: smaller and lighter than the assistant's own text.
    const color = await blocks.nth(0).locator("button").evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe(await page.locator('[data-testid="agent-user"]').evaluate((el) => getComputedStyle(el).color));
    await page.evaluate(() => window.U.mountAgentPanel([{ id: "t", kind: "thinking", text: "done thinking", source: "model" }], false));
    await page.waitForSelector('[data-testid="agent-thinking"]');
    expect(await page.locator('[data-testid="agent-thinking"]').getAttribute("data-open")).toBe("false");
    await page.locator("aside").screenshot({ path: process.env.PANEL_SHOTS ? `${process.env.PANEL_SHOTS}/thinking-done.png` : undefined });
  });
});
