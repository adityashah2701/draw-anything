import { describe, expect, it } from "vitest";
import { cardPosition, friendlyError, groupThreads, isSendKey, relativeTime, visibleThreads, worldToScreen, type CommentDto } from "./comments";

const c = (id: string, createdAt: number, over: Partial<CommentDto> = {}): CommentDto => ({
  _id: id, x: 0, y: 0, text: id, resolved: false, createdAt, authorId: "u", authorName: "U", authorImageUrl: "", mine: false, ...over,
});

describe("groupThreads", () => {
  it("nests replies under their root, oldest first, whatever the input order", () => {
    const threads = groupThreads([c("r2", 30, { parentId: "a" }), c("b", 20), c("a", 10), c("r1", 15, { parentId: "a" })]);
    expect(threads.map((t) => t.root._id)).toEqual(["a", "b"]);
    expect(threads[0].replies.map((r) => r._id)).toEqual(["r1", "r2"]);
  });
  it("drops a reply whose root is missing", () => {
    expect(groupThreads([c("orphan", 1, { parentId: "gone" })])).toEqual([]);
  });
});

describe("visibleThreads", () => {
  it("hides resolved threads unless asked", () => {
    const threads = groupThreads([c("a", 1), c("b", 2, { resolved: true })]);
    expect(visibleThreads(threads, false).map((t) => t.root._id)).toEqual(["a"]);
    expect(visibleThreads(threads, true)).toHaveLength(2);
  });
});

describe("worldToScreen", () => {
  it("applies zoom then pan", () => {
    expect(worldToScreen({ x: 10, y: 20 }, 2, { x: 5, y: -5 })).toEqual({ x: 25, y: 35 });
  });
});

describe("cardPosition", () => {
  const stage = { width: 1000, height: 600 };
  const card = { width: 300, height: 200 };
  it("opens to the right of the pin when there is room", () => {
    expect(cardPosition({ x: 100, y: 100 }, card, stage).x).toBe(114);
  });
  it("flips left near the right edge and stays inside the stage", () => {
    const p = cardPosition({ x: 950, y: 590 }, card, stage);
    expect(p.x).toBe(950 - 14 - 300);
    expect(p.y).toBe(600 - 200 - 8);
  });
  it("never goes negative", () => {
    expect(cardPosition({ x: -50, y: -50 }, card, stage)).toEqual({ x: 8, y: 8 });
  });
});

describe("relativeTime", () => {
  const now = 1_700_000_000_000;
  it.each([[10_000, "just now"], [5 * 60_000, "5 min ago"], [3 * 3_600_000, "3 h ago"]])("%d ms ago is %s", (ago, text) => {
    expect(relativeTime(now - ago, now)).toBe(text);
  });
  it("is not negative for a clock that is slightly behind", () => {
    expect(relativeTime(now + 5000, now)).toBe("just now");
  });
});

describe("friendlyError", () => {
  it("pulls the server's sentence out of a Convex error", () => {
    const e = new Error("[CONVEX M(comments:create)] [Request ID: abc] Server Error\nUncaught Error: A comment needs text.\n    at handler (../convex/comments.ts:1:1)");
    expect(friendlyError(e)).toBe("A comment needs text.");
  });
  it("falls back for anything else", () => {
    expect(friendlyError(new Error("network down"))).toMatch(/Try again/);
    expect(friendlyError("x")).toMatch(/Try again/);
  });
});

describe("isSendKey", () => {
  it("sends on Enter only", () => {
    expect(isSendKey({ key: "Enter", shiftKey: false })).toBe(true);
    expect(isSendKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(isSendKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
    expect(isSendKey({ key: "a", shiftKey: false })).toBe(false);
  });
});
