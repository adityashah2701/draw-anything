import { describe, expect, it } from "vitest";
import { cardPosition, filterParticipants, friendlyError, groupThreads, insertMention, isSendKey, mentionQueryAt, mentionSegments, mentionsStillIn, relativeTime, visibleThreads, worldToScreen, type CommentDto, type Participant } from "./comments";

const c = (id: string, createdAt: number, over: Partial<CommentDto> = {}): CommentDto => ({
  _id: id, x: 0, y: 0, text: id, resolved: false, createdAt, authorId: "u", authorName: "U", authorImageUrl: "", mine: false, mentions: [], mentionsMe: false, ...over,
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

describe("mentions", () => {
  const people: Participant[] = [
    { _id: "1", name: "Sam Rivera", imageUrl: "" },
    { _id: "2", name: "Alex Kim", imageUrl: "" },
    { _id: "3", name: "Samira Noor", imageUrl: "" },
  ];

  describe("mentionQueryAt", () => {
    it("finds the @name being typed before the caret", () => {
      expect(mentionQueryAt("hi @sa", 6)).toEqual({ start: 3, query: "sa" });
      expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
      expect(mentionQueryAt("hi @Sam Ri", 10)).toEqual({ start: 3, query: "Sam Ri" });
    });
    it("ignores an @ inside a word (an email), after a newline, or too far back", () => {
      expect(mentionQueryAt("mail me@x.com", 13)).toBeNull();
      expect(mentionQueryAt("@sam\nnext line", 14)).toBeNull();
      expect(mentionQueryAt(`@${"a".repeat(40)}`, 41)).toBeNull();
      expect(mentionQueryAt("no at sign", 10)).toBeNull();
    });
    it("only looks before the caret", () => {
      expect(mentionQueryAt("@sam is here", 2)).toEqual({ start: 0, query: "s" });
    });
  });

  it("filters by name, starts-with first, case-insensitively, and never more than the limit", () => {
    expect(filterParticipants(people, "sam").map((p) => p.name)).toEqual(["Sam Rivera", "Samira Noor"]);
    expect(filterParticipants(people, "KIM").map((p) => p.name)).toEqual(["Alex Kim"]);
    expect(filterParticipants(people, "").length).toBe(3);
    expect(filterParticipants(people, "zzz")).toEqual([]);
    expect(filterParticipants(people, "", 2)).toHaveLength(2);
  });

  it("inserts the chosen name in place of the query and moves the caret after it", () => {
    expect(insertMention("hi @sa there", 3, 6, "Sam Rivera")).toEqual({ text: "hi @Sam Rivera  there", caret: 15 });
  });

  it("keeps a mention only while its @Name is still in the text", () => {
    expect(mentionsStillIn("hello @Sam Rivera", people)).toEqual(["1"]);
    expect(mentionsStillIn("hello Sam", people)).toEqual([]);
  });

  describe("mentionSegments", () => {
    it("marks mentions, longest name first, and leaves other @ text alone", () => {
      const segs = mentionSegments("ping @Samira Noor and @Sam Rivera, not @Sammy", [{ name: "Sam Rivera" }, { name: "Samira Noor" }]);
      expect(segs.filter((s) => s.mention).map((s) => s.text)).toEqual(["@Samira Noor", "@Sam Rivera"]);
      expect(segs.map((s) => s.text).join("")).toBe("ping @Samira Noor and @Sam Rivera, not @Sammy");
    });
    it("does not match inside a longer word", () => {
      expect(mentionSegments("@Samuel", [{ name: "Sam" }]).some((s) => s.mention)).toBe(false);
    });
    it("returns the plain text when there are no mentions", () => {
      expect(mentionSegments("hello", [])).toEqual([{ text: "hello", mention: false }]);
      expect(mentionSegments("", [])).toEqual([]);
    });
  });
});
