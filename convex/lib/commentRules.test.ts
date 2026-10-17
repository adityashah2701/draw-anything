import { describe, expect, it } from "vitest";
import { canDeleteComment, cleanCommentText, isValidPosition, MAX_COMMENT_CHARS } from "./commentRules";

describe("cleanCommentText", () => {
  it("trims and accepts normal text, including Unicode and newlines", () => {
    expect(cleanCommentText("  hello\nworld 東京  ")).toEqual({ ok: true, text: "hello\nworld 東京" });
  });
  it.each([["empty", ""], ["blank", "  \n "], ["a number", 5], ["null", null], ["too long", "x".repeat(MAX_COMMENT_CHARS + 1)]])("rejects %s", (_n, value) => {
    expect(cleanCommentText(value).ok).toBe(false);
  });
  it("accepts exactly the limit", () => {
    expect(cleanCommentText("x".repeat(MAX_COMMENT_CHARS)).ok).toBe(true);
  });
});

describe("isValidPosition", () => {
  it("accepts finite board coordinates", () => {
    expect(isValidPosition(0, -250.5)).toBe(true);
  });
  it.each([[NaN, 0], [0, Infinity], ["1", 2], [2e6, 0], [0, undefined]])("rejects %s, %s", (x, y) => {
    expect(isValidPosition(x, y)).toBe(false);
  });
});

describe("canDeleteComment", () => {
  const comment = { authorId: "alice" };
  const board = { createdBy: "owner" };
  it("lets the author and the board creator delete, nobody else", () => {
    expect(canDeleteComment("alice", comment, board)).toBe(true);
    expect(canDeleteComment("owner", comment, board)).toBe(true);
    expect(canDeleteComment("bob", comment, board)).toBe(false);
  });
});
