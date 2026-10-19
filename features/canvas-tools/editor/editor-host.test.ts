import { describe, expect, it, vi } from "vitest";
import { applyPatch } from "@/core/groups/patch";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { node } from "../test-helpers";
import { createCanvasTools } from "../runtime";
import { createEditorHost, type EditorHandles } from "./editor-host";

/** The handles the editor gives the host, over a plain list that behaves like shared storage with history. */
const handles = (initial: StoredElement[], overrides: Partial<EditorHandles> = {}) => {
  let stored = initial;
  let selection: string[] = [];
  const past: StoredElement[][] = [];
  const future: StoredElement[][] = [];
  const h: EditorHandles = {
    stored: () => stored,
    applyPatch: (patch) => {
      past.push(stored);
      future.length = 0;
      stored = applyPatch(stored, patch);
    },
    selection: { get: () => selection, set: (ids) => void (selection = ids) },
    viewport: () => ({ zoom: 1, pan: { x: 0, y: 0 }, width: 800, height: 600 }),
    document: () => ({ id: "b", title: "Board", canEdit: true }),
    newId: (() => { let n = 0; return () => `e${(n += 1)}`; })(),
    bounds: () => null,
    history: {
      undo: () => { const p = past.pop(); if (p) { future.push(stored); stored = p; } },
      redo: () => { const f = future.pop(); if (f) { past.push(stored); stored = f; } },
    },
    fit: vi.fn(),
    save: async () => ({ saved: true }),
    loadBoard: async () => null,
    exportBoard: async () => ({ filename: "x.png", mime: "image/png", bytes: 1, width: 1, height: 1 }),
    confirm: async () => true,
    ...overrides,
  };
  return { h, get stored() { return stored; } };
};

describe("editor host", () => {
  it("runs the real tools against the editor handles, with undo detecting what changed", async () => {
    const live = handles([node("a", "A", 0, 0)]);
    const tools = createCanvasTools({ host: createEditorHost(live.h), groups: ["create", "document"] });
    const made = await tools.execute({ name: "create_shape", args: { id: "r", shape: "rectangle" } });
    expect(made.ok).toBe(true);
    expect(live.stored.map((e) => e.id)).toEqual(["a", "r"]);
    const undone = await tools.execute({ name: "undo_action", args: {} });
    expect(undone.affected.removed).toEqual(["r"]);
    expect((await tools.execute({ name: "undo_action", args: {} })).summary).toBe("Nothing to undo.");
    expect((await tools.execute({ name: "redo_action", args: {} })).affected.created).toEqual(["r"]);
  });

  it("loads another whiteboard through loadBoard: null means no access, saved JSON is parsed and sanitised", async () => {
    const board = JSON.stringify({ elements: [node("x", "X", 0, 0), node("x", "Dup", 5, 5), { id: 7 }, node("y", "Y", 300, 0)] });
    const loadBoard = vi.fn(async (id: string) => (id === "mine-mine-1" ? { content: board, title: "Shared" } : null));
    const live = handles([], { loadBoard });
    const tools = createCanvasTools({ host: createEditorHost(live.h), groups: ["document"] });
    const denied = await tools.execute({ name: "load_document", args: { whiteboard_id: "not-yours-1", mode: "merge" } });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatchObject({ code: "not_found", message: "That whiteboard does not exist or you do not have access to it." });
    expect(live.stored).toEqual([]);
    const loaded = await tools.execute({ name: "load_document", args: { whiteboard_id: "mine-mine-1", mode: "merge" } });
    expect(loaded.ok).toBe(true);
    expect(live.stored).toHaveLength(2);
    expect(loadBoard).toHaveBeenCalledTimes(2);
  });

  it("asks the person through confirm, and a decline stops a destructive tool", async () => {
    const confirm = vi.fn(async () => false);
    const live = handles([node("a", "A", 0, 0)], { confirm });
    const tools = createCanvasTools({ host: createEditorHost(live.h), groups: ["document"] });
    const result = await tools.execute({ name: "clear_canvas", args: { confirm: true } });
    expect(result.error?.code).toBe("confirmation_denied");
    expect(confirm).toHaveBeenCalledWith({ tool: "clear_canvas", message: expect.stringContaining("1 elements") });
    expect(live.stored).toHaveLength(1);
  });

  it("reports a read-only board as such", async () => {
    const live = handles([node("a", "A", 0, 0)], { document: () => ({ id: "b", canEdit: false }) });
    const tools = createCanvasTools({ host: createEditorHost(live.h), groups: ["edit"] });
    expect((await tools.execute({ name: "delete_elements", args: { ids: ["a"] } })).error?.code).toBe("read_only");
    expect((await tools.execute({ name: "get_document_state", args: {} })).ok).toBe(true);
  });
});

describe("editor host: backend errors do not reach the model", () => {
  it("turns a failing backend read into the same sentence as 'not yours'", async () => {
    const live = handles([], { loadBoard: async () => { throw new Error("convex: internal server detail 0xdeadbeef"); } });
    const tools = createCanvasTools({ host: createEditorHost(live.h), groups: ["document"] });
    const result = await tools.execute({ name: "load_document", args: { whiteboard_id: "some-board-1", mode: "merge" } });
    expect(JSON.stringify(result)).not.toContain("0xdeadbeef");
    expect(result.error?.code).toBe("not_found");
  });
});
