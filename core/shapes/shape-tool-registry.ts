import { shapeRegistry } from "./shape-registry";
import { OUTLINE_VARIANTS, outlineToolName } from "@/core/shapes/outline/variants";
import { outlineIconComponent } from "@/core/shapes/outline/icon";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";

export interface ToolDefinition {
  name: Tool;
  icon: unknown;
  label: string;
  shortcut?: string;
  group: "shapes" | "outline" | "connectors" | "drawing" | "tools";
  order: number;
  allowInReadOnly: boolean;
}

/** Returns all tools derived from the shape registry, plus built-in tools */
export function getToolDefinitions(): ToolDefinition[] {
  const shapeDefs = shapeRegistry
    .list()
    .filter((def) => def.toolbarConfig)
    .map((def) => ({
      name: def.type as Tool,
      icon: def.toolbarConfig!.icon,
      label: def.toolbarConfig!.label,
      shortcut: def.toolbarConfig!.shortcut,
      group: def.toolbarConfig!.group,
      order: def.toolbarConfig!.order ?? 99,
      allowInReadOnly: false,
    }));

  // One draw tool per outline variant, from the variant registry.
  const outlineTools: ToolDefinition[] = shapeRegistry.get("outline")
    ? OUTLINE_VARIANTS.map((variant, index) => ({
        name: outlineToolName(variant.id),
        icon: outlineIconComponent(variant.id),
        label: variant.label,
        group: "outline" as const,
        order: 20 + index,
        allowInReadOnly: false,
      }))
    : [];

  // Add non-shape tools:
  const extraTools: ToolDefinition[] = [
    {
      name: "select",
      icon: null, // Sidebar will use its own MousePointer icon
      label: "Select",
      shortcut: "V",
      group: "tools",
      order: 0,
      allowInReadOnly: true,
    },
    {
      name: "eraser",
      icon: null, // Sidebar will use its own Eraser icon
      label: "Eraser",
      shortcut: "E",
      group: "tools",
      order: 1,
      allowInReadOnly: false,
    },
    {
      name: "comment",
      icon: null, // Sidebar will use its own MessageSquare icon
      label: "Comment",
      shortcut: "M",
      group: "tools",
      order: 3,
      allowInReadOnly: false,
    },
    {
      name: "hand",
      icon: null, // Sidebar will use its own Hand icon
      label: "Pan",
      shortcut: "H",
      group: "tools",
      order: 2,
      allowInReadOnly: true,
    },
  ];

  return [...shapeDefs, ...outlineTools, ...extraTools].sort((a, b) => a.order - b.order);
}
