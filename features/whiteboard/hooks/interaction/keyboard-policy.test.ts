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

  it("bare letters are tools, Ctrl+letter is a command (c = ellipse vs copy)", () => {
    expect(resolveShortcut(ev("c"), ctx())).toEqual({ type: "tool", tool: "ellipse" });
    expect(resolveShortcut(ev("c", { ctrlKey: true }), ctx())).toEqual({ type: "copy" });
    expect(resolveShortcut(ev("d"), ctx())).toEqual({ type: "tool", tool: "diamond" });
    expect(resolveShortcut(ev("d", { metaKey: true }), ctx())).toEqual({ type: "duplicate" });
  });

  it("O picks the frame tool, and not for a viewer", () => {
    expect(resolveShortcut(ev("o"), ctx())).toEqual({ type: "tool", tool: "frame" });
    expect(resolveShortcut(ev("o"), ctx({ hasEditAccess: false }))).toBeNull();
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

describe("export shortcut", () => {
  it("opens export with Cmd/Ctrl+Shift+E, for viewers too", () => {
    expect(resolveShortcut(ev("E", { metaKey: true, shiftKey: true }), ctx())).toEqual({ type: "export" });
    expect(resolveShortcut(ev("e", { ctrlKey: true, shiftKey: true }), ctx({ hasEditAccess: false }))).toEqual({ type: "export" });
  });
  it("leaves plain E (eraser) and Cmd+E alone", () => {
    expect(resolveShortcut(ev("e"), ctx())).toEqual({ type: "tool", tool: "eraser" });
    expect(resolveShortcut(ev("e", { metaKey: true }), ctx())).toBeNull();
  });
  it("does nothing while typing", () => {
    expect(resolveShortcut(ev("E", { metaKey: true, shiftKey: true }), ctx({ textEntry: true }))).toBeNull();
  });

  it("m picks the comment tool for editors only", () => {
    expect(resolveShortcut(ev("m"), ctx())).toEqual({ type: "tool", tool: "comment" });
    expect(resolveShortcut(ev("m"), ctx({ hasEditAccess: false }))).toBeNull();
    expect(resolveShortcut(ev("m"), ctx({ textEntry: true }))).toBeNull();
  });

  it("i opens the icon picker and Enter edits the selection, for editors only", () => {
    expect(resolveShortcut(ev("i"), ctx())).toEqual({ type: "icon-picker" });
    expect(resolveShortcut(ev("i"), ctx({ hasEditAccess: false }))).toBeNull();
    expect(resolveShortcut(ev("Enter"), ctx({ hasSelection: true }))).toEqual({ type: "edit" });
    expect(resolveShortcut(ev("Enter"), ctx({ hasSelection: false }))).toBeNull();
    expect(resolveShortcut(ev("Enter"), ctx({ hasSelection: true, textEntry: true }))).toBeNull();
  });
});

describe("group, lock and align shortcuts", () => {
  it("Ctrl/Cmd+G groups and Ctrl/Cmd+Shift+G ungroups", () => {
    expect(resolveShortcut(ev("g", { ctrlKey: true }), ctx())).toEqual({ type: "group" });
    expect(resolveShortcut(ev("G", { metaKey: true, shiftKey: true }), ctx())).toEqual({ type: "ungroup" });
  });

  it("bare G is still the grid toggle", () => {
    expect(resolveShortcut(ev("g"), ctx())).toEqual({ type: "toggle-grid" });
  });

  it("Ctrl/Cmd+Shift+L toggles the lock; plain Ctrl+L is left to the browser", () => {
    expect(resolveShortcut(ev("L", { ctrlKey: true, shiftKey: true }), ctx())).toEqual({ type: "lock-toggle" });
    expect(resolveShortcut(ev("l", { ctrlKey: true }), ctx())).toBeNull();
  });

  it("none of them fire without a selection or edit access", () => {
    for (const e of [ev("g", { ctrlKey: true }), ev("g", { ctrlKey: true, shiftKey: true }), ev("L", { ctrlKey: true, shiftKey: true })]) {
      expect(resolveShortcut(e, ctx({ hasSelection: false }))).toBeNull();
      expect(resolveShortcut(e, ctx({ hasEditAccess: false }))).toBeNull();
    }
  });

  it("Alt plus a physical key aligns, even when Alt changes the typed character", () => {
    expect(resolveShortcut(ev("å", { altKey: true, code: "KeyA" }), ctx())).toEqual({ type: "align", mode: "left" });
    expect(resolveShortcut(ev("d", { altKey: true, code: "KeyD" }), ctx())).toEqual({ type: "align", mode: "right" });
    expect(resolveShortcut(ev("w", { altKey: true, code: "KeyW" }), ctx())).toEqual({ type: "align", mode: "top" });
    expect(resolveShortcut(ev("s", { altKey: true, code: "KeyS" }), ctx())).toEqual({ type: "align", mode: "bottom" });
    expect(resolveShortcut(ev("h", { altKey: true, code: "KeyH" }), ctx())).toEqual({ type: "align", mode: "center" });
    expect(resolveShortcut(ev("v", { altKey: true, code: "KeyV" }), ctx())).toEqual({ type: "align", mode: "middle" });
  });

  it("Alt+Shift+H/V distributes", () => {
    expect(resolveShortcut(ev("H", { altKey: true, shiftKey: true, code: "KeyH" }), ctx())).toEqual({ type: "distribute", axis: "horizontal" });
    expect(resolveShortcut(ev("V", { altKey: true, shiftKey: true, code: "KeyV" }), ctx())).toEqual({ type: "distribute", axis: "vertical" });
    expect(resolveShortcut(ev("A", { altKey: true, shiftKey: true, code: "KeyA" }), ctx())).toBeNull();
  });

  it("align shortcuts stay quiet while typing, without a selection and for viewers", () => {
    const e = ev("a", { altKey: true, code: "KeyA" });
    expect(resolveShortcut(e, ctx({ textEntry: true }))).toBeNull();
    expect(resolveShortcut(e, ctx({ hasSelection: false }))).toBeNull();
    expect(resolveShortcut(e, ctx({ hasEditAccess: false }))).toBeNull();
  });

  it("Alt with other keys still does nothing, and Alt+Ctrl combinations are untouched", () => {
    expect(resolveShortcut(ev("r", { altKey: true, code: "KeyR" }), ctx())).toBeNull();
    expect(resolveShortcut(ev("a", { altKey: true, ctrlKey: true, code: "KeyA" }), ctx())).toBeNull();
  });
});
