import { describe, expect, it } from "vitest";
import { formatToolResult, parseTextReply } from "./text-protocol";

describe("parseTextReply", () => {
  it("reads a tool call and its argument", () => {
    const t = parseTextReply(`Let me look.\n<tool name="search_icons">kafka</tool>`);
    expect(t.toolCalls).toEqual([{ name: "search_icons", arg: "kafka" }]);
    expect(t.text).toBe("Let me look.");
  });

  it("unwraps a fenced diagram inside a tool call", () => {
    const t = parseTextReply('<tool name="check_diagram">\n```diagram\nA > B\n```\n</tool>');
    expect(t.toolCalls[0]).toEqual({ name: "check_diagram", arg: "A > B" });
    expect(t.code).toBeUndefined(); // it was a tool argument, not a loose diagram
  });

  it("is tolerant of case, quoting, attributes and spacing in the tag", () => {
    for (const tag of [`<TOOL NAME="Check_Diagram">`, `<tool name='check-diagram'>`, `<tool  name=check_diagram  id="1">`, `<tool name="check diagram">`]) {
      expect(parseTextReply(`${tag}A > B</tool>`).toolCalls[0]?.name, tag).toBe("check_diagram");
    }
  });

  it("takes the last loose fence as the diagram, with or without a language", () => {
    expect(parseTextReply("first\n```\nA > B\n```\nthen\n```diagram\nC > D\n```").code).toBe("C > D");
    expect(parseTextReply("```text\nX > Y\n```").code).toBe("X > Y");
  });

  it("handles several tool calls in one reply, in order", () => {
    const t = parseTextReply('<tool name="search_icons">a</tool><tool name="search_icons">b</tool>');
    expect(t.toolCalls.map((c) => c.arg)).toEqual(["a", "b"]);
  });

  it("ignores unknown tools", () => {
    expect(parseTextReply('<tool name="rm_rf">x</tool>').toolCalls).toEqual([]);
  });

  it("flags and salvages replies cut off mid-block", () => {
    const tool = parseTextReply('<tool name="finish">\n```diagram\nA > B\nB > C');
    expect(tool.truncated).toBe(true);
    expect(tool.toolCalls[0]).toEqual({ name: "finish", arg: "A > B\nB > C" });
    const fence = parseTextReply("Here:\n```diagram\nA > B\nB > C");
    expect(fence.truncated).toBe(true);
    expect(fence.code).toBe("A > B\nB > C");
  });

  it("prose only yields neither code nor calls", () => {
    const t = parseTextReply("I would draw a database and an API.");
    expect(t.code).toBeUndefined();
    expect(t.toolCalls).toEqual([]);
  });

  it("never throws on noise", () => {
    const noise = ["", "```", "<tool", "<tool name=", "</tool>", "```\n```\n```", "<tool name='finish'>```", "\u0000".repeat(100), "<".repeat(5000), "```diagram\n".repeat(2000)];
    for (const n of noise) expect(() => parseTextReply(n), JSON.stringify(n.slice(0, 20))).not.toThrow();
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = ["```", "<tool name=\"finish\">", "</tool>", "\n", "A > B", "<", ">", " ", "diagram"];
    for (let i = 0; i < 300; i += 1) {
      const s = Array.from({ length: 1 + Math.floor(rnd() * 20) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
      expect(() => parseTextReply(s)).not.toThrow();
    }
  });
});

describe("formatToolResult", () => {
  it("names the tool", () => expect(formatToolResult("check_diagram", "ok")).toBe("Result of check_diagram:\nok"));
});
