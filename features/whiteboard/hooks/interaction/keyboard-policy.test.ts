import { describe, expect, it } from "vitest";
import { isTextEntryTarget, resolveShortcut, type ShortcutContext, type ShortcutEvent } from "./keyboard-policy";

const ev = (key: string, mods: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
});
const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({ textEntry: false, hasEditAccess: true, hasSelection: true, ...over });

describe("shortcuts while typing", () => {
  it.each(["z", "a", "s", "c", "v", "d", "?", "Delete", "Backspace", "ArrowLeft", " ", "f", "g", "Escape"])(
    "%s does nothing in a text field, with or without Ctrl",
    (key) => {
      expect(resolveShortcut(ev(key), ctx({ textEntry: true }))).toBeNull();
      expect(resolveShortcut(ev(key, { ctrlKey: true }), ctx({ textEntry: true }))).toBeNull();
    },
  );

  it("recognises what counts as text entry, without DOM globals", () => {
    expect(isTextEntryTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "input" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: "CANVAS" })).toBe(false);
    for (const bad of [null, undefined, 5, "x", {}]) expect(isTextEntryTarget(bad)).toBe(false);
  });
});

describe("canvas shortcuts", () => {
  it("maps undo/redo/select-all with Ctrl or Cmd", () => {
    expect(resolveShortcut(ev("z", { metaKey: true }), ctx())).toEqual({ type: "undo" });
    expect(resolveShortcut(ev("Z", { ctrlKey: true, shiftKey: true }), ctx())).toEqual({ type: "redo" });
    expect(resolveShortcut(ev("a", { ctrlKey: true }), ctx())).toEqual({ type: "select-all" });
  });

  it("bare letters are tools, Ctrl+letter is a command (c = circle vs copy)", () => {
    expect(resolveShortcut(ev("c"), ctx())).toEqual({ type: "tool", tool: "circle" });
    expect(resolveShortcut(ev("c", { ctrlKey: true }), ctx())).toEqual({ type: "copy" });
    expect(resolveShortcut(ev("d"), ctx())).toEqual({ type: "tool", tool: "diamond" });
    expect(resolveShortcut(ev("d", { metaKey: true }), ctx())).toEqual({ type: "duplicate" });
  });

  it("nudges by 1, or 10 with Shift, only when something is selected", () => {
    expect(resolveShortcut(ev("ArrowRight"), ctx())).toEqual({ type: "nudge", dx: 1, dy: 0 });
    expect(resolveShortcut(ev("ArrowUp", { shiftKey: true }), ctx())).toEqual({ type: "nudge", dx: 0, dy: -10 });
    expect(resolveShortcut(ev("ArrowUp"), ctx({ hasSelection: false }))).toBeNull();
  });

  it("z-order: ] forward, Shift+] to front, [ backward, Shift+[ to back", () => {
    expect(resolveShortcut(ev("]", { ctrlKey: true }), ctx())).toEqual({ type: "z-order", move: "forward" });
    expect(resolveShortcut(ev("]", { ctrlKey: true, shiftKey: true }), ctx())).toEqual({ type: "z-order", move: "front" });
    expect(resolveShortcut(ev("[", { ctrlKey: true }), ctx())).toEqual({ type: "z-order", move: "backward" });
    expect(resolveShortcut(ev("[", { ctrlKey: true, shiftKey: true }), ctx())).toEqual({ type: "z-order", move: "back" });
  });

  it("read-only viewers can copy, zoom and select but cannot change the board", () => {
    const ro = ctx({ hasEditAccess: false });
    expect(resolveShortcut(ev("c", { ctrlKey: true }), ro)).toEqual({ type: "copy" });
    expect(resolveShortcut(ev("a", { ctrlKey: true }), ro)).toEqual({ type: "select-all" });
    for (const [k, m] of [["v", true], ["x", true], ["d", true], ["z", true], ["Delete", false], ["ArrowLeft", false], ["r", false]] as const) {
      expect(resolveShortcut(ev(k, { ctrlKey: m }), ro), k).toBeNull();
    }
    expect(resolveShortcut(ev("h"), ro)).toEqual({ type: "tool", tool: "hand" });
  });

  it("Delete needs a selection; held Space does not repeat; unknown keys are left alone", () => {
    expect(resolveShortcut(ev("Delete"), ctx({ hasSelection: false }))).toBeNull();
    expect(resolveShortcut(ev(" ", { repeat: true }), ctx())).toBeNull();
    expect(resolveShortcut(ev("q"), ctx())).toBeNull();
    expect(resolveShortcut(ev("r", { ctrlKey: true }), ctx())).toBeNull(); // browser reload keeps working
    expect(resolveShortcut(ev("c", { altKey: true }), ctx())).toBeNull();
  });
});
