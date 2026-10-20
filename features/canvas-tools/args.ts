import { toParameters } from "./schemas";
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

// ── Values a model writes in the wrong JSON type ─────────────────────────────

interface JsonSchemaNode {
  type?: string | string[];
  anyOf?: JsonSchemaNode[];
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
}

const schemas = new WeakMap<ToolDefinition, JsonSchemaNode>();
const schemaOf = (tool: ToolDefinition): JsonSchemaNode => {
  let schema = schemas.get(tool);
  if (!schema) {
    try {
      schema = toParameters(tool.input) as JsonSchemaNode;
    } catch {
      schema = {};
    }
    schemas.set(tool, schema);
  }
  return schema;
};

const typesOf = (node: JsonSchemaNode | undefined): string[] => {
  if (!node) return [];
  const own = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];
  return [...own, ...(node.anyOf ?? []).flatMap(typesOf)];
};
const memberOf = (node: JsonSchemaNode, type: string): JsonSchemaNode => (node.type === type ? node : (node.anyOf ?? []).find((entry) => entry.type === type) ?? node);

const jsonTypeOf = (value: unknown): string => (value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value);
const NUMBER = /^-?\d+(?:\.\d+)?$/;

const coerceValue = (value: unknown, node: JsonSchemaNode | undefined, path: string, notes: string[]): unknown => {
  const types = typesOf(node);
  if (!node || types.length === 0) return value;
  const actual = jsonTypeOf(value);
  const fits = (type: string) => type === actual || (type === "number" && actual === "integer");
  if (types.some(fits)) {
    if (actual === "array") return (value as unknown[]).map((item, i) => coerceValue(item, memberOf(node, "array").items, `${path}.${i}`, notes));
    if (actual === "object") return coerceObject(value as Record<string, unknown>, memberOf(node, "object"), path, notes);
    return value;
  }
  // A text that is really the JSON the schema wants ("[\"a\",\"b\"]", "{\"x\":1}").
  if (typeof value === "string" && ((types.includes("array") && value.trim().startsWith("[")) || (types.includes("object") && value.trim().startsWith("{")))) {
    try {
      const parsed = JSON.parse(value) as unknown;
      notes.push(`${path} (text read as ${Array.isArray(parsed) ? "a list" : "an object"})`);
      return coerceValue(parsed, node, path, notes);
    } catch {
      return value;
    }
  }
  if (typeof value === "string" && types.some((t) => t === "number" || t === "integer") && NUMBER.test(value.trim())) {
    notes.push(`${path} (text read as a number)`);
    return Number(value);
  }
  if (typeof value === "string" && types.includes("boolean") && /^(true|false)$/i.test(value.trim())) {
    notes.push(`${path} (text read as true/false)`);
    return value.trim().toLowerCase() === "true";
  }
  // One value where a list is wanted: ["a"] for "a".
  if (types.includes("array") && actual !== "array" && actual !== "null") {
    notes.push(`${path} (single value read as a list)`);
    return [coerceValue(value, memberOf(node, "array").items, `${path}.0`, notes)];
  }
  return value;
};

const coerceObject = (input: Record<string, unknown>, node: JsonSchemaNode, path: string, notes: string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const prop = node.properties?.[key];
    const where = path ? `${path}.${key}` : key;
    // An optional argument sent as null means "not given" (models fill every field of a schema); only a property that allows null keeps it.
    if (value === null && prop && !typesOf(prop).includes("null")) {
      notes.push(`${where} (null left out)`);
      continue;
    }
    out[key] = coerceValue(value, prop, where, notes);
  }
  return out;
};

/**
 * Fixes the JSON type of what a model wrote when the meaning is not in doubt: a number or true/false sent as text,
 * one id where a list is wanted, a list sent as JSON text, an optional argument sent as null. Anything else is left for
 * the schema to reject with the real argument names. Returns what was adjusted, to tell the model.
 */
export const coerceArgs = (tool: ToolDefinition, args: unknown): { args: unknown; adjusted: string[] } => {
  if (!args || typeof args !== "object" || Array.isArray(args)) return { args, adjusted: [] };
  const notes: string[] = [];
  const coerced = coerceObject(args as Record<string, unknown>, schemaOf(tool), "", notes);
  return { args: notes.length > 0 ? coerced : args, adjusted: notes };
};
