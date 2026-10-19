import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(patterns: string[]): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const ORG = "org_acme";

const setup = async () => {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    const make = (name: string) => ctx.db.insert("users", { clerkId: `clerk_${name}`, email: `${name}@x.test`, name, imageUrl: "" });
    return { alice: await make("alice"), bob: await make("bob"), carol: await make("carol") };
  });
  const boardId = await t.run((ctx) => ctx.db.insert("whiteboards", { title: "Board", createdBy: users.alice, orgId: ORG }));
  const otherBoard = await t.run((ctx) => ctx.db.insert("whiteboards", { title: "Other", createdBy: users.alice, orgId: ORG }));
  const as = (name: "alice" | "bob" | "carol", orgId = name === "carol" ? "org_other" : ORG) => t.withIdentity({ subject: `clerk_${name}`, org_id: orgId } as never);
  return { t, as, boardId, otherBoard, users };
};

describe("aiConversation: one shared conversation per board", () => {
  it("is shared by the creator and the organisation, and by nobody else", async () => {
    const { as, boardId } = await setup();
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "draw an API" }], history: "[]" });
    await as("bob").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "assistant", content: "done" }] });

    const seen = await as("bob").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(seen?.messages.map((m) => [m.role, m.content])).toEqual([["user", "draw an API"], ["assistant", "done"]]);
    expect(seen?.history).toBe("[]");

    expect(await as("carol").query(api.aiConversation.get, { whiteboardId: boardId })).toBeNull();
    await expect(as("carol").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "intruder" }] })).rejects.toThrow(/Unauthorized/);
    await expect(as("carol").mutation(api.aiConversation.clear, { whiteboardId: boardId })).rejects.toThrow(/Unauthorized/);
  });

  it("records who asked on user messages, from the caller, never from the client", async () => {
    const { as, boardId, users } = await setup();
    await as("bob").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] });
    const seen = await as("alice").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(seen?.messages[0].authorId).toBe(users.bob);
    expect(seen?.messages[1].authorId).toBeUndefined();
  });

  it("keeps boards apart, and keeps the newest 500 messages", async () => {
    const { as, boardId, otherBoard } = await setup();
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: otherBoard, messages: [{ role: "user", content: "elsewhere" }] });
    for (let i = 0; i < 13; i += 1) {
      await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: Array.from({ length: 40 }, (_, k) => ({ role: "status" as const, content: `m${i * 40 + k}` })) });
    }
    const seen = await as("alice").query(api.aiConversation.get, { whiteboardId: boardId, limit: 500 });
    expect(seen?.messages).toHaveLength(500);
    expect(seen?.messages[499].content).toBe("m519");
    expect(seen?.messages[0].content).toBe("m20");
    expect((await as("alice").query(api.aiConversation.get, { whiteboardId: otherBoard }))?.messages.map((m) => m.content)).toEqual(["elsewhere"]);
  });

  it("rejects oversize writes and clears only the conversation", async () => {
    const { as, boardId } = await setup();
    await expect(as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [], history: "x".repeat(130_000) })).rejects.toThrow(/too large/);
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "a" }], history: "[1]" });
    expect(await as("alice").mutation(api.aiConversation.clear, { whiteboardId: boardId })).toBe(1);
    const seen = await as("alice").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(seen?.messages).toEqual([]);
    expect(seen?.history).toBeNull();
  });
});

describe("aiConversation: legacy aiFrames history", () => {
  const frame = (createdBy: never, whiteboardId: string, frameId: string, prompt: string, status: "completed" | "failed", at: number) =>
    ({ frameId, whiteboardId, prompt, provider: "gemini", status, createdBy, createdAt: at, updatedAt: at + 1, ...(status === "completed" ? { finalElementIds: ["a", "b", "c"] } : { errorMessage: "model timed out" }) }) as const;

  it("imports old frames once, oldest first and before newer messages, and leaves aiFrames untouched", async () => {
    const { t, as, boardId, users } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiFrames", frame(users.alice as never, boardId, "f2", "second", "failed", 2_000));
      await ctx.db.insert("aiFrames", frame(users.alice as never, boardId, "f1", "first", "completed", 1_000));
    });
    await as("bob").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "newer" }] });

    expect(await as("bob").mutation(api.aiConversation.importLegacyFrames, { whiteboardId: boardId })).toEqual({ imported: 2 });
    expect(await as("bob").mutation(api.aiConversation.importLegacyFrames, { whiteboardId: boardId })).toEqual({ imported: 0 });

    const seen = await as("alice").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(seen?.messages.map((m) => m.content)).toEqual(["first", "Generated 3 elements.", "second", "Generation failed: model timed out", "newer"]);
    expect(seen?.messages[0].authorId).toBe(users.alice);
    expect(await t.run((ctx) => ctx.db.query("aiFrames").collect())).toHaveLength(2);

    // New messages still append after the imported ones.
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "latest" }] });
    const after = await as("alice").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(after?.messages.at(-1)?.content).toBe("latest");
  });

  it("refuses people without access to the board", async () => {
    const { as, boardId } = await setup();
    await expect(as("carol").mutation(api.aiConversation.importLegacyFrames, { whiteboardId: boardId })).rejects.toThrow(/Unauthorized/);
  });
});

describe("aiMemory: board memory for the remember tool", () => {
  it("saves, lists, de-duplicates and forgets, for people with access only", async () => {
    const { as, boardId, otherBoard } = await setup();
    const a = await as("alice").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "preference", text: "  Databases are   blue " });
    expect(a.duplicate).toBe(false);
    const dup = await as("bob").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "preference", text: "databases are blue" });
    expect(dup).toMatchObject({ duplicate: true, id: a.id });
    await as("bob").mutation(api.aiMemory.remember, { whiteboardId: otherBoard, kind: "decision", text: "other board only" });

    const list = await as("bob").query(api.aiMemory.listForBoard, { whiteboardId: boardId });
    expect(list.map((m) => [m.kind, m.text])).toEqual([["preference", "Databases are blue"]]);
    expect(await as("carol").query(api.aiMemory.listForBoard, { whiteboardId: boardId })).toEqual([]);
    await expect(as("carol").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "fact", text: "x y z" })).rejects.toThrow(/Unauthorized/);
    await expect(as("carol").mutation(api.aiMemory.forget, { id: a.id })).rejects.toThrow(/Unauthorized/);

    expect(await as("bob").mutation(api.aiMemory.forget, { id: a.id })).toBe(true);
    expect(await as("bob").query(api.aiMemory.listForBoard, { whiteboardId: boardId })).toEqual([]);
  });

  it("rejects empty and oversize text, and keeps at most 30, newest first", async () => {
    const { as, boardId } = await setup();
    await expect(as("alice").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "fact", text: " a " })).rejects.toThrow(/3 to 300/);
    await expect(as("alice").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "fact", text: "x".repeat(301) })).rejects.toThrow(/3 to 300/);
    for (let i = 0; i < 32; i += 1) await as("alice").mutation(api.aiMemory.remember, { whiteboardId: boardId, kind: "fact", text: `fact number ${i}` });
    const list = await as("alice").query(api.aiMemory.listForBoard, { whiteboardId: boardId });
    expect(list).toHaveLength(30);
    expect(list[0].text).toBe("fact number 31");
    expect(list.at(-1)?.text).toBe("fact number 2");
  });

  it("does not return legacy memories that have no kind", async () => {
    const { t, as, boardId, users } = await setup();
    await t.run((ctx) => ctx.db.insert("aiMemories", { whiteboardId: boardId, userId: users.alice, summary: "old", status: "generated", tags: [], createdAt: 1, updatedAt: 1 }));
    expect(await as("alice").query(api.aiMemory.listForBoard, { whiteboardId: boardId })).toEqual([]);
  });
});

describe("aiConversation: one run at a time", () => {
  const RUN_A = "run-aaaaaaaa";
  const RUN_B = "run-bbbbbbbb";

  it("lets one run hold the board, tells the others who, and frees it on release", async () => {
    const { as, boardId } = await setup();
    expect(await as("alice").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_A })).toEqual({ ok: true });
    expect(await as("bob").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_B })).toEqual({ ok: false, byName: "alice", mine: false });
    // the same person in another tab is also told to wait
    expect(await as("alice").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_B })).toEqual({ ok: false, byName: "alice", mine: true });

    const seen = await as("bob").query(api.aiConversation.get, { whiteboardId: boardId });
    expect(seen?.running).toMatchObject({ runId: RUN_A, byName: "alice", mine: false });
    expect((await as("alice").query(api.aiConversation.get, { whiteboardId: boardId }))?.running?.mine).toBe(true);

    expect(await as("bob").mutation(api.aiConversation.releaseRun, { whiteboardId: boardId, runId: RUN_A })).toBe(false); // not bob's to release
    expect(await as("alice").mutation(api.aiConversation.releaseRun, { whiteboardId: boardId, runId: RUN_A })).toBe(true);
    expect((await as("bob").query(api.aiConversation.get, { whiteboardId: boardId }))?.running).toBeNull();
    expect(await as("bob").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_B })).toEqual({ ok: true });
  });

  it("renews only for the holder, and a lease that ran out can be taken", async () => {
    const { t, as, boardId } = await setup();
    await as("alice").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_A });
    expect(await as("bob").mutation(api.aiConversation.renewRun, { whiteboardId: boardId, runId: RUN_A })).toBe(false);
    expect(await as("alice").mutation(api.aiConversation.renewRun, { whiteboardId: boardId, runId: RUN_B })).toBe(false);
    expect(await as("alice").mutation(api.aiConversation.renewRun, { whiteboardId: boardId, runId: RUN_A })).toBe(true);

    await t.run(async (ctx) => {
      const row = (await ctx.db.query("aiConversations").collect())[0];
      await ctx.db.patch(row._id, { leaseUntil: Date.now() - 1 });
    });
    expect((await as("bob").query(api.aiConversation.get, { whiteboardId: boardId }))?.running).toBeNull();
    expect(await as("alice").mutation(api.aiConversation.renewRun, { whiteboardId: boardId, runId: RUN_A })).toBe(true); // still hers until someone takes it
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("aiConversations").collect())[0];
      await ctx.db.patch(row._id, { leaseUntil: Date.now() - 1 });
    });
    expect(await as("bob").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_B })).toEqual({ ok: true });
    expect(await as("alice").mutation(api.aiConversation.renewRun, { whiteboardId: boardId, runId: RUN_A })).toBe(false); // lost
  });

  it("is only for people with access to the board, and checks the run id", async () => {
    const { as, boardId } = await setup();
    await expect(as("carol").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: RUN_A })).rejects.toThrow(/Unauthorized/);
    await expect(as("carol").mutation(api.aiConversation.releaseRun, { whiteboardId: boardId, runId: RUN_A })).rejects.toThrow(/Unauthorized/);
    await expect(as("alice").mutation(api.aiConversation.acquireRun, { whiteboardId: boardId, runId: "x" })).rejects.toThrow(/Invalid run id/);
  });
});

describe("aiConversation: summary of older turns", () => {
  it("stores, serves to people with access only, replaces, and clears with the conversation", async () => {
    const { as, boardId } = await setup();
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [{ role: "user", content: "a" }], summary: "- Asked: draw an API" });
    expect(await as("bob").query(api.aiConversation.summary, { whiteboardId: boardId })).toBe("- Asked: draw an API");
    expect(await as("carol").query(api.aiConversation.summary, { whiteboardId: boardId })).toBeNull();
    await as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [], summary: "- Asked: draw an API\n- Asked: rename" });
    expect(await as("bob").query(api.aiConversation.summary, { whiteboardId: boardId })).toContain("rename");
    await expect(as("alice").mutation(api.aiConversation.append, { whiteboardId: boardId, messages: [], summary: "x".repeat(4_001) })).rejects.toThrow(/too large/);
    await as("alice").mutation(api.aiConversation.clear, { whiteboardId: boardId });
    expect(await as("bob").query(api.aiConversation.summary, { whiteboardId: boardId })).toBeNull();
  });
});
