/** Pure editing helpers for the code field: they take text and a selection and return the new text and selection. */

const UNIT = "  ";

export interface Edit {
  text: string;
  /** New selection. */
  from: number;
  to: number;
}

const lineStartOf = (text: string, offset: number) => text.lastIndexOf("\n", offset - 1) + 1;

const codeBefore = (text: string, lineStart: number, offset: number): string => {
  const line = text.slice(lineStart, offset);
  const cut = line.search(/(^|\s)\/\//);
  return (cut === -1 ? line : line.slice(0, cut)).trimEnd();
};

/**
 * Enter: the new line keeps the current indentation and goes one level deeper after an opening `{`.
 * Pressing Enter between `{` and `}` puts the `}` on a line of its own.
 */
export const enter = (text: string, from: number, to: number): Edit => {
  const start = lineStartOf(text, from);
  const base = /^[ \t]*/.exec(text.slice(start))![0];
  const opens = codeBefore(text, start, from).endsWith("{");
  const between = opens && text.slice(to).trimStart().startsWith("}") && /^[ \t]*$/.test(text.slice(to, to + text.slice(to).search(/\S/)));
  const inner = `\n${base}${opens ? UNIT : ""}`;
  if (between) {
    const closeAt = to + text.slice(to).search(/\S/);
    const insert = `${inner}\n${base}`;
    const next = text.slice(0, from) + insert + text.slice(closeAt);
    return { text: next, from: from + inner.length, to: from + inner.length };
  }
  const next = text.slice(0, from) + inner + text.slice(to);
  return { text: next, from: from + inner.length, to: from + inner.length };
};

/** Tab with no selection inserts one level; with a selection it indents every line it touches. Shift+Tab removes one level. */
export const tab = (text: string, from: number, to: number, outdent: boolean): Edit => {
  if (from === to && !outdent) return { text: text.slice(0, from) + UNIT + text.slice(to), from: from + UNIT.length, to: from + UNIT.length };
  const start = lineStartOf(text, from);
  const end = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const block = text.slice(start, end);
  const lines = block.split("\n");
  let firstDelta = 0;
  let total = 0;
  const changed = lines.map((line, i) => {
    if (!outdent) {
      if (i === 0) firstDelta = UNIT.length;
      total += UNIT.length;
      return UNIT + line;
    }
    const remove = /^ {1,2}/.exec(line)?.[0].length ?? (line.startsWith("\t") ? 1 : 0);
    if (i === 0) firstDelta = -remove;
    total -= remove;
    return line.slice(remove);
  });
  const next = text.slice(0, start) + changed.join("\n") + text.slice(end);
  return { text: next, from: Math.max(start, from + firstDelta), to: Math.max(start, to + total) };
};

/** Typing `}` as the first thing on an indented line steps it back one level so it lines up with its block. */
export const typeCloseBrace = (text: string, offset: number): Edit | null => {
  const start = lineStartOf(text, offset);
  const before = text.slice(start, offset);
  if (!/^ {2,}$/.test(before) || before.length < UNIT.length) return null;
  const trimmed = before.slice(UNIT.length);
  return { text: text.slice(0, start) + trimmed + "}" + text.slice(offset), from: start + trimmed.length + 1, to: start + trimmed.length + 1 };
};
