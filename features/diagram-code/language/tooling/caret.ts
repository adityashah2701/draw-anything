/**
 * Where the caret goes after text is rewritten without changing its words (formatting): the offset in
 * `after` that has the same number of non-whitespace characters before it as `offset` had in `before`.
 */
export const mapCaret = (before: string, offset: number, after: string): number => {
  let wanted = 0;
  for (let i = 0; i < Math.min(offset, before.length); i += 1) if (!/\s/.test(before[i])) wanted += 1;
  if (wanted === 0) return 0;
  let seen = 0;
  for (let i = 0; i < after.length; i += 1) {
    if (!/\s/.test(after[i])) seen += 1;
    if (seen === wanted) {
      let at = i + 1;
      // A caret that sat after whitespace stays after the whitespace that replaced it.
      const prev = before[offset - 1];
      if (prev !== undefined && /\s/.test(prev)) {
        const newline = prev === "\n";
        while (at < after.length && (after[at] === " " || after[at] === "\t" || (newline && after[at] === "\n"))) at += 1;
      }
      return at;
    }
  }
  return after.length;
};
