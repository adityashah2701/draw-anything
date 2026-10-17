/**
 * In-memory Convex for one board. Models: getById / update / the AI-frame bookkeeping the editor calls,
 * persisted to localStorage (so page.reload() reads back what autosave wrote). Does NOT model: auth,
 * organisations, access rules (convex/lib/access.ts), validators, other tables, realtime pushes, latency,
 * size limits. Comments (comments:list/create/reply/setResolved/remove) are kept in memory and in localStorage;
 * the server's author and access checks are NOT modelled (every comment is "mine" unless a test seeds another
 * author). "Read-only" is how the real server expresses no access: getById returns null.
 */
import type { EditorInit } from "../types";

export interface FakeBoard {
  _id: string;
  _creationTime: number;
  title: string;
  content: string | undefined;
}

export interface FakeComment {
  _id: string;
  parentId?: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  createdAt: number;
  authorId: string;
  authorName: string;
  authorImageUrl: string;
  mine: boolean;
  mentions: Array<{ id: string; name: string }>;
  mentionsMe: boolean;
  /** The ids the client sent (what the server would validate); for tests. */
  sentMentions?: string[];
}

const listeners = new Set<() => void>();
let comments: FakeComment[] = [];
let commentSeq = 0;
let participantsCache: { source: FakeComment[]; value: Array<{ _id: string; name: string; imageUrl: string }> } | null = null;

/** Other people who have commented (the fake has no creator or organization); stable between changes for useSyncExternalStore. */
const participants = () => {
  if (participantsCache?.source !== comments) {
    const seen = new Map<string, { _id: string; name: string; imageUrl: string }>();
    for (const c of comments) if (!c.mine && !seen.has(c.authorId)) seen.set(c.authorId, { _id: c.authorId, name: c.authorName, imageUrl: "" });
    participantsCache = { source: comments, value: [...seen.values()] };
  }
  return participantsCache.value;
};
let board: FakeBoard | null = null;
let saves = 0;
let readOnly = false;
const log: string[] = [];

const storageKey = (id: string) => `fake-convex:${id}`;
const notify = () => listeners.forEach((l) => l());

const persistComments = () => {
  if (!board) return;
  try {
    localStorage.setItem(`${storageKey(board._id)}:comments`, JSON.stringify(comments));
  } catch {
    // not persisted: a reload would start without comments
  }
};

/** The server's text rule, mirrored so the UI's error path can be exercised. */
const mutateComments = (name: string, args: Record<string, unknown>): string | null => {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if ((name === "comments:create" || name === "comments:reply") && !text) {
    throw new Error("[CONVEX M(comments)] Server Error\nUncaught Error: A comment needs text.\n    at handler");
  }
  let id: string | null = null;
  if (name === "comments:create" || name === "comments:reply") {
    commentSeq += 1;
    id = `c${commentSeq}`;
    const root = name === "comments:reply" ? comments.find((c) => c._id === args.threadId) : undefined;
    comments = [
      ...comments,
      {
        _id: id,
        parentId: root?._id,
        x: root ? root.x : Number(args.x),
        y: root ? root.y : Number(args.y),
        text,
        resolved: false,
        createdAt: Date.now(),
        authorId: "me",
        authorName: "Test User",
        authorImageUrl: "",
        mine: true,
        mentions: (Array.isArray(args.mentions) ? (args.mentions as string[]) : []).flatMap((id) => participants().filter((p) => p._id === id).map((p) => ({ id: p._id, name: p.name }))),
        mentionsMe: false,
        sentMentions: Array.isArray(args.mentions) ? (args.mentions as string[]) : [],
      },
    ];
  } else if (name === "comments:setResolved") {
    comments = comments.map((c) => (c._id === args.threadId ? { ...c, resolved: Boolean(args.resolved) } : c));
  } else if (name === "comments:remove") {
    comments = comments.filter((c) => c._id !== args.commentId && c.parentId !== args.commentId);
  }
  persistComments();
  notify();
  return id;
};

export const backend = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  /** Stable reference between changes: useQuery snapshots rely on it. */
  board: (): FakeBoard | null => board,
  configure(init: EditorInit) {
    readOnly = init.readOnly;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey(init.boardId));
    } catch {
      // storage blocked: behave like a board that has never been saved
    }
    const content = stored !== null ? (JSON.parse(stored) as { content?: string }).content : (init.content ?? undefined);
    board = readOnly ? null : { _id: init.boardId, _creationTime: 1_700_000_000_000, title: "Test Board", content };
    try {
      comments = JSON.parse(localStorage.getItem(`${storageKey(init.boardId)}:comments`) ?? "[]");
      commentSeq = comments.length;
    } catch {
      comments = [];
    }
    notify();
  },
  query(name: string): unknown {
    if (name === "whiteboard:getById" || name === "whiteboard:getAccess") return board;
    if (name === "comments:list") return board ? comments : [];
    if (name === "comments:participants") return board ? participants() : [];
    return null;
  },
  async mutate(name: string, args: Record<string, unknown> | undefined): Promise<unknown> {
    log.push(name);
    if (name === "whiteboard:update") {
      if (readOnly || !board) throw new Error("Unauthorized: you do not have permission to edit this whiteboard");
      const patch = args ?? {};
      board = {
        ...board,
        ...(typeof patch.content === "string" ? { content: patch.content } : {}),
        ...(typeof patch.title === "string" ? { title: patch.title } : {}),
      };
      saves += 1;
      try {
        localStorage.setItem(storageKey(board._id), JSON.stringify({ content: board.content }));
      } catch {
        // not persisted: reload will start empty, which a test would notice
      }
      notify();
      return null;
    }
    if (name.startsWith("comments:")) return mutateComments(name, args ?? {});
    if (name === "aiFrames:create") return "fake-ai-frame";
    return null;
  },
  /** Test hook: adds a comment written by someone else. */
  seedComment(comment: Partial<FakeComment> & Pick<FakeComment, "x" | "y" | "text">) {
    commentSeq += 1;
    comments = [
      ...comments,
      { _id: `c${commentSeq}`, resolved: false, createdAt: Date.now(), authorId: "other", authorName: "Sam Rivera", authorImageUrl: "", mine: false, mentions: [], mentionsMe: false, ...comment },
    ];
    persistComments();
    notify();
  },
  comments: (): FakeComment[] => comments,
  savedContent: () => board?.content ?? null,
  saveCount: () => saves,
  mutationLog: () => [...log],
};
