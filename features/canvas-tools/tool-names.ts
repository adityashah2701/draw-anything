import type { ToolDefinition, ToolGroup } from "./types";

/** Verbs a model uses for what the tools call update, and the plain plural/singular of every word. */
const SYNONYMS: Record<string, string> = { edit: "update", modify: "update", alter: "update", set: "update", remove: "delete", erase: "delete", make: "create", add: "create", new: "create" };
const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => w.replace(/s$/, "")).map((w) => SYNONYMS[w] ?? w);

/** Names a model might have meant: the same verb counts most (edit_elements -> update_element), shared nouns a little. */
export const closestTools = (wanted: string, tools: readonly Pick<ToolDefinition, "name">[], limit = 4): string[] => {
  const asked = words(wanted);
  return tools
    .map((tool) => {
      const have = words(tool.name);
      const score = (have[0] === asked[0] ? 3 : 0) + have.slice(1).filter((w) => asked.slice(1).includes(w)).length;
      return { name: tool.name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
};

const byGroup = (tools: readonly Pick<ToolDefinition, "name" | "group">[], group: ToolGroup) => tools.filter((tool) => tool.group === group).map((tool) => tool.name);

/** A failure for a tool that does not exist: says what does, so the next call can be right instead of another guess. */
export const unknownToolMessage = (wanted: string, tools: readonly Pick<ToolDefinition, "name" | "group">[], enabled: ReadonlySet<ToolGroup>): string => {
  const close = closestTools(wanted, tools);
  const groups = [...new Set(tools.map((tool) => tool.group))];
  const on = groups.filter((g) => enabled.has(g));
  const off = groups.filter((g) => !enabled.has(g));
  return [
    `There is no tool called "${wanted}".`,
    close.length > 0 ? `Closest real tools: ${close.map((name) => `${name}${enabled.has(tools.find((t) => t.name === name)!.group) ? "" : " (its group is off: enable_tools first)"}`).join(", ")}.` : "",
    `Tools available now: ${on.flatMap((g) => byGroup(tools, g)).join(", ")}.`,
    off.length > 0 ? `Off until enable_tools {"groups":[...]}: ${off.map((g) => `${g}: ${byGroup(tools, g).join(", ")}`).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
};

/** The tool exists but its group is off: says the group is now on, and what the tool takes, since its schema was not offered yet. */
export const notEnabledMessage = (tool: Pick<ToolDefinition, "name" | "group">, argumentNames: readonly string[], siblings: readonly string[]): string =>
  `"${tool.name}" is in the "${tool.group}" tools, which were off. They are on now, so call ${tool.name} again${argumentNames.length > 0 ? ` with only these arguments: ${argumentNames.join(", ")}` : ""}. The ${tool.group} tools: ${siblings.join(", ")}.`;
