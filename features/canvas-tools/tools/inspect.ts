import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import { groupLabel } from "@/core/groups/group-index";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { iconForNode, listIcons, searchIcons } from "@/core/icons/registry";
import { normalizeNodeStyle } from "@/core/shapes/semantic-node/style";
import { graphFromElements } from "@/features/diagram-code/canvas";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { connectorsOf, labelOf } from "@/features/whiteboard/commands/connectors";
import { supportsStyle, type StyleKey } from "@/features/whiteboard/commands/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementId, MAX_IDS, targetIds } from "../schemas";
import { TOOL_GROUPS, type ToolDefinition, type ToolGroup } from "../types";
import { ISSUE_CODES, validateBoard } from "../validate";
import { count, listIds, resolveTargets, summarize } from "./helpers";

// ── get_document_state ───────────────────────────────────────────────────────

const stateInput = z
  .object({
    limit: z.number().int().min(1).max(300).optional().describe("Most elements to list (default 100). More are counted, not listed; use find_elements to narrow."),
  })
  .strict();

export const getDocumentState: ToolDefinition<typeof stateInput> = {
  name: "get_document_state",
  group: "inspect",
  description: "Read the board: its revision, counts, the selection, and a compact list of shapes, connectors and groups with ids, positions and labels. Call this first. Changes nothing.",
  input: stateInput,
  access: "read",
  run: ({ limit = 100 }, { ctx, host, revision }) => {
    const connectors = connectorsOf(ctx);
    const connectorIds = new Set(connectors.map((c) => c.id));
    const labelIds = new Set(connectors.flatMap((c) => labelOf(ctx, c)?.id ?? []));
    const nodes = ctx.shapes.filter((shape) => !connectorIds.has(shape.id) && !labelIds.has(shape.id));
    const listed = nodes.slice(0, limit);
    const room = Math.max(0, limit - listed.length);
    const listedConnectors = connectors.slice(0, Math.max(room, Math.min(connectors.length, 60)));
    const all = unionBounds(ctx.shapes.flatMap((shape) => ctx.getBounds(shape) ?? []));
    const document = host.getDocument();
    const viewport = host.getViewport();
    const groups = [...ctx.index.groups.values()].map((record) => ({
      id: record.id,
      name: groupLabel(record),
      children: (ctx.index.childrenOf.get(record.id) ?? []).slice(0, 40),
      ...(record.groupId ? { parent: record.groupId } : {}),
      ...(record.locked ? { locked: true } : {}),
      ...(record.hidden ? { hidden: true } : {}),
    }));
    const truncated = nodes.length > listed.length || connectors.length > listedConnectors.length;
    return {
      summary: `Board "${document.title ?? document.id}": ${count(nodes.length, "element")}, ${count(connectors.length, "connector")}, ${count(groups.length, "group")}; revision ${revision}.`,
      data: {
        revision,
        board: { id: document.id, title: document.title, canEdit: document.canEdit },
        counts: { elements: nodes.length, connectors: connectors.length, groups: groups.length, hidden: ctx.shapes.filter((s) => isHiddenByFlag(ctx.index, s.id)).length },
        bounds: all ? { x: Math.round(all.minX), y: Math.round(all.minY), width: Math.round(all.width), height: Math.round(all.height) } : null,
        viewport: viewport ? { zoom: Math.round(viewport.zoom * 100) / 100, width: viewport.width, height: viewport.height } : undefined,
        selection: [...host.getSelection()].slice(0, 100),
        elements: listed.map((shape) => summarize(ctx, shape)),
        connectors: listedConnectors.map((shape) => summarize(ctx, shape)),
        groups,
        truncated,
      },
    };
  },
};

// ── get_element_details ──────────────────────────────────────────────────────

const detailsInput = z.object({ ids: targetIds.max(40) }).strict();

const STYLE_KEYS: StyleKey[] = ["color", "fill", "strokeWidth", "opacity", "cornerRadius", "fontSize", "fontWeight", "fontStyle"];

export const getElementDetails: ToolDefinition<typeof detailsInput> = {
  name: "get_element_details",
  group: "inspect",
  description: "Read everything editable about specific elements: type, position and size, text, style, icon, connections, group, and which properties can be changed. Changes nothing.",
  input: detailsInput,
  access: "read",
  run: ({ ids }, env) => {
    const { ctx } = env;
    const { shapeIds } = resolveTargets(env, ids);
    const details = shapeIds.map((id) => {
      const shape = ctx.index.shapes.get(id)!;
      const base = summarize(ctx, shape);
      const style: Record<string, unknown> = {};
      for (const key of STYLE_KEYS) {
        if (!supportsStyle(shape, key)) continue;
        if (key === "cornerRadius" && shape.type === "semantic-node") style[key] = normalizeNodeStyle((shape as { nodeStyle?: unknown }).nodeStyle).cornerRadius ?? 10;
        else style[key] = (shape as unknown as Record<string, unknown>)[key] ?? null;
      }
      const out: Record<string, unknown> = { ...base, style, editable: STYLE_KEYS.filter((key) => supportsStyle(shape, key)) };
      if (typeof shape.label === "string") out.fullLabel = shape.label;
      if (shape.type === "text") out.fullText = shape.text ?? "";
      if (shape.type === "semantic-node") out.nodeStyle = normalizeNodeStyle((shape as { nodeStyle?: unknown }).nodeStyle);
      if (shape.type === "semantic-node" || shape.type === "icon") out.iconDetails = { id: iconForNode(shape.ai).id, custom: shape.ai?.customIcon !== undefined };
      if (isArrowElement(shape)) {
        out.connector = {
          type: shape.type,
          routing: shape.routingMode ?? "orthogonal",
          dashed: Boolean(shape.dashed),
          headStart: Boolean(shape.arrowHeadStart),
          headEnd: shape.arrowHeadEnd !== false,
          manualBends: Boolean(shape.isManuallyRouted),
          points: shape.points.slice(0, 12).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        };
        out.label = labelOf(ctx, shape)?.text ?? undefined;
      } else {
        out.attachedConnectors = connectorsOf(ctx)
          .filter((arrow) => arrow.startConnection?.elementId === id || arrow.endConnection?.elementId === id)
          .map((arrow) => arrow.id)
          .slice(0, 30);
      }
      if (shape.ai?.semanticKind) out.kind = shape.ai.semanticKind;
      return out;
    });
    return { summary: `Details for ${count(details.length, "element")}: ${listIds(shapeIds)}.`, data: { revision: env.revision, elements: details } };
  },
};

// ── find_elements ───────────────────────────────────────────────────────────

const findInput = z
  .object({
    query: z.string().max(200).optional().describe("Matches id, label or text, case-insensitively."),
    types: z.array(z.string().max(40)).max(20).optional().describe('Element types, e.g. ["semantic-node","rectangle","arrow"].'),
    label_contains: z.string().max(200).optional(),
    icon: z.string().max(60).optional().describe("Icon id or alias, e.g. database."),
    in_group: elementId.optional(),
    connected_to: elementId.optional().describe("Elements joined to this one by a connector (and the connectors themselves)."),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    in_bounds: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() }).strict().optional().describe("Only elements whose box intersects this rectangle."),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const findElements: ToolDefinition<typeof findInput> = {
  name: "find_elements",
  group: "inspect",
  description: "Search the board by text, type, icon, group, connection, lock/hidden state or area (all given filters must match). Returns compact summaries with ids. Changes nothing.",
  input: findInput,
  access: "read",
  run: (input, { ctx, revision }) => {
    const limit = input.limit ?? 50;
    const q = (input.query ?? "").trim().toLowerCase();
    const contains = (input.label_contains ?? "").trim().toLowerCase();
    const wantIcon = input.icon ? (searchIcons(input.icon, 1)[0]?.id ?? input.icon.toLowerCase()) : undefined;
    const attached = new Set<string>();
    if (input.connected_to) {
      for (const arrow of connectorsOf(ctx)) {
        const s = arrow.startConnection?.elementId;
        const e = arrow.endConnection?.elementId;
        if (s === input.connected_to && e) attached.add(e);
        if (e === input.connected_to && s) attached.add(s);
        if (s === input.connected_to || e === input.connected_to) attached.add(arrow.id);
      }
    }
    const members = input.in_group ? new Set(ctx.index.leavesOf.get(input.in_group) ?? []) : null;
    const matches = ctx.shapes.filter((shape) => {
      const text = `${shape.label ?? ""} ${shape.text ?? ""}`.toLowerCase();
      if (q && !(shape.id.toLowerCase().includes(q) || text.includes(q))) return false;
      if (contains && !text.includes(contains)) return false;
      if (input.types && !input.types.includes(shape.type)) return false;
      if (wantIcon && !((shape.type === "semantic-node" || shape.type === "icon") && iconForNode(shape.ai).id === wantIcon)) return false;
      if (members && !members.has(shape.id)) return false;
      if (input.connected_to && !attached.has(shape.id)) return false;
      if (input.locked !== undefined && summarize(ctx, shape).locked !== (input.locked ? true : undefined)) return false;
      if (input.hidden !== undefined && isHiddenByFlag(ctx.index, shape.id) !== input.hidden) return false;
      if (input.in_bounds) {
        const b = ctx.getBounds(shape);
        const r = input.in_bounds;
        if (!b || b.maxX < r.x || b.minX > r.x + r.width || b.maxY < r.y || b.minY > r.y + r.height) return false;
      }
      return true;
    });
    const shown = matches.slice(0, limit);
    return {
      summary: matches.length === 0 ? "No element matches." : `${count(matches.length, "match", "matches")}${matches.length > shown.length ? ` (showing ${shown.length})` : ""}: ${listIds(shown.map((s) => s.id))}.`,
      data: { revision, total: matches.length, elements: shown.map((shape) => summarize(ctx, shape)) },
    };
  },
};

// ── selection ───────────────────────────────────────────────────────────────

export const getSelection: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "get_selection",
  group: "inspect",
  description: "Read what the person currently has selected (ids and summaries). Use it when they say \"this\", \"these\" or \"the selected node\". Changes nothing.",
  input: z.object({}).strict(),
  access: "read",
  needs: ["selection"],
  run: (_input, { ctx, host, revision }) => {
    const ids = host.getSelection().filter((id) => ctx.index.shapes.has(id));
    return {
      summary: ids.length === 0 ? "Nothing is selected." : `${count(ids.length, "element")} selected: ${listIds(ids)}.`,
      data: { revision, selection: ids, elements: ids.slice(0, 60).map((id) => summarize(ctx, ctx.index.shapes.get(id)!)) },
    };
  },
};

const selectInput = z.object({ ids: z.array(elementId).min(1).max(MAX_IDS), add: z.boolean().optional().describe("Add to the selection instead of replacing it.") }).strict();

export const selectElements: ToolDefinition<typeof selectInput> = {
  name: "select_elements",
  group: "inspect",
  description: "Select elements by id (replacing the selection, or adding to it) so the person sees them highlighted. A group id selects every shape in it. Does not change the board.",
  input: selectInput,
  access: "read",
  needs: ["selection"],
  run: ({ ids, add }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const next = add ? [...new Set([...env.host.getSelection(), ...shapeIds])] : shapeIds;
    return { summary: `Selected ${count(next.length, "element")}.`, data: { selection: next }, selection: next };
  },
};

export const clearSelection: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "clear_selection",
  group: "inspect",
  description: "Deselect everything. Does not change the board.",
  input: z.object({}).strict(),
  access: "read",
  needs: ["selection"],
  run: () => ({ summary: "Selection cleared.", data: { selection: [] }, selection: [] }),
};

// ── icons, validation, serialisation, meta ────────────────────────────────────

const iconSearchInput = z.object({ query: z.string().min(1).max(200).describe("One or more words, comma-separated: kafka, postgres, load balancer."), limit: z.number().int().min(1).max(20).optional() }).strict();

export const searchIconsTool: ToolDefinition<typeof iconSearchInput> = {
  name: "search_icons",
  group: "inspect",
  description: "Find icon ids in the editor's icon registry for create_icon, create_semantic_node and update_icon. Accepts technology names (postgres, kafka). Changes nothing.",
  input: iconSearchInput,
  access: "read",
  run: ({ query, limit = 5 }) => {
    const terms = [...new Set(query.split(/[,\n;]/).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
    const results = terms.map((term) => ({ term, icons: searchIcons(term, limit).map((m) => ({ id: m.id, category: m.category, via: m.via })) }));
    return { summary: results.map((r) => `${r.term}: ${r.icons.map((i) => i.id).join(", ") || "no match"}`).join(" | "), data: { results, registrySize: listIcons().length } };
  },
};

const validateInput = z.object({ include: z.array(z.enum(ISSUE_CODES)).max(ISSUE_CODES.length).optional().describe("Only report these kinds of problem (default: all).") }).strict();

export const validateDiagram: ToolDefinition<typeof validateInput> = {
  name: "validate_diagram",
  group: "inspect",
  description: "Check the board's structure: connectors attached to missing elements, shapes that cannot be drawn, leftover labels and groups, overlapping shapes, connectors crossing shapes. Returns issues with ids and whether validate_and_repair_diagram can fix them. Changes nothing.",
  input: validateInput,
  access: "read",
  run: ({ include }, { ctx, revision }) => {
    const issues = validateBoard(ctx).filter((i) => !include || include.includes(i.code));
    const errors = issues.filter((i) => i.severity === "error").length;
    return {
      summary: issues.length === 0 ? "No problems found." : `${count(issues.length, "kind")} of problem found (${errors} error${errors === 1 ? "" : "s"}): ${issues.map((i) => i.code).join(", ")}.`,
      data: { revision, ok: errors === 0, issues },
    };
  },
};

const serializeInput = z
  .object({
    format: z.enum(["diagram_code", "json"]).describe("diagram_code is the editor's text DSL (nodes, connections, groups); json is the raw elements."),
    ids: z.array(z.string().max(130)).max(MAX_IDS).optional().describe("Limit to these elements; default is the whole board."),
    with_layout: z.boolean().optional().describe("diagram_code only: include positions, sizes and connection sides."),
  })
  .strict();

const MAX_SERIALIZED_CHARS = 60_000;

export const serializeDiagram: ToolDefinition<typeof serializeInput> = {
  name: "serialize_diagram",
  group: "inspect",
  description: "Return the board (or some elements) as diagram code or JSON, to read it as text or to re-import it later. Changes nothing.",
  input: serializeInput,
  access: "read",
  run: ({ format, ids, with_layout }, env) => {
    const { ctx } = env;
    const picked = ids ? new Set(resolveTargets(env, ids).shapeIds) : null;
    const shapes = picked ? ctx.shapes.filter((s) => picked.has(s.id)) : [...ctx.shapes];
    if (format === "json") {
      const text = JSON.stringify(picked ? shapes : ctx.stored);
      return { summary: `Serialized ${count(shapes.length, "element")} as JSON (${text.length} characters).`, data: { format, content: text.slice(0, MAX_SERIALIZED_CHARS), truncated: text.length > MAX_SERIALIZED_CHARS } };
    }
    const { graph } = graphFromElements(shapes as DrawingElement[], { layout: with_layout === true });
    const code = serializeDiagramCode(graph);
    return {
      summary: `Serialized ${count(graph.nodes.length, "node")} and ${count(graph.edges.length, "connection")} as diagram code.`,
      data: { format, content: code.slice(0, MAX_SERIALIZED_CHARS), truncated: code.length > MAX_SERIALIZED_CHARS, nodes: graph.nodes.length, edges: graph.edges.length, ignored: shapes.length - graph.nodes.length },
    };
  },
};

const fitInput = z.object({ ids: z.array(elementId).max(MAX_IDS).optional().describe("Fit these elements; default is everything.") }).strict();

export const zoomToFit: ToolDefinition<typeof fitInput> = {
  name: "zoom_to_fit",
  group: "inspect",
  description: "Pan and zoom the view so the whole diagram (or the given elements) is visible. Does not change the board.",
  input: fitInput,
  access: "read",
  needs: ["viewport"],
  run: ({ ids }, env) => {
    const { ctx, host } = env;
    const shapes = ids ? resolveTargets(env, ids).shapeIds.map((id) => ctx.index.shapes.get(id)!) : [...ctx.shapes];
    const box = unionBounds(shapes.flatMap((shape) => ctx.getBounds(shape) ?? []));
    host.fitView?.(box);
    return { summary: box ? `View fitted to ${count(shapes.length, "element")}.` : "Nothing to fit; the view was reset.", data: { fitted: box !== null } };
  },
};

const enableInput = z.object({ groups: z.array(z.enum(TOOL_GROUPS)).min(1).max(TOOL_GROUPS.length) }).strict();

/** Groups and what they hold, shown to the model by `enable_tools` and in the prompt. */
export const GROUP_DESCRIPTIONS: Record<ToolGroup, string> = {
  inspect: "read the board, find and select elements, validate, serialise (always on)",
  create: "create shapes, text, icons, semantic nodes, groups, frames, duplicates, import diagram code",
  edit: "change text, icons, styles, position, size, rotation, lock, hide, order; delete",
  connect: "create, edit, re-route, label, disconnect and delete connectors",
  arrange: "align, distribute, space, auto layout, tidy, layout presets",
  organize: "group, ungroup, rename groups",
  document: "undo, redo, clear, export, save, load, repair",
  generate: "draw a new diagram from a description",
  memory: "remember a preference or decision",
};

export const enableTools = (onEnable: (groups: ToolGroup[]) => void): ToolDefinition<typeof enableInput> => ({
  name: "enable_tools",
  group: "inspect",
  description: `Turn on more tools. Groups: ${TOOL_GROUPS.map((g) => `${g} (${GROUP_DESCRIPTIONS[g]})`).join("; ")}. Takes effect on your next step.`,
  input: enableInput,
  access: "read",
  run: ({ groups }) => {
    onEnable(groups);
    return { summary: `Enabled: ${groups.join(", ")}.`, data: { enabled: groups } };
  },
});

export const INSPECT_TOOLS = [getDocumentState, getElementDetails, findElements, getSelection, selectElements, clearSelection, searchIconsTool, validateDiagram, serializeDiagram, zoomToFit] as const;

