import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appCss } from "./css";
import { findChrome, openPage, type BrowserSession } from "./harness";

const shots = process.env.CODE_SHOTS;
const suite = findChrome() ? describe : describe.skip;

declare global {
  interface Window {
    U: typeof import("./ui-entry");
  }
}

suite("Diagram code editor in real Chrome (real component on a fake board; Clerk and Convex do not run here)", () => {
  let s: BrowserSession;
  let page: Page;
  let errors: string[];

  const area = () => page.getByRole("combobox", { name: "Diagram code" });
  const value = () => area().inputValue();
  const type = async (text: string) => {
    await area().click();
    await page.keyboard.type(text, { delay: 5 });
  };
  const state = () => page.evaluate(() => ({ applied: window.U.codeEditorState().applied.length, nodes: window.U.codeEditorState().elements.filter((e) => e.ai?.role === "node").length }));
  const board = () => page.evaluate(() => window.U.codeEditorState().elements.map((e) => ({ id: e.id, label: e.label, role: e.ai?.role })));

  beforeAll(async () => {
    s = await openPage({ font: "system", ui: true, extraCss: await appCss() });
    page = s.page;
    page.on("pageerror", (e) => errors.push(e.message));
  });
  afterAll(async () => {
    await s?.close();
  });
  beforeEach(async () => {
    errors = [];
    await page.setViewportSize({ width: 900, height: 700 });
    await page.evaluate(() => window.U.mountCodeEditor([]));
    await area().waitFor();
  });

  it("completes a property value from the list with Enter", async () => {
    await type("API [kind: dat");
    const list = page.getByRole("listbox", { name: "Suggestions" });
    await list.waitFor();
    expect(await list.getByRole("option").first().innerText()).toContain("database");
    expect(await area().getAttribute("aria-expanded")).toBe("true");
    await page.keyboard.press("Enter");
    expect(await value()).toBe("API [kind: database");
    expect(await list.count()).toBe(0);
    expect(errors).toEqual([]);
  });

  it("offers property names after [ and moves through the list with the arrow keys", async () => {
    await type("API [");
    const options = page.getByRole("option");
    await options.first().waitFor();
    const first = await options.first().innerText();
    await page.keyboard.press("ArrowDown");
    const active = await area().getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(await page.locator(`#${active}`.replace(/:/g, "\\:")).innerText()).not.toBe(first);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("listbox").count()).toBe(0);
    expect(await area().evaluate((el) => el === document.activeElement)).toBe(true); // Escape closed the list, not the field
  });

  it("paints tokens in the mirror and squiggles under problems, lined up with the textarea", async () => {
    await type('API [kind: api, wibble: 1] > DB: "x"');
    await page.keyboard.press("Escape");
    const info = await page.evaluate(() => {
      const mirror = document.querySelector("pre[aria-hidden]")!;
      const area = document.querySelector("textarea")!;
      const span = (text: string) => [...mirror.querySelectorAll("span")].find((e) => e.textContent === text)!;
      const cs = (el: Element) => getComputedStyle(el);
      return {
        key: span("kind").className,
        wibble: span("wibble").className,
        connector: span(">").className,
        sameFont: cs(mirror).fontFamily === cs(area).fontFamily && cs(mirror).fontSize === cs(area).fontSize && cs(mirror).lineHeight === cs(area).lineHeight,
        samePadding: cs(mirror).paddingLeft === cs(area).paddingLeft && cs(mirror).paddingTop === cs(area).paddingTop,
        sameTab: cs(mirror).tabSize === cs(area).tabSize,
        textHidden: cs(area).color,
      };
    });
    expect(info.key).toContain("text-primary");
    expect(info.wibble).toContain("decoration-warning");
    expect(info.connector).toContain("font-semibold");
    expect(info.sameFont && info.samePadding && info.sameTab).toBe(true);
    expect(info.textHidden).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  it("looks right in light and dark (screenshots when CODE_SHOTS is set)", async () => {
    await type('title Shop\nBackend {\n  API [kind: api, wibble: 1]\n  DB [kind: databse]\n}\nWeb > API: "HTTPS" // entry\nAPI > DB: SQL [from: bottom]\nAPI [col');
    if (shots) {
      await page.screenshot({ path: `${shots}/code-light.png` });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({ path: `${shots}/code-dark.png` });
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    }
    expect(errors).toEqual([]);
  });

  it("lists problems with line and column, and jumps to one on click", async () => {
    await type("A > B\nC [wibble: 1]");
    await page.keyboard.press("Escape");
    const issue = page.getByRole("button", { name: /Unknown property "wibble"/ });
    expect(await issue.innerText()).toContain("2:4");
    await issue.click();
    const selected = await area().evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
    expect(selected).toBe("wibble");
  });

  it("shows documentation under the caret for keyboard users and on hover for the mouse", async () => {
    await type("API [kind: api]");
    await page.keyboard.press("Escape");
    await area().evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(6, 6);
    });
    await page.keyboard.press("ArrowRight");
    expect(await page.locator("#diagram-code-hint").innerText()).toMatch(/kind/);
    const box = (await area().boundingBox())!;
    // "kind" starts at column 5; each character is a fixed width in the mono face.
    const width = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:12.5px var(--font-mono), ui-monospace, monospace";
      probe.textContent = "0".repeat(40);
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width / 40;
      probe.remove();
      return w;
    });
    await page.mouse.move(box.x + 12 + width * 6.5, box.y + 8 + 10);
    await page.getByRole("tooltip").waitFor();
    expect(await page.getByRole("tooltip").innerText()).toMatch(/kind/);
  });

  it("indents with Tab, keeps the indent on Enter and goes deeper after {", async () => {
    await type("Team {");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A");
    expect(await value()).toBe("Team {\n  A");
    await page.keyboard.press("Enter");
    await page.keyboard.type("}");
    expect(await value()).toBe("Team {\n  A\n}");
    await page.keyboard.press("Tab");
    expect(await value()).toBe("Team {\n  A\n}  ");
  });

  it("formats on the button and with Shift+Alt+F, and refuses broken code with the reason", async () => {
    await type("A   >   B,C[kind:api]");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Format" }).click();
    expect(await value()).toBe("A > B, C [kind: api]\n");
    await area().fill("A [kind: api");
    await page.getByRole("button", { name: "Format" }).click();
    expect(await value()).toBe("A [kind: api");
    expect(await page.locator("#diagram-code-status").innerText()).toMatch(/fix them before formatting/);
    await area().fill("X  >   Y");
    await area().focus();
    await page.keyboard.press("Shift+Alt+F");
    expect(await value()).toBe("X > Y\n");
  });

  it("draws on the board, then updates in place keeping every element id", async () => {
    await type("A > B: hi");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Add to canvas/ }).click();
    expect(await state()).toEqual({ applied: 1, nodes: 2 });
    const before = await board();
    await area().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nB > C");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Update diagram/ }).click({ timeout: 3000 });
    const after = await board();
    expect((await state()).nodes).toBe(3);
    for (const el of before.filter((e) => e.role === "node")) expect(after.some((a) => a.id === el.id)).toBe(true);
    expect(await page.locator("#diagram-code-status").innerText()).toMatch(/Updated: .*added/);
  });

  it("draws a frame through the frame API and keeps it when the code is updated", async () => {
    await area().fill("frame Edge {\n  Web\n  API\n}\nWeb > API\n");
    await page.getByRole("button", { name: /Add to canvas/ }).click();
    const read = () =>
      page.evaluate(() => {
        const els = window.U.codeEditorState().elements;
        const frame = els.find((e) => e.type === "frame");
        return { frame: frame?.id, title: (frame as { title?: string } | undefined)?.title, framed: els.filter((e) => e.ai?.role === "node" && e.frameId === frame?.id).length };
      });
    const first = await read();
    expect(first.title).toBe("Edge");
    expect(first.framed).toBe(2);
    await area().fill("frame Edge [label: Public edge] {\n  Web\n  API\n}\nWeb > API\n");
    await page.getByRole("button", { name: /Update diagram/ }).click({ timeout: 3000 });
    const second = await read();
    expect(second).toEqual({ frame: first.frame, title: "Public edge", framed: 2 });
    expect(errors).toEqual([]);
  });

  it("with Live on, valid edits reach the board by themselves and invalid ones never do", async () => {
    await type("A > B");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Add to canvas/ }).click();
    await page.getByRole("checkbox", { name: "Live" }).check();
    await area().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nC [kind: api");
    await page.waitForTimeout(1_100);
    expect((await state()).applied).toBe(1); // unclosed bracket: nothing sent, the board keeps its last valid picture
    expect((await state()).nodes).toBe(2);
    await page.keyboard.type("]");
    await page.waitForTimeout(1_100);
    expect((await state()).applied).toBe(2);
    expect((await state()).nodes).toBe(3);
  });

  it("stops and asks when the canvas and the code changed the same label", async () => {
    await type("API [kind: api]");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Add to canvas/ }).click();
    // A change made on the canvas: the same label, edited there.
    await page.evaluate(() => window.U.editBoardLabel("Edited on canvas"));
    await area().fill('API [kind: api, label: "Public API"]');
    await page.getByRole("button", { name: /Update diagram/ }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect(await alert.innerText()).toMatch(/Edited on canvas/);
    expect(await alert.innerText()).toMatch(/Public API/);
    expect((await board()).find((e) => e.role === "node")!.label).toBe("Edited on canvas"); // nothing written yet
    await alert.getByRole("button", { name: "Use the code" }).click();
    expect((await board()).find((e) => e.role === "node")!.label).toBe("Public API");
  });
});
