import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

suite("text editing in a real DOM (contentEditable)", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  /** Mounts the same editor element the app mounts, with its real style, and focuses it. */
  const mount = (text: string, zoom = 1) =>
    s.page.evaluate(
      ({ text, zoom }) => {
        const T = window.T;
        document.body.innerHTML = "";
        const size = 20 * zoom;
        const editor = document.createElement("div");
        editor.id = "ed";
        editor.contentEditable = "true";
        const style = T.textBlockEditorStyle({ fontSizePx: size, lineHeightPx: size * 1.2, fontWeight: "400", italic: false, color: "#000" });
        for (const [k, v] of Object.entries(style)) {
          (editor.style as unknown as Record<string, string>)[k] = typeof v === "number" ? `${v}px` : String(v);
        }
        editor.style.position = "absolute";
        editor.style.left = "40px";
        editor.style.top = "40px";
        editor.innerHTML = T.markdownToEditableHtml(T.normalizeRichTextInput(text));
        document.body.appendChild(editor);
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
      },
      { text, zoom },
    );
  const markdown = () => s.page.evaluate(() => window.T.editableHtmlToMarkdown(document.getElementById("ed")!));

  const ROUNDTRIPS = [
    "plain",
    "two\nlines",
    "blank\n\nline between",
    "**bold** and *italic*",
    "emoji 🙂 and 日本語 and é",
    "5 * 3 = 15",
    "AT&T \"quotes\" < 5 > 3",
    "  leading spaces",
  ];
  for (const text of ROUNDTRIPS) {
    it(`markdown -> editable HTML -> markdown is stable: ${JSON.stringify(text)}`, async () => {
      await mount(text);
      const once = await markdown();
      // A second trip must not change anything (no drift while editing and saving repeatedly).
      await s.page.evaluate((md) => {
        const el = document.getElementById("ed")!;
        el.innerHTML = window.T.markdownToEditableHtml(md);
      }, once);
      expect(await markdown()).toBe(once);
      // The editor stores a literal "*" as "\\*"; compare what the user sees.
      expect(once.replaceAll("\\*", "*").replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
    });
  }

  it("Shift+Enter makes a new line and typing continues there", async () => {
    await mount("");
    await s.page.keyboard.type("Hello");
    await s.page.keyboard.press("Shift+Enter"); // plain Enter commits in the app
    await s.page.keyboard.type("World");
    expect(await markdown()).toBe("Hello\nWorld");
  });

  for (const zoom of [0.5, 1, 2]) {
    it(`clicking between letters puts the caret there @ ${zoom}x`, async () => {
      await mount("Hello", zoom);
      // x of the boundary between "He" and "llo", read from the DOM itself.
      const x = await s.page.evaluate(() => {
        const node = document.getElementById("ed")!.firstChild!;
        const r = document.createRange();
        r.setStart(node.firstChild ?? node, 2);
        r.setEnd(node.firstChild ?? node, 2);
        return r.getBoundingClientRect().left;
      });
      const y = await s.page.evaluate(() => document.getElementById("ed")!.getBoundingClientRect().top + 4);
      await s.page.mouse.click(x, y);
      await s.page.keyboard.type("X");
      expect(await markdown()).toBe("HeXllo");
    });
  }

  it("IME composition commits the composed text (CDP)", async () => {
    await mount("");
    const cdp = await s.page.context().newCDPSession(s.page);
    await cdp.send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 });
    // Mid-composition the text is visible in the editor.
    expect(await s.page.evaluate(() => document.getElementById("ed")!.textContent)).toContain("にほん");
    await cdp.send("Input.insertText", { text: "日本" });
    expect(await markdown()).toBe("日本");
    await s.page.keyboard.type("!");
    expect(await markdown()).toBe("日本!");
  });
});
