import { UnparseableModelOutputError } from "@/features/ai/server/errors";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseObject = (text: string): Record<string, unknown> | null => {
  const attempt = (source: string) => {
    try {
      const parsed: unknown = JSON.parse(source);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  // Models occasionally leave a trailing comma; retry once with them removed.
  return attempt(text) ?? attempt(text.replace(/,\s*([}\]])/g, "$1"));
};

/**
 * Every balanced top-level `{...}` span in `text`, left to right (braces inside
 * JSON strings are ignored). Scanning stops at an opening brace that never
 * closes: a truncated answer must not be mistaken for one of the complete
 * objects nested inside it.
 */
const balancedObjectSpans = (text: string): string[] => {
  const spans: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "{") {
      i += 1;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    spans.push(text.slice(i, end + 1));
    i = end + 1;
  }
  return spans;
};

/**
 * Pull a JSON object out of free-form model text: fenced or bare, with chatter
 * or reasoning before and after. When several objects are present (a stray
 * `{x}` in the preamble, say), the largest one that parses wins. Returns null
 * when nothing parses.
 */
export const extractJsonFromText = (text: string): Record<string, unknown> | null => {
  let best: Record<string, unknown> | null = null;
  let bestLength = -1;
  for (const span of balancedObjectSpans(text)) {
    const parsed = parseObject(span);
    if (parsed && span.length > bestLength) {
      best = parsed;
      bestLength = span.length;
    }
  }
  return best;
};

/**
 * The model's reply as a JSON object, or an UnparseableModelOutputError that
 * says why (empty, cut off by the token limit, or simply not JSON).
 */
export const parseModelJson = (
  text: string,
  finishReason?: string,
): Record<string, unknown> => {
  const trimmed = text.trim();
  const truncated = finishReason === "length";

  if (!trimmed) throw new UnparseableModelOutputError(truncated ? "truncated" : "empty");

  const direct = parseObject(trimmed);
  if (direct) return direct;

  // A JSON string literal that itself contains the object.
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      const inner = extractJsonFromText(parsed);
      if (inner) return inner;
    }
  } catch {
    // not a JSON literal; fall through to extraction
  }

  const extracted = extractJsonFromText(trimmed);
  if (extracted && !truncated) return extracted;
  throw new UnparseableModelOutputError(truncated ? "truncated" : "not-json", trimmed);
};
