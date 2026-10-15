import { describe, expect, it } from "vitest";
import { parseMarkdownRichText } from "./rich-text-renderer";

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
