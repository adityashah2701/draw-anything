import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const KEY = "draw-anything:clipboard:v1";

interface Stored {
  elements: DrawingElement[];
  /** How many times this content has been pasted, so each paste lands a step further. */
  pastes: number;
}

let memory: Stored | null = null;

/** Best effort: sessionStorage lets a copy survive a board switch; memory covers when it is unavailable. */
const read = (): Stored | null => {
  if (memory) return memory;
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    if (parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0) memory = parsed;
  } catch {
    // ignore: fall through to memory only
  }
  return memory;
};

const write = (value: Stored) => {
  memory = value;
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // quota or privacy mode: memory copy still works
  }
};

export const copyToClipboard = (elements: DrawingElement[]) => {
  if (elements.length > 0) write({ elements: structuredClone(elements), pastes: 0 });
};

/** The copied elements and the offset multiplier for this paste (1, 2, 3...); advances the counter. */
export const takeFromClipboard = (): { elements: DrawingElement[]; step: number } | null => {
  const stored = read();
  if (!stored) return null;
  const step = stored.pastes + 1;
  write({ ...stored, pastes: step });
  return { elements: structuredClone(stored.elements), step };
};

export const hasClipboard = () => read() !== null;
export const clearClipboardForTests = () => {
  memory = null;
};
