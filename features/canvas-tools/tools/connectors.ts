import { z } from "zod";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { isArrowElement, type ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import {
  connectorsBetween,
  connectorsOf,
  labelOf,
  planConnectorLabel,
  planCreateConnector,
  planDetach,
  planReroute,
  planUpdateConnector,
  type ArrowChange,
} from "@/features/whiteboard/commands/connectors";
import { planRemove } from "@/features/whiteboard/commands/remove";
import type { AnchorSide } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import { color, elementId, expectedRevision, MAX_ELEMENTS_PER_CALL, newElementId } from "../schemas";
import type { ToolDefinition, ToolEnv } from "../types";
import { claimId, count, failureError, listIds, lockedSkips, mergePatches, resolveTargets } from "./helpers";

const side = z.enum(["top", "right", "bottom", "left"]).describe("Which side of the element the connector attaches to. Default: the sides that face each other.");
const strokeWidth = z.number().finite().min(0.5).max(24);
const labelText = z.string().max(200).describe("Text on the connector (e.g. a request name or condition). Use \\n for line breaks.");

const lookFields = {
  type: z.enum(["arrow", "arrow-bidirectional"]).optional().describe("arrow: head at the end; arrow-bidirectional: heads at both ends."),
  routing: z.enum(["orthogonal", "straight"]).optional().describe("orthogonal: right-angle path routed around other elements (default); straight: a direct line."),
  dashed: z.boolean().optional(),
  head_start: z.boolean().optional().describe("Arrow head at the start."),
  head_end: z.boolean().optional().describe("Arrow head at the end."),
  color: color.optional(),
  stroke_width: strokeWidth.optional(),
};

interface Look {
  type?: "arrow" | "arrow-bidirectional";
  routing?: "orthogonal" | "straight";
  dashed?: boolean;
  head_start?: boolean;
  head_end?: boolean;
  color?: string;
  stroke_width?: number;
}

const toChange = (look: Look): ArrowChange => ({
  ...(look.type ? { type: look.type } : {}),
  ...(look.routing ? { routingMode: look.routing } : {}),
  ...(look.dashed !== undefined ? { dashed: look.dashed } : {}),
  ...(look.head_start !== undefined ? { arrowHeadStart: look.head_start } : {}),
  ...(look.head_end !== undefined ? { arrowHeadEnd: look.head_end } : {}),
  ...(look.color ? { color: look.color } : {}),
  ...(look.stroke_width !== undefined ? { strokeWidth: look.stroke_width } : {}),
});

const endsDescribe = (ctx: ToolEnv["ctx"], arrow: ArrowElement) => {
  const side_ = (anchor?: string) => anchor?.split("-").pop();
  return { from: arrow.startConnection?.elementId, to: arrow.endConnection?.elementId, fromSide: side_(arrow.startConnection?.anchorId), toSide: side_(arrow.endConnection?.anchorId), label: labelOf(ctx, arrow)?.text };
};

interface ConnectionSpec extends Look {
  id?: string;
  from: string;
  to: string;
  from_side?: AnchorSide;
  to_side?: AnchorSide;
  label?: string;
  allow_duplicate?: boolean;
}

/** One or more connectors planned against the board as it is; ends that exist and can be attached to are required. */
const planConnections = (env: ToolEnv, specs: readonly ConnectionSpec[]) => {
  const { ctx } = env;
  let patch: DocPatch = { add: [], update: [], remove: [] };
  const created: Array<{ id: string; from: string; to: string; fromSide: string; toSide: string; labelId?: string }> = [];
  const existing: Array<{ id: string; from: string; to: string }> = [];
  const taken = new Set<string>();
  const pairs = new Set<string>();
  for (const spec of specs) {
    const [from, to] = [spec.from, spec.to].map((ref) => resolveTargets(env, [ref], { allowGroups: false }).shapeIds[0]);
    const key = `${from}>${to}`;
    const present = spec.allow_duplicate ? [] : connectorsBetween(ctx, from, to, true);
    if (present.length > 0 || (!spec.allow_duplicate && pairs.has(key))) {
      if (present.length > 0) existing.push({ id: present[0].id, from, to });
      continue;
    }
    pairs.add(key);
    const id = spec.id ?? (() => {
      let next = claimId(env, undefined);
      while (taken.has(next)) next = claimId(env, undefined);
      return next;
    })();
    if (spec.id !== undefined) claimId(env, spec.id);
    if (taken.has(id) || taken.has(`${id}-label`)) throw new ToolError("conflict", `The id "${id}" is used twice in this call.`, { ids: [id] });
    taken.add(id);
    const plan = planCreateConnector(ctx, {
      id,
      from: { id: from, side: spec.from_side },
      to: { id: to, side: spec.to_side },
      change: toChange(spec),
      label: spec.label ? spec.label.replace(/\r\n?/g, "\n") : undefined,
    });
    if ("reason" in plan) throw failureError(plan);
    if (plan.labelId && ctx.index.shapes.has(plan.labelId)) throw new ToolError("conflict", `"${plan.labelId}" already exists.`);
    patch = mergePatches(patch, plan.patch);
    created.push({ id, from, to, fromSide: plan.from.side, toSide: plan.to.side, ...(plan.labelId ? { labelId: plan.labelId } : {}) });
  }
  return { patch, created, existing };
};

// ── create_connector / connect_elements ────────────────────────────────────────

const createInput = z
  .object({
    id: newElementId.optional(),
    from: elementId.describe("The element the connector starts at."),
    to: elementId.describe("The element it ends at."),
    from_side: side.optional(),
    to_side: side.optional(),
    ...lookFields,
    label: labelText.optional(),
    allow_duplicate: z.boolean().optional().describe("Create another connector even if one already joins these two in this direction."),
    expected_revision: expectedRevision,
  })
  .strict();

const describeCreated = (created: ReturnType<typeof planConnections>["created"], existing: ReturnType<typeof planConnections>["existing"]) =>
  [
    created.length > 0 ? `Connected ${created.map((c) => `${c.from} → ${c.to} (${c.id})`).join(", ")}` : "",
    existing.length > 0 ? `${existing.map((c) => `${c.from} → ${c.to}`).join(", ")} ${existing.length === 1 ? "was" : "were"} already connected` : "",
  ]
    .filter(Boolean)
    .join("; ") + ".";

export const createConnector: ToolDefinition<typeof createInput> = {
  name: "create_connector",
  group: "connect",
  description: "Draw one connector between two existing elements, attached at their connection points and routed around other elements like a connector drawn by hand. Optional label, direction heads, dashed, colour. If the two are already connected in that direction, nothing is added.",
  input: createInput,
  access: "write",
  run: (input, env) => {
    const { patch, created, existing } = planConnections(env, [input]);
    return {
      summary: describeCreated(created, existing),
      data: { created: created.map((c) => c.id), connectors: created, alreadyConnected: existing },
      patch,
      ...(existing.length > 0 && created.length === 0 ? { warnings: ["No connector was added: these elements are already connected that way."] } : {}),
    };
  },
};

const connectInput = z
  .object({
    connections: z
      .array(
        z
          .object({
            id: newElementId.optional(),
            from: elementId,
            to: elementId,
            from_side: side.optional(),
            to_side: side.optional(),
            label: labelText.optional(),
            dashed: z.boolean().optional(),
            type: lookFields.type,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ELEMENTS_PER_CALL),
    routing: lookFields.routing,
    expected_revision: expectedRevision,
  })
  .strict();

export const connectElements: ToolDefinition<typeof connectInput> = {
  name: "connect_elements",
  group: "connect",
  description: "Connect several pairs of existing elements at once (all or nothing): each entry is {from, to, label?}. Pairs that are already connected in that direction are left as they are. Use create_connector for one connection with full styling.",
  input: connectInput,
  access: "write",
  run: ({ connections, routing }, env) => {
    const { patch, created, existing } = planConnections(env, connections.map((c) => ({ ...c, routing })));
    return { summary: describeCreated(created, existing), data: { created: created.map((c) => c.id), connectors: created, alreadyConnected: existing }, patch };
  },
};

// ── update_connector ─────────────────────────────────────────────────────────

const endRef = z.object({ id: elementId, side: side.optional() }).strict();

const updateInput = z
  .object({
    ids: z.array(elementId).min(1).max(MAX_ELEMENTS_PER_CALL).describe("Connector ids."),
    ...lookFields,
    from: endRef.optional().describe("Re-attach the start to this element (and side)."),
    to: endRef.optional().describe("Re-attach the end to this element (and side)."),
    expected_revision: expectedRevision,
  })
  .strict();

export const updateConnector: ToolDefinition<typeof updateInput> = {
  name: "update_connector",
  group: "connect",
  description: "Change connectors: arrow type and heads, routing (straight/orthogonal), dashed, colour, width, or re-attach an end to another element/side. The route is recomputed when it can change. Locked connectors are refused.",
  input: updateInput,
  access: "write",
  run: (input, env) => {
    const change = toChange(input);
    if (Object.keys(change).length === 0 && !input.from && !input.to) throw new ToolError("invalid_arguments", "Give a property to change, or `from` / `to` to re-attach an end.");
    if ((input.from || input.to) && input.ids.length > 1) throw new ToolError("invalid_arguments", "Re-attaching ends works on one connector at a time.");
    const { ctx } = env;
    let patch: DocPatch = { add: [], update: [], remove: [] };
    const changed: string[] = [];
    for (const id of input.ids) {
      const result = planUpdateConnector(ctx, id, { change, from: input.from, to: input.to });
      if ("reason" in result) throw failureError(result);
      patch = mergePatches(patch, result.patch);
      changed.push(result.connectorId);
    }
    return {
      summary: `Updated ${count(changed.length, "connector")}: ${listIds(changed)}.`,
      data: { changed, connectors: changed.map((id) => ({ id, ...endsDescribe(ctx, ctx.index.shapes.get(id) as ArrowElement) })) },
      patch,
    };
  },
};

// ── labels ───────────────────────────────────────────────────────────────────

const labelInput = z
  .object({
    id: elementId.describe("The connector."),
    text: z.string().max(200).describe("The new label. Empty removes it."),
    expected_revision: expectedRevision,
  })
  .strict();

export const updateConnectorLabel: ToolDefinition<typeof labelInput> = {
  name: "update_connector_label",
  group: "connect",
  description: "Set, change or remove (empty text) the label of a connector. The label sits clear of the shapes and follows the connector when it is moved or re-routed.",
  input: labelInput,
  access: "write",
  run: ({ id, text }, env) => {
    const { ctx } = env;
    const arrow = ctx.index.shapes.get(id);
    if (!arrow) throw new ToolError("not_found", `No element with id "${id}".`, { ids: [id] });
    if (!isArrowElement(arrow)) throw new ToolError("invalid_state", `"${id}" is a ${arrow.type}, not a connector.`, { ids: [id] });
    if (isEffectivelyLocked(ctx.index, id)) throw new ToolError("locked", `"${id}" is locked.`, { ids: [id] });
    const clean = text.replace(/\r\n?/g, "\n").trim();
    const current = labelOf(ctx, arrow);
    if ((current?.text ?? "") === clean) return { summary: clean ? "The label is already that; nothing changed." : "The connector has no label; nothing changed.", data: { labelId: current?.id ?? null } };
    const plan = planConnectorLabel(ctx, id, clean || null);
    if (!plan) throw new ToolError("invalid_state", `"${id}" cannot have a label.`);
    return { summary: clean ? `Set the label of ${id} to "${clean}".` : `Removed the label of ${id}.`, data: { labelId: plan.labelId }, patch: plan.patch };
  },
};

// ── reroute / disconnect / delete ───────────────────────────────────────────────

const rerouteInput = z
  .object({
    ids: z.array(elementId).min(1).max(500).optional().describe("Connectors to re-route. Omit to re-route every unlocked connector."),
    forget_manual_bends: z.boolean().optional().describe("Also discard bends a person dragged into a connector (default false: manual routes are kept)."),
    expected_revision: expectedRevision,
  })
  .strict();

export const rerouteConnector: ToolDefinition<typeof rerouteInput> = {
  name: "reroute_connector",
  group: "connect",
  description: "Recompute connector paths from their attachments with the editor's router (after shapes moved or labels changed). Manually bent connectors keep their bends unless forget_manual_bends is true. Straight connectors are unchanged.",
  input: rerouteInput,
  access: "write",
  run: ({ ids, forget_manual_bends }, env) => {
    const { ctx } = env;
    const all = connectorsOf(ctx).filter((arrow) => !isEffectivelyLocked(ctx.index, arrow.id));
    let targets = all.map((arrow) => arrow.id);
    const skipped: Array<{ id: string; reason: string }> = [];
    if (ids) {
      for (const id of ids) {
        const shape = ctx.index.shapes.get(id);
        if (!shape) throw new ToolError("not_found", `No element with id "${id}".`, { ids: [id] });
        if (!isArrowElement(shape)) throw new ToolError("invalid_state", `"${id}" is a ${shape.type}, not a connector.`, { ids: [id] });
      }
      targets = ids.filter((id) => !isEffectivelyLocked(ctx.index, id));
      skipped.push(...lockedSkips(ids.filter((id) => isEffectivelyLocked(ctx.index, id))));
    }
    const { patch, changed } = planReroute(ctx, targets, { forgetManual: forget_manual_bends === true });
    return {
      summary: changed.length === 0 ? `${count(targets.length, "connector")} checked; every path was already right.` : `Re-routed ${count(changed.length, "connector")}: ${listIds(changed)}.`,
      data: { changed, checked: targets.length },
      patch,
      skipped,
    };
  },
};

const disconnectInput = z
  .object({
    a: elementId.describe("One element."),
    b: elementId.describe("The other element."),
    directed: z.boolean().optional().describe("Only connectors that run from a to b (default: either direction)."),
    result: z.enum(["remove", "detach"]).optional().describe("remove (default): delete the connectors between them. detach: keep them as free arrows with loose ends."),
    expected_revision: expectedRevision,
  })
  .strict();

export const disconnectElements: ToolDefinition<typeof disconnectInput> = {
  name: "disconnect_elements",
  group: "connect",
  description: "Disconnect two elements: remove the connectors that join them (or leave them as free arrows with detach). Neither element is ever deleted or moved.",
  input: disconnectInput,
  access: "write",
  run: ({ a, b, directed, result }, env) => {
    const { ctx } = env;
    for (const id of [a, b]) if (!ctx.index.shapes.has(id)) throw new ToolError("not_found", `No element with id "${id}".`, { ids: [id] });
    const arrows = connectorsBetween(ctx, a, b, directed === true);
    if (arrows.length === 0) return { summary: `${a} and ${b} are not connected; nothing changed.`, data: { disconnected: [] } };
    const open = arrows.filter((arrow) => !isEffectivelyLocked(ctx.index, arrow.id));
    const skipped = lockedSkips(arrows.filter((arrow) => isEffectivelyLocked(ctx.index, arrow.id)).map((arrow) => arrow.id));
    if (open.length === 0) throw new ToolError("locked", "The connectors between them are locked.", { ids: arrows.map((arrow) => arrow.id) });
    const ids = open.map((arrow) => arrow.id);
    if (result === "detach") {
      return { summary: `Detached ${count(ids.length, "connector")} from ${a} and ${b}: ${listIds(ids)}.`, data: { disconnected: ids, mode: "detach" }, patch: planDetach(ctx, ids), skipped };
    }
    const patch = planRemove(ctx, ids.filter((id) => ctx.index.shapes.has(id)));
    // Removing a connector alone never removes its endpoints; planRemove only cascades from shapes to connectors.
    return { summary: `Removed ${count(ids.length, "connector")} between ${a} and ${b}: ${listIds(ids)}. Both elements are unchanged.`, data: { disconnected: ids, mode: "remove" }, patch, skipped };
  },
};

const deleteInput = z.object({ ids: z.array(elementId).min(1).max(500).describe("Connector ids."), expected_revision: expectedRevision }).strict();

export const deleteConnector: ToolDefinition<typeof deleteInput> = {
  name: "delete_connector",
  group: "connect",
  description: "Delete connectors by id, with their labels. The elements they joined are never touched. Locked connectors are refused.",
  input: deleteInput,
  access: "write",
  run: ({ ids }, env) => {
    const { ctx } = env;
    for (const id of ids) {
      const shape = ctx.index.shapes.get(id);
      if (!shape) throw new ToolError("not_found", `No element with id "${id}".`, { ids: [id] });
      if (!isArrowElement(shape)) throw new ToolError("invalid_state", `"${id}" is a ${shape.type}, not a connector; use delete_elements for that.`, { ids: [id] });
    }
    const locked = ids.filter((id) => isEffectivelyLocked(ctx.index, id));
    if (locked.length > 0) throw new ToolError("locked", `${locked.join(", ")} ${locked.length === 1 ? "is" : "are"} locked.`, { ids: locked });
    const patch = planRemove(ctx, ids);
    return { summary: `Deleted ${count(ids.length, "connector")}: ${listIds(ids)}. The connected elements are unchanged.`, data: { removed: patch?.remove ?? [] }, patch };
  },
};

export const CONNECTOR_TOOLS = [createConnector, connectElements, updateConnector, updateConnectorLabel, rerouteConnector, disconnectElements, deleteConnector] as const;

