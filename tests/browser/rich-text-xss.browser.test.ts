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

  it("normalizeRichTextInput on hostile label text runs nothing and keeps only the text", async () => {
    const r = await s.page.evaluate(async () => {
      const w = window as unknown as { __pwned?: number };
      const inputs = [
        '<img src="x:" onerror="window.__pwned=1">hello',
        '<svg onload="window.__pwned=1"><circle/></svg>world',
        '<iframe srcdoc="<script>parent.__pwned=1</script>"></iframe>text',
        '<a href="javascript:window.__pwned=1">click</a>',
        '<style>@import "http://example.invalid/x.css"</style><b>bold</b>',
      ];
      const out = inputs.map((i) => window.T.normalizeRichTextInput(i));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { out, pwned: w.__pwned === 1 };
    });
    expect(r.pwned).toBe(false);
    expect(r.out[0]).toBe("hello");
    expect(r.out[1]).toBe("world");
    expect(r.out[3]).toContain("click");
    expect(r.out.join("")).not.toMatch(/<|onerror|onload/);
  });
});
