/**
 * Quoted strings: `\"` is a quote, `\\` a backslash and `\n` a line break; any other backslash is
 * kept as written (so `"C:\temp"` still reads naturally). Line breaks are how a label spans lines.
 */
export const unescapeString = (inner: string): string =>
  inner.replace(/\\(["\\n])/g, (_, ch: string) => (ch === "n" ? "\n" : ch));

export const escapeString = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");

/** The text between the quotes when `text` is one quoted string, else null. */
export const quotedInner = (text: string): string | null => {
  const t = text.trim();
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return null;
  // The closing quote must not itself be escaped by an odd run of backslashes.
  let backslashes = 0;
  for (let i = t.length - 2; i >= 1 && t[i] === "\\"; i -= 1) backslashes += 1;
  return backslashes % 2 === 0 ? t.slice(1, -1) : null;
};
