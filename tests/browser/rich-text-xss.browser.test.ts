import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

suite("label HTML parsing is inert (DA-001)", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage();
  });
  afterAll(async () => {
    await s?.close();
  });

  it("the old approach really fires a handler (so this test can tell)", async () => {
    const fired = await s.page.evaluate(async () => {
      const w = window as unknown as { __control?: number };
      const div = document.createElement("div");
      div.innerHTML = '<img src="x:" onerror="window.__control=1">';
      await new Promise((r) => setTimeout(r, 300));
      return w.__control === 1;
    });
    expect(fired).toBe(true);
  });

  it("hostile label text runs nothing: other markup stays literal text, editor tags are parsed inertly", async () => {
    const r = await s.page.evaluate(async () => {
      const w = window as unknown as { __pwned?: number };
      const literal = [
        '<img src="x:" onerror="window.__pwned=1">hello',
        '<svg onload="window.__pwned=1"><circle/></svg>world',
        '<iframe srcdoc="<script>parent.__pwned=1</script>"></iframe>text',
        '<a href="javascript:window.__pwned=1">click</a>',
      ];
      const editorHtml = [
        '<b onclick="window.__pwned=1" onmouseover="window.__pwned=1">x</b>',
        '<div><img src="x:" onerror="window.__pwned=1"></div>after',
        '<span style="background:url(x:)" onfocus="window.__pwned=1">s</span><script>window.__pwned=1</script>',
      ];
      const T = window.T;
      const literalOut = literal.map((i) => T.normalizeRichTextInput(i));
      const editorOut = editorHtml.map((i) => T.normalizeRichTextInput(i));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { literal, literalOut, editorOut, pwned: w.__pwned === 1 };
    });
    expect(r.pwned).toBe(false);
    // Not editor HTML: kept exactly as the text the user typed (and drawn as text, never parsed).
    expect(r.literalOut).toEqual(r.literal);
    // Editor tags are converted to markdown by an inert parser; a tag that is not an editor tag stays text.
    expect(r.editorOut[0]).toBe("**x**");
    expect(r.editorOut[1]).toContain("after");
    expect(r.editorOut[1]).toContain("<img");
    expect(r.editorOut[2]).toContain("<script>window.__pwned=1</script>");
  });

  it("developer-style angle brackets survive (List<String>, <Component />)", async () => {
    const out = await s.page.evaluate(() => {
      const T = window.T;
      return ["List<String> of items", "Use <Component /> here", "Map<string, number>", "x <b>bold</b> and List<T>"].map((i) => T.normalizeRichTextInput(i));
    });
    expect(out).toEqual(["List<String> of items", "Use <Component /> here", "Map<string, number>", "x **bold** and List<T>"]);
  });
});
