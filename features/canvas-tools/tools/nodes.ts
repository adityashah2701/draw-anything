import { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { coordinate, length, newElementId, MAX_ELEMENTS_PER_CALL } from "../schemas";
import { NODE_KINDS } from "../plan";
import type { ToolDefinition } from "../types";
import { createIconTool, createSemanticNodeTool, createShapeTool } from "./create";
import { resolveIconId, searchIcons } from "@/core/icons/registry";
import { count, mergePatches, overlapWarnings } from "./helpers";

const nodesInput = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: newElementId,
            label: z.string().min(1).max(200),
            kind: z.enum(NODE_KINDS).optional().describe("process (default), decision (diamond), terminal (start/end pill), icon (glyph + caption), note."),
            icon: z.string().min(1).max(60).optional().describe("Icon id or name (process, note, icon)."),
            x: coordinate,
            y: coordinate,
            width: length.optional().describe("Default: the size the kind needs for its label (plan_layout gives it)."),
            height: length.optional(),
          })
          // Not strict: a model adds fields of its own (description, type) to each node, and none of them changes what is drawn.
          .passthrough(),
      )
      .min(1)
      .max(MAX_ELEMENTS_PER_CALL),
  })
  .strict();

/** An icon a model named, or the nearest real one: a batch of nodes is not refused for one unknown icon name. */
const usableIcon = (reference: string | undefined, label: string, warnings: string[]): string | undefined => {
  const wanted = reference?.trim();
  if (wanted && resolveIconId(wanted)) return wanted;
  const near = searchIcons(wanted || label, 1)[0];
  if (wanted) warnings.push(near ? `There is no icon "${wanted}"; "${label}" uses "${near.id}".` : `There is no icon "${wanted}"; "${label}" has none (search_icons finds ids).`);
  return near && wanted ? near.id : undefined;
};

/**
 * One call for a whole planned diagram's nodes: the same elements create_shape, create_icon and
 * create_semantic_node make, at exactly the given positions (no snapping), added in one undo step.
 */
export const createNodesTool: ToolDefinition<typeof nodesInput> = {
  name: "create_nodes",
  group: "create",
  description:
    "Create many nodes at once at exact positions, in one undo step: process boxes (optionally with an icon), decision diamonds, terminal pills, icons with captions, notes. Give each an id so connect_elements can join them. Use plan_layout's x, y, width, height. All or nothing.",
  input: nodesInput,
  access: "write",
  run: async ({ nodes }, env) => {
    const patches: DocPatch[] = [];
    const warnings: string[] = [];
    // Each node is made by the single-node tool against the board as it is, then the ids are known to later nodes.
    for (const node of nodes) {
      const kind = node.kind ?? "process";
      const at = { id: node.id, x: node.x, y: node.y, ...(node.width !== undefined ? { width: node.width } : {}), ...(node.height !== undefined ? { height: node.height } : {}) };
      let result;
      if (kind === "decision") result = await createShapeTool.run(createShapeTool.input.parse({ ...at, shape: "diamond", label: node.label, snap: false }), env);
      else if (kind === "terminal") result = await createShapeTool.run(createShapeTool.input.parse({ ...at, shape: "pill", label: node.label, snap: false }), env);
      else if (kind === "icon") {
        const icon = usableIcon(node.icon ?? node.label, node.label, warnings);
        result = icon
          ? await createIconTool.run(createIconTool.input.parse({ id: node.id, icon, caption: node.label, x: node.x, y: node.y }), env)
          : await createSemanticNodeTool.run(createSemanticNodeTool.input.parse({ ...at, label: node.label, snap: false }), env);
      } else {
        const icon = node.icon ? usableIcon(node.icon, node.label, warnings) : undefined;
        result = await createSemanticNodeTool.run(createSemanticNodeTool.input.parse({ ...at, label: node.label, ...(icon ? { icon } : {}), snap: false }), env);
      }
      if (result.patch) patches.push(result.patch);
      warnings.push(...(result.warnings ?? []).filter((w) => !/^The new element overlaps/.test(w)));
    }
    const patch = patches.length > 0 ? patches.reduce((all, next) => mergePatches(all, next)) : null;
    // Overlaps are judged once, among the nodes made together and against what was already there.
    const boxes = ((patch?.add ?? []) as DrawingElement[]).flatMap((el) => (env.ctx.getBounds(el) ? [{ id: el.id, b: env.ctx.getBounds(el)! }] : []));
    const crowded = new Set<string>();
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i].b;
      const c = boxes[j].b;
      if (Math.min(a.maxX, c.maxX) - Math.max(a.minX, c.minX) > 2 && Math.min(a.maxY, c.maxY) - Math.max(a.minY, c.minY) > 2) {
        crowded.add(boxes[i].id);
        crowded.add(boxes[j].id);
      }
    }
    if (crowded.size > 0) warnings.push(`These new nodes overlap each other: ${[...crowded].slice(0, 8).join(", ")}. Move them apart (plan_layout positions do not overlap).`);
    for (const { id, b } of boxes) warnings.push(...overlapWarnings(env, { x: b.minX, y: b.minY, width: b.width, height: b.height }, id).filter((w) => !/crowds the frame/.test(w)).slice(0, 1));
    return {
      summary: `Created ${count(nodes.length, "node")}: ${nodes.map((n) => n.id).join(", ")}.`,
      data: { created: nodes.map((n) => n.id), nodes: boxes.map(({ id, b }) => ({ id, x: Math.round(b.minX), y: Math.round(b.minY), width: Math.round(b.width), height: Math.round(b.height) })) },
      patch,
      ...(warnings.length > 0 ? { warnings: [...new Set(warnings)].slice(0, 8) } : {}),
    };
  },
};
