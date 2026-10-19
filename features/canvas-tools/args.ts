import type { ToolDefinition } from "./types";

const namesOf = (tool: ToolDefinition): string[] => Object.keys((tool.input as unknown as { shape?: Record<string, unknown> }).shape ?? {});

/** Words models use for "the elements" and "the thing this is about" instead of the schema's own name. */
const LIST_WORDS = new Set(["ids", "element_ids", "elementids", "member_ids", "memberids", "members", "elements", "shape_ids", "shapeids", "node_ids", "nodeids", "target_ids", "targetids", "targets"]);

const flat = (name: string) => name.toLowerCase().replace(/[_-]/g, "");

/**
 * Reads the argument names a model guessed (frame_id, member_ids, frameId) as the schema's own (frame, ids), only
 * when the meaning is not in doubt: the schema's name is free, and exactly one guess maps to it. Anything else
 * is left for the schema to reject with the list of real names. Returns what was read as what, to tell the model.
 */
export const normalizeArgs = (tool: ToolDefinition, args: unknown): { args: unknown; read: string[] } => {
  if (!args || typeof args !== "object" || Array.isArray(args)) return { args, read: [] };
  const known = namesOf(tool);
  if (known.length === 0) return { args, read: [] };
  const input = args as Record<string, unknown>;
  const unknown = Object.keys(input).filter((key) => !known.includes(key));
  if (unknown.length === 0) return { args, read: [] };
  const out: Record<string, unknown> = { ...input };
  const read: string[] = [];
  for (const key of unknown) {
    const bare = flat(key).replace(/ids?$/, (m) => (m === "ids" ? "ids" : "id"));
    const direct = known.find((name) => flat(name) === flat(key) || flat(name) === bare || flat(name) === bare.replace(/id$/, ""));
    const target = direct ?? (LIST_WORDS.has(flat(key)) || LIST_WORDS.has(key) ? known.find((name) => name === "ids") : undefined);
    if (!target || target in input || target in out && !(unknown.includes(target))) continue;
    if (read.some((entry) => entry.endsWith(` as ${target}`))) continue;
    out[target] = input[key];
    delete out[key];
    read.push(`${key} as ${target}`);
  }
  return { args: out, read };
};
