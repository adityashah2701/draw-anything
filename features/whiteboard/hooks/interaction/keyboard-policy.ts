import type { Tool } from "@/features/whiteboard/types/whiteboard.types";
import type { AlignMode, DistributeAxis } from "@/features/whiteboard/utils/arrange";

export type ShortcutCommand =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "save" }
  | { type: "select-all" }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "duplicate" }
  | { type: "group" }
  | { type: "ungroup" }
  | { type: "lock-toggle" }
  | { type: "hide" }
  | { type: "align"; mode: AlignMode }
  | { type: "distribute"; axis: DistributeAxis }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "z-order"; move: "front" | "forward" | "backward" | "back" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "zoom-reset" }
  | { type: "fit" }
  | { type: "toggle-grid" }
  | { type: "toggle-help" }
  | { type: "export" }
  | { type: "icon-picker" }
  | { type: "edit" }
  | { type: "tool"; tool: Tool }
  | { type: "hand-hold" };

export interface ShortcutEvent {
  key: string;
  /** Physical key ("KeyA"). Alt changes `key` on some layouts (Option+A types "å"), so Alt shortcuts read this. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat?: boolean;
}

export interface ShortcutContext {
  /** True when focus is in an input, textarea, select or contentEditable element. */
  textEntry: boolean;
  hasEditAccess: boolean;
  hasSelection: boolean;
}

/** Anything the user can type into. Duck-typed so it needs no DOM globals (tests run in node). */
export const isTextEntryTarget = (target: unknown): boolean => {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === "string" && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName.toUpperCase());
};

const TOOL_KEYS: Record<string, { tool: Tool; edit: boolean }> = {
  v: { tool: "select", edit: false },
  p: { tool: "pen", edit: true },
  r: { tool: "rectangle", edit: true },
  c: { tool: "ellipse", edit: true },
  d: { tool: "diamond", edit: true },
  o: { tool: "frame", edit: true },
  l: { tool: "line", edit: true },
  a: { tool: "arrow", edit: true },
  b: { tool: "arrow-bidirectional", edit: true },
  t: { tool: "text", edit: true },
  e: { tool: "eraser", edit: true },
  m: { tool: "comment", edit: true },
  h: { tool: "hand", edit: false },
};

/** Align shortcuts (Alt + physical key), the same letters other editors use. */
const ALIGN_KEYS: Record<string, AlignMode> = {
  KeyA: "left",
  KeyD: "right",
  KeyW: "top",
  KeyS: "bottom",
  KeyH: "center",
  KeyV: "middle",
};

const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const;

/**
 * Maps a key event to a canvas command, or null to leave the event alone. While the user is typing
 * nothing is mapped (not even Ctrl+A/Z or `?`), so text fields keep their own select-all, undo and
 * punctuation. Commands that change the board are withheld from read-only viewers.
 */
export const resolveShortcut = (e: ShortcutEvent, ctx: ShortcutContext): ShortcutCommand | null => {
  if (ctx.textEntry) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = e.ctrlKey || e.metaKey;
  const edit = ctx.hasEditAccess;

  if (key === "?" || (mod && key === "/")) return { type: "toggle-help" };

  // Alt+letter aligns the selection; Alt+Shift+H/V spreads three or more evenly.
  if (e.altKey && !mod && e.code && e.code in ALIGN_KEYS) {
    if (!edit || !ctx.hasSelection) return null;
    if (e.shiftKey) {
      if (e.code === "KeyH") return { type: "distribute", axis: "horizontal" };
      if (e.code === "KeyV") return { type: "distribute", axis: "vertical" };
      return null;
    }
    return { type: "align", mode: ALIGN_KEYS[e.code] };
  }

  if (mod) {
    if (e.altKey) return null;
    switch (key) {
      case "z":
        if (!edit) return null;
        return e.shiftKey ? { type: "redo" } : { type: "undo" };
      case "y":
        return edit ? { type: "redo" } : null;
      case "s":
        return { type: "save" };
      case "e":
        return e.shiftKey ? { type: "export" } : null;
      case "a":
        return { type: "select-all" };
      case "c":
        return ctx.hasSelection ? { type: "copy" } : null;
      case "x":
        return edit && ctx.hasSelection ? { type: "cut" } : null;
      case "v":
        return edit ? { type: "paste" } : null;
      case "d":
        return edit && ctx.hasSelection ? { type: "duplicate" } : null;
      case "g":
        if (!edit || !ctx.hasSelection) return null;
        return e.shiftKey ? { type: "ungroup" } : { type: "group" };
      case "l":
        return edit && ctx.hasSelection && e.shiftKey ? { type: "lock-toggle" } : null;
      case "h":
        return edit && ctx.hasSelection && e.shiftKey ? { type: "hide" } : null;
      case "]":
        return edit && ctx.hasSelection ? { type: "z-order", move: e.shiftKey ? "front" : "forward" } : null;
      case "[":
        return edit && ctx.hasSelection ? { type: "z-order", move: e.shiftKey ? "back" : "backward" } : null;
      case "=":
      case "+":
        return { type: "zoom-in" };
      case "-":
        return { type: "zoom-out" };
      case "0":
        return { type: "zoom-reset" };
      default:
        return null;
    }
  }

  if (key in NUDGE) {
    if (!edit || !ctx.hasSelection) return null;
    const [x, y] = NUDGE[key as keyof typeof NUDGE];
    const step = e.shiftKey ? 10 : 1;
    return { type: "nudge", dx: x * step, dy: y * step };
  }
  if (key === "Delete" || key === "Backspace") return edit && ctx.hasSelection ? { type: "delete" } : null;
  if (key === "Escape") return { type: "escape" };
  if (key === "Enter") return edit && ctx.hasSelection ? { type: "edit" } : null;
  if (key === " ") return e.repeat ? null : { type: "hand-hold" };
  if (e.shiftKey && key === "!") return { type: "fit" };
  if (e.altKey) return null;
  if (key === "i") return edit ? { type: "icon-picker" } : null;
  if (key === "g") return { type: "toggle-grid" };
  if (key === "f") return { type: "fit" };
  const tool = TOOL_KEYS[key];
  if (tool && (!tool.edit || edit)) return { type: "tool", tool: tool.tool };
  return null;
};
