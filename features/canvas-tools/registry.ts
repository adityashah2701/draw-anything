import type { z } from "zod";
import { toParameters } from "./schemas";
import { ARRANGE_TOOLS } from "./tools/arrange";
import { CONNECTOR_TOOLS } from "./tools/connectors";
import { CREATE_TOOLS } from "./tools/create";
import { DOCUMENT_TOOLS } from "./tools/document";
import { EDIT_TOOLS } from "./tools/edit";
import { GENERATE_TOOLS, MEMORY_TOOLS } from "./tools/generate";
import { enableTools, INSPECT_TOOLS } from "./tools/inspect";
import { ORGANIZE_TOOLS } from "./tools/organize";
import { TOOL_GROUPS, type ToolDefinition, type ToolGroup } from "./types";

/** Every tool except the meta tool that needs the live session; each is a separate, independently callable definition. */
export const STATIC_TOOLS: readonly ToolDefinition[] = [
  ...INSPECT_TOOLS,
  ...CREATE_TOOLS,
  ...EDIT_TOOLS,
  ...CONNECTOR_TOOLS,
  ...ARRANGE_TOOLS,
  ...ORGANIZE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...GENERATE_TOOLS,
  ...MEMORY_TOOLS,
] as unknown as readonly ToolDefinition[];

/** The full allowlist for one run, wired to `enable` (how the model turns groups on). */
export const buildTools = (enable: (groups: ToolGroup[]) => void): ToolDefinition[] => [...STATIC_TOOLS, enableTools(enable)] as unknown as ToolDefinition[];

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * `anyOf: [X, {type: "null"}]` as `type: [X.type, "null"]`: the same schema in the shape every provider's
 * function-calling accepts (several reject `anyOf`).
 */
const flattenNullable = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(flattenNullable);
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const anyOf = record.anyOf;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const nullIndex = anyOf.findIndex((entry) => (entry as { type?: unknown })?.type === "null");
    const other = anyOf[1 - nullIndex] as Record<string, unknown> | undefined;
    if (nullIndex >= 0 && other && typeof other.type === "string") {
      const { anyOf: _drop, ...rest } = record;
      void _drop;
      return flattenNullable({ ...rest, ...other, type: [other.type, "null"] });
    }
  }
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, flattenNullable(value)]));
};

/**
 * Constraints a provider's function-calling does not need to see: the server and the executor enforce them
 * on every call anyway (string patterns, lengths, list sizes), and they are a large share of the tokens when
 * dozens of tools are offered. Types, enums, required lists, numeric ranges and descriptions stay.
 */
const DROPPED = new Set(["pattern", "maxLength", "minLength", "maxItems", "minItems", "format"]);
const compact = (node: unknown, inProperties = false): unknown => {
  if (Array.isArray(node)) return node.map((item) => compact(item));
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([key]) => inProperties || !DROPPED.has(key))
      .map(([key, value]) => [key, key === "properties" ? compact(value, true) : compact(value)]),
  );
};

/** What a provider is given for a tool: name, description and JSON Schema parameters. */
export const toolSpec = (tool: ToolDefinition): ToolSpec => ({
  name: tool.name,
  description: tool.description,
  parameters: compact(flattenNullable(toParameters(tool.input as z.ZodType))) as Record<string, unknown>,
});

/** The specs for the tools in the enabled groups (the server sends exactly these; the executor enforces the same set). */
export const specsFor = (tools: readonly ToolDefinition[], groups: ReadonlySet<ToolGroup> | readonly ToolGroup[]): ToolSpec[] => {
  const on = new Set(groups);
  return tools.filter((tool) => on.has(tool.group)).map(toolSpec);
};

export const toolsByGroup = (tools: readonly ToolDefinition[]): Record<ToolGroup, string[]> =>
  Object.fromEntries(TOOL_GROUPS.map((group) => [group, tools.filter((tool) => tool.group === group).map((tool) => tool.name)])) as Record<ToolGroup, string[]>;
