import type { ToolDefinition } from "@/core/shapes/shape-tool-registry";

export interface ToolbarTool {
  kind: "tool";
  tool: ToolDefinition;
}
export interface ToolbarGroup {
  kind: "group";
  id: string;
  label: string;
  tools: ToolDefinition[];
}
export type ToolbarEntry = ToolbarTool | ToolbarGroup;

export interface ToolbarLayout {
  /** Moving around the board: always at the top, never hidden in a menu. */
  navigate: ToolbarEntry[];
  /** Putting things on the board. */
  create: ToolbarEntry[];
  /** Lower-frequency tools. */
  utility: ToolbarEntry[];
}

/** Not a drawing tool: opens the icon picker. Lives in the Insert group beside Text. */
export const ICON_PICKER_TOOL: ToolDefinition = { name: "icon-picker", icon: null, label: "Icon", shortcut: "I", group: "tools", order: 100, allowInReadOnly: false };

const byOrder = (a: ToolDefinition, b: ToolDefinition) => a.order - b.order;

/**
 * Arranges the registered tools into the editor's toolbar: a few single-click tools and
 * three groups (shapes, connectors, draw) that show their last-used tool and keep the rest
 * one flyout away. Membership follows the registry's `group`, so a newly registered shape or
 * connector lands in its flyout without touching the toolbar. A group with one tool is just a tool.
 */
export function buildToolbar(defs: ToolDefinition[]): ToolbarLayout {
  const named = (name: string) => defs.find((d) => d.name === name);
  const placed = new Set<string>();
  const take = (...tools: (ToolDefinition | undefined)[]) =>
    tools.filter((t): t is ToolDefinition => {
      if (!t) return false;
      placed.add(t.name);
      return true;
    });
  const entry = (id: string, label: string, tools: ToolDefinition[]): ToolbarEntry[] =>
    tools.length === 0 ? [] : tools.length === 1 ? [{ kind: "tool", tool: tools[0] }] : [{ kind: "group", id, label, tools: [...tools].sort(byOrder) }];
  const single = (tool: ToolDefinition | undefined): ToolbarEntry[] => take(tool).map((t) => ({ kind: "tool" as const, tool: t }));

  const navigate = [...single(named("select")), ...single(named("hand"))];
  const shapes = take(...defs.filter((d) => d.group === "shapes" || d.group === "outline"));
  const insert = take(named("text"));
  if (insert.length) insert.push(ICON_PICKER_TOOL);
  const connectors = take(...defs.filter((d) => d.group === "connectors"));
  const draw = take(...defs.filter((d) => d.group === "drawing"), named("eraser"));
  const create = [
    ...entry("shapes", "Shapes", shapes),
    ...entry("connectors", "Connectors", connectors),
    ...entry("insert", "Insert", insert),
    ...entry("draw", "Draw", draw),
  ];
  const utility = [...single(named("comment")), ...defs.filter((d) => !placed.has(d.name)).sort(byOrder).flatMap((d) => single(d))];
  return { navigate, create, utility };
}
