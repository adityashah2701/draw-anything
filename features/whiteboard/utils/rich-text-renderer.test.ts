import { describe, expect, it } from "vitest";
import { escapeNonEditorAngles, looksLikeEditorHtml, normalizeRichTextInput, parseMarkdownRichText } from "./rich-text-renderer";

const plain = (input: string) => parseMarkdownRichText(input).map((s) => s.text).join("");

describe("parseMarkdownRichText: asterisks without a partner stay literal", () => {
  it.each(["5 * 3 = 15", "Rate * Limit", "a ** b", "wildcard *"])(
    "keeps every character of %j",
    (input) => {
      expect(plain(input)).toBe(input);
    },
  );

  it("still formats a real pair and keeps a stray one literal", () => {
    const spans = parseMarkdownRichText("*a* then 2 * 3");
    expect(spans[0]).toMatchObject({ text: "a", italic: true });
    expect(spans.map((s) => s.text).join("")).toBe("a then 2 * 3");
    expect(spans.slice(1).every((s) => !s.italic)).toBe(true);
  });

  it("keeps bold, bold-italic and escapes working", () => {
    expect(parseMarkdownRichText("**b** x")[0]).toMatchObject({ text: "b", bold: true });
    expect(parseMarkdownRichText("***bi***")[0]).toMatchObject({ text: "bi", bold: true, italic: true });
    expect(plain("a \\* b")).toBe("a * b");
  });
});

describe("angle brackets in labels (text, not markup)", () => {
  const plain = ["List<String> of items", "Use <Component /> here", "Map<string, number>", "a < b and c > d", "<tagged>", "x <img src=y> z", "1 <2> 3", "<script>alert(1)</script>"];

  it.each(plain)("%j is not editor HTML, so it is kept exactly", (text) => {
    expect(looksLikeEditorHtml(text)).toBe(false);
    expect(normalizeRichTextInput(text)).toBe(text);
  });

  it.each(["x <b>bold</b>", "<div>a</div><div>b</div>", "1<br>2", "<p>para</p>", "<span style=\"x\">s</span>", "<strong>s</strong>", "<BR/>"])("%j is editor HTML", (text) => {
    expect(looksLikeEditorHtml(text)).toBe(true);
  });

  it("escapes only the angles that are not editor tags, so a parser keeps them as text", () => {
    expect(escapeNonEditorAngles("List<String> <b>x</b> <img src=y>")).toBe("List&lt;String> <b>x</b> &lt;img src=y>");
    expect(escapeNonEditorAngles("a <br> b </div> c <i>d</i> <iframe>")).toBe("a <br> b </div> c <i>d</i> &lt;iframe>");
    expect(escapeNonEditorAngles("<bold> <p>q</p> <pre>")).toBe("&lt;bold> <p>q</p> &lt;pre>");
  });

  it("without a DOM, editor tags become line breaks or vanish and every other bracket stays", () => {
    expect(normalizeRichTextInput("<div>List<String></div><div>two</div>")).toBe("List<String>\ntwo\n");
    expect(normalizeRichTextInput("a<br>b <b>c</b>")).toBe("a\nb c");
  });
});
