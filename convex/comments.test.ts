import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// vite's `import.meta.glob`, which convex-test needs to find the functions (vite/client types are not installed).
declare global {
  interface ImportMeta {
    glob(patterns: string[]): Record<string, () => Promise<unknown>>;
  }
}

// The real functions against convex-test's in-memory database, with real auth identities and org claims.
const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const ORG = "org_acme";

const setup = async () => {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    const make = (name: string) => ctx.db.insert("users", { clerkId: `clerk_${name}`, email: `${name}@x.test`, name, imageUrl: "" });
    return { alice: await make("alice"), bob: await make("bob"), carol: await make("carol") };
  });
  // alice created the board in ORG; bob is in the org; carol is in another one.
  const boardId = await t.run((ctx) => ctx.db.insert("whiteboards", { title: "Board", createdBy: users.alice, orgId: ORG }));
  const as = (name: "alice" | "bob" | "carol", orgId = name === "carol" ? "org_other" : ORG) =>
    t.withIdentity({ subject: `clerk_${name}`, org_id: orgId } as never);
  return { t, as, boardId, users };
};

describe("comments: access", () => {
  it("lets the board's creator and members of its organization read and write, and nobody else", async () => {
    const { as, boardId } = await setup();
    await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 1, y: 2, text: "by the creator" });
    await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 3, y: 4, text: "by a member" });
    expect((await as("bob").query(api.comments.list, { whiteboardId: boardId })).map((c) => c.text)).toEqual(["by the creator", "by a member"]);

    await expect(as("carol").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "intruder" })).rejects.toThrow(/Unauthorized/);
    expect(await as("carol").query(api.comments.list, { whiteboardId: boardId })).toEqual([]); // no leak, no error
  });

  it("refuses anonymous callers on writes and returns nothing on reads", async () => {
    const { t, boardId } = await setup();
    await expect(t.mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "hi" })).rejects.toThrow(/Unauthorized/);
    expect(await t.query(api.comments.list, { whiteboardId: boardId })).toEqual([]);
  });

  it("a member whose token carries no organization cannot act on an org board they did not create", async () => {
    const { t, boardId } = await setup();
    await expect(
      t.withIdentity({ subject: "clerk_bob" } as never).mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "no org claim" }),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("does not let a stranger reply to, resolve or delete a thread on a board they cannot open", async () => {
    const { as, boardId } = await setup();
    const thread = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "private" });
    await expect(as("carol").mutation(api.comments.reply, { threadId: thread, text: "x" })).rejects.toThrow(/Unauthorized/);
    await expect(as("carol").mutation(api.comments.setResolved, { threadId: thread, resolved: true })).rejects.toThrow(/Unauthorized/);
    await expect(as("carol").mutation(api.comments.remove, { commentId: thread })).rejects.toThrow(/Unauthorized/);
  });
});

describe("comments: content rules", () => {
  it("trims text and rejects empty, blank and over-long comments", async () => {
    const { as, boardId } = await setup();
    const id = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "  hello  " });
    expect((await as("alice").query(api.comments.list, { whiteboardId: boardId }))[0]).toMatchObject({ _id: id, text: "hello" });
    for (const text of ["", "   \n", "x".repeat(2001)]) {
      await expect(as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text })).rejects.toThrow();
    }
  });

  it("rejects positions that are not on a board", async () => {
    const { as, boardId } = await setup();
    await expect(as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 5e6, y: 0, text: "far" })).rejects.toThrow(/position/);
    await expect(as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: Number.POSITIVE_INFINITY, y: 0, text: "inf" })).rejects.toThrow();
  });
});

describe("comments: threads", () => {
  it("replies attach to the thread root, inherit its position, and show the author", async () => {
    const { as, boardId } = await setup();
    const root = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 10, y: 20, text: "root" });
    const reply = await as("bob").mutation(api.comments.reply, { threadId: root, text: "reply" });
    await expect(as("bob").mutation(api.comments.reply, { threadId: reply, text: "reply to a reply" })).rejects.toThrow(/Thread not found/);
    const list = await as("bob").query(api.comments.list, { whiteboardId: boardId });
    expect(list.map((c) => [c.text, c.parentId ?? null, c.x, c.y, c.authorName, c.mine])).toEqual([
      ["root", null, 10, 20, "alice", false],
      ["reply", root, 10, 20, "bob", true],
    ]);
  });

  it("any member can resolve and reopen a thread", async () => {
    const { as, boardId } = await setup();
    const root = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "t" });
    await as("bob").mutation(api.comments.setResolved, { threadId: root, resolved: true });
    expect((await as("alice").query(api.comments.list, { whiteboardId: boardId }))[0].resolved).toBe(true);
    await as("bob").mutation(api.comments.setResolved, { threadId: root, resolved: false });
    expect((await as("alice").query(api.comments.list, { whiteboardId: boardId }))[0].resolved).toBe(false);
  });
});

describe("comments: deletion", () => {
  it("the author may delete, another member may not, and the board creator may (moderation)", async () => {
    const { as, boardId } = await setup();
    const byBob = await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "bob's" });
    const bobsOther = await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 1, y: 1, text: "bob's second" });
    await as("alice").mutation(api.comments.remove, { commentId: byBob }); // creator moderates
    expect((await as("alice").query(api.comments.list, { whiteboardId: boardId })).map((c) => c.text)).toEqual(["bob's second"]);
    await as("bob").mutation(api.comments.remove, { commentId: bobsOther }); // author
    expect(await as("alice").query(api.comments.list, { whiteboardId: boardId })).toEqual([]);
  });

  it("a member who is neither author nor creator cannot delete someone else's comment", async () => {
    const { t, as, boardId } = await setup();
    await t.run((ctx) => ctx.db.insert("users", { clerkId: "clerk_dave", email: "d@x.test", name: "dave", imageUrl: "" }));
    const asDave = t.withIdentity({ subject: "clerk_dave", org_id: ORG } as never);
    const byBob = await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "bob's" });
    await expect(asDave.mutation(api.comments.remove, { commentId: byBob })).rejects.toThrow(/Only the author/);
    expect(await as("alice").query(api.comments.list, { whiteboardId: boardId })).toHaveLength(1);
  });

  it("deleting a thread deletes its replies, deleting a reply keeps the thread, and a missing comment is a no-op", async () => {
    const { as, boardId } = await setup();
    const root = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "root" });
    const r1 = await as("bob").mutation(api.comments.reply, { threadId: root, text: "r1" });
    await as("alice").mutation(api.comments.reply, { threadId: root, text: "r2" });
    await as("bob").mutation(api.comments.remove, { commentId: r1 });
    expect((await as("alice").query(api.comments.list, { whiteboardId: boardId })).map((c) => c.text)).toEqual(["root", "r2"]);
    await as("alice").mutation(api.comments.remove, { commentId: root });
    expect(await as("alice").query(api.comments.list, { whiteboardId: boardId })).toEqual([]);
    await as("alice").mutation(api.comments.remove, { commentId: root }); // already gone
  });
});

describe("comments: mentions", () => {
  it("lists the board's creator and everyone who has commented as mentionable, except the caller", async () => {
    const { as, boardId, users } = await setup();
    await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "hi" });
    const forBob = await as("bob").query(api.comments.participants, { whiteboardId: boardId });
    expect(forBob.map((p) => p.name)).toEqual(["alice"]); // the creator; bob himself is left out
    const forAlice = await as("alice").query(api.comments.participants, { whiteboardId: boardId });
    expect(forAlice.map((p) => p._id)).toEqual([users.bob]);
    expect(await as("carol").query(api.comments.participants, { whiteboardId: boardId })).toEqual([]); // not on the board
  });

  it("stores valid mentions, drops strangers and self, and tells the mentioned person", async () => {
    const { as, boardId, users } = await setup();
    await as("bob").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "@alice @carol @bob look", mentions: [users.alice, users.carol, users.bob] });
    const seenByAlice = (await as("alice").query(api.comments.list, { whiteboardId: boardId }))[0];
    expect(seenByAlice.mentions).toEqual([{ id: users.alice, name: "alice" }]); // carol is not a participant, bob is the author
    expect(seenByAlice.mentionsMe).toBe(true);
    const seenByBob = (await as("bob").query(api.comments.list, { whiteboardId: boardId }))[0];
    expect(seenByBob.mentionsMe).toBe(false);
  });

  it("replies can mention a participant who joined the thread earlier", async () => {
    const { as, boardId, users } = await setup();
    const root = await as("alice").mutation(api.comments.create, { whiteboardId: boardId, x: 0, y: 0, text: "root" });
    await as("bob").mutation(api.comments.reply, { threadId: root, text: "bob here" });
    await as("alice").mutation(api.comments.reply, { threadId: root, text: "@bob thanks", mentions: [users.bob] });
    const list = await as("bob").query(api.comments.list, { whiteboardId: boardId });
    expect(list.find((c) => c.text === "@bob thanks")).toMatchObject({ mentionsMe: true, mentions: [{ id: users.bob, name: "bob" }] });
  });
});
