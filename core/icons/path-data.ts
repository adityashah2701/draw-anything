/**
 * A strict reader for SVG path data, used to check the vendored glyphs. Browsers silently stop drawing
 * at the first thing they cannot read (and log an error), so a malformed glyph shows up as a half-drawn
 * or missing icon; this reports it instead.
 */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATOR = /[\s,]*/y;

/** True when `data` is well-formed path data: known commands, the right number of arguments, arc flags that are 0 or 1. */
export const isValidPathData = (data: string): boolean => {
  let at = 0;
  const skip = () => {
    SEPARATOR.lastIndex = at;
    SEPARATOR.exec(data);
    at = SEPARATOR.lastIndex;
  };
  const number = (): boolean => {
    skip();
    NUMBER.lastIndex = at;
    const match = NUMBER.exec(data);
    if (!match) return false;
    at = NUMBER.lastIndex;
    return true;
  };
  const flag = (): boolean => {
    skip();
    if (data[at] !== "0" && data[at] !== "1") return false;
    at += 1;
    return true;
  };

  skip();
  if (!/^[Mm]/.test(data.slice(at))) return false;
  while (at < data.length) {
    skip();
    if (at >= data.length) break;
    const command = data[at];
    const arity = ARITY[command.toUpperCase()];
    if (arity === undefined) return false;
    at += 1;
    if (arity === 0) continue;
    let groups = 0;
    for (;;) {
      const start = at;
      for (let i = 0; i < arity; i += 1) {
        const isFlag = command.toUpperCase() === "A" && (i === 3 || i === 4);
        if (!(isFlag ? flag() : number())) {
          // No complete group: fine only if this was a repeat that never began.
          if (groups > 0 && i === 0 && at === start) {
            skip();
            return at >= data.length || ARITY[data[at]?.toUpperCase() ?? ""] !== undefined;
          }
          return false;
        }
      }
      groups += 1;
      skip();
      if (at >= data.length || /[A-Za-z]/.test(data[at])) break;
    }
  }
  return true;
};
