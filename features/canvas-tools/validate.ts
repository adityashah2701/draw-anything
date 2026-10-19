import { isGroupRecord } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { isArrowElement, type ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { getShapeAnchors, getShapeDefinition } from "@/core/shapes/shape-runtime";
import { pathHitsBox } from "@/features/ai/server/layout/geometry";
import { labelKeyOf, planDetach, planReroute } from "@/features/whiteboard/commands/connectors";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { isLayoutNode } from "@/features/whiteboard/commands/layout";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export const ISSUE_CODES = [
  "duplicate_id",
  "invalid_geometry",
  "dangling_connector",
  "bad_anchor",
  "stale_connector",
  "dangling_group_ref",
  "empty_group",
  "orphan_edge_label",
  "overlap",
  "connector_through_node",
  "free_connector_end",
  "unlabeled_node",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** Problems the repair tool may fix when asked by code. The rest are reported only. */
export const REPAIRABLE: ReadonlySet<IssueCode> = new Set(["dangling_connector", "bad_anchor", "stale_connector", "dangling_group_ref", "empty_group", "orphan_edge_label", "invalid_geometry", "connector_through_node"]);

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning" | "info";
  message: string;
  ids: string[];
  repairable: boolean;
}

const issue = (code: IssueCode, severity: Issue["severity"], message: string, ids: string[]): Issue => ({ code, severity, message, ids, repairable: REPAIRABLE.has(code) });

/** How far a connector end may sit from its connection point before it counts as floating. */
const STALE_END = 12;

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/**
 * Structural checks on any board (not just a compiled diagram): references that point at nothing, shapes that
 * cannot be drawn, labels left behind, and, as warnings, overlaps and connectors that cross a shape. Pure and
 * read-only; `repair` below fixes the repairable kinds on request.
 */
export const validateBoard = (ctx: CommandContext): Issue[] => {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of ctx.stored) (seen.has(item.id) ? dupes : seen).add(item.id);
  if (dupes.size > 0) issues.push(issue("duplicate_id", "error", `${dupes.size} id(s) are used by more than one element; only the first is reachable.`, [...dupes].slice(0, 20)));

  const shapes = ctx.shapes;
  const badGeometry = shapes.filter((shape) => !Array.isArray(shape.points) || shape.points.length === 0 || !shape.points.every((p) => finite(p?.x) && finite(p?.y)) || !getShapeDefinition(shape.type));
  if (badGeometry.length > 0) issues.push(issue("invalid_geometry", "error", "These elements have an unknown type or points that are missing or not numbers, so they cannot be drawn.", badGeometry.map((s) => s.id)));

  const dangling: string[] = [];
  const badAnchor: string[] = [];
  const freeEnd: string[] = [];
  const stale: string[] = [];
  for (const arrow of shapes.filter(isArrowElement)) {
    const ends = [arrow.startConnection, arrow.endConnection];
    if (ends.some((end) => end && !ctx.index.shapes.has(end.elementId))) {
      dangling.push(arrow.id);
      continue;
    }
    if (ends.some((end) => !end)) freeEnd.push(arrow.id);
    for (const [index, end] of ends.entries()) {
      if (!end?.anchorId) continue;
      const target = ctx.index.shapes.get(end.elementId)!;
      const bounds = ctx.getBounds(target);
      const anchor = bounds ? getShapeAnchors(target, bounds).find((candidate) => candidate.id === end.anchorId) : undefined;
      if (!anchor) {
        if (bounds) {
          badAnchor.push(arrow.id);
          break;
        }
        continue;
      }
      // The path must still reach the connection point; after a move that did not re-route it, an end floats in space.
      const tip = index === 0 ? arrow.points[0] : arrow.points[arrow.points.length - 1];
      if (tip && Math.hypot(tip.x - anchor.x, tip.y - anchor.y) > STALE_END) {
        stale.push(arrow.id);
        break;
      }
    }
  }
  if (dangling.length > 0) issues.push(issue("dangling_connector", "error", "These connectors are attached to elements that are not on the board.", dangling));
  if (badAnchor.length > 0) issues.push(issue("bad_anchor", "warning", "These connectors name a connection point their shape does not have (re-routing re-attaches them).", badAnchor));
  if (stale.length > 0) issues.push(issue("stale_connector", "warning", "These connectors no longer reach the shapes they are attached to, so an end floats in empty space (reroute_connector re-attaches them).", stale));
  if (freeEnd.length > 0) issues.push(issue("free_connector_end", "info", "These connectors have an end that is not attached to any shape.", freeEnd));

  const records = ctx.stored.filter(isGroupRecord);
  const emptyGroups = records.filter((record) => !ctx.index.groups.has(record.id) && !ctx.index.shapes.has(record.id)).map((r) => r.id);
  if (emptyGroups.length > 0) issues.push(issue("empty_group", "warning", "These groups hold no shapes.", emptyGroups));
  const recordIds = new Set(records.map((record) => record.id));
  const danglingRefs = ctx.stored.filter((item) => item.groupId !== undefined && !recordIds.has(item.groupId)).map((item) => item.id);
  if (danglingRefs.length > 0) issues.push(issue("dangling_group_ref", "warning", "These elements say they are in a group that does not exist.", danglingRefs));

  const connectorKeys = new Set(shapes.filter(isArrowElement).map(labelKeyOf));
  const orphans = shapes.filter((shape) => shape.ai?.role === "edge-label" && !connectorKeys.has(shape.ai.semanticId ?? "")).map((s) => s.id);
  if (orphans.length > 0) issues.push(issue("orphan_edge_label", "warning", "These connector labels belong to connectors that are gone.", orphans));

  const nodes = shapes.filter((shape) => isLayoutNode(shape) && !isHiddenByFlag(ctx.index, shape.id) && !badGeometry.includes(shape));
  const boxes = nodes.flatMap((shape) => {
    const b = ctx.getBounds(shape);
    return b ? [{ shape, b }] : [];
  });
  const overlapping = new Set<string>();
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i].b;
      const c = boxes[j].b;
      const w = Math.min(a.maxX, c.maxX) - Math.max(a.minX, c.minX);
      const h = Math.min(a.maxY, c.maxY) - Math.max(a.minY, c.minY);
      if (w <= 2 || h <= 2) continue;
      const contains = (p: typeof a, q: typeof a) => p.minX <= q.minX && p.maxX >= q.maxX && p.minY <= q.minY && p.maxY >= q.maxY;
      if (contains(a, c) || contains(c, a)) continue; // nesting is deliberate
      overlapping.add(boxes[i].shape.id);
      overlapping.add(boxes[j].shape.id);
    }
  }
  if (overlapping.size > 0) issues.push(issue("overlap", "warning", "These shapes overlap each other (tidy_diagram pulls them apart).", [...overlapping].slice(0, 40)));

  const through: string[] = [];
  for (const arrow of shapes.filter(isArrowElement)) {
    if (dangling.includes(arrow.id) || arrow.points.length < 2) continue;
    const own = new Set([arrow.startConnection?.elementId, arrow.endConnection?.elementId]);
    const hit = boxes.some(({ shape, b }) => !own.has(shape.id) && pathHitsBox(arrow.points, { minX: b.minX + 2, minY: b.minY + 2, maxX: b.maxX - 2, maxY: b.maxY - 2 }));
    if (hit) through.push(arrow.id);
  }
  if (through.length > 0) issues.push(issue("connector_through_node", "warning", "These connectors run through a shape they are not attached to (reroute_connector may fix it).", through));

  const unlabeled = nodes.filter((shape) => !(typeof shape.label === "string" && shape.label.trim() !== "") && shape.type !== "icon").map((s) => s.id);
  if (unlabeled.length > 0) issues.push(issue("unlabeled_node", "info", "These shapes have no label.", unlabeled.slice(0, 40)));
  return issues;
};

export interface RepairResult {
  patch: DocPatch | null;
  repaired: Array<{ code: IssueCode; ids: string[] }>;
  skipped: Array<{ code: IssueCode; reason: string }>;
}

/**
 * Fix the listed kinds of problem and nothing else. A dangling connector is removed (or, with
 * `danglingPolicy: "detach"`, kept as a free arrow); the other repairs re-attach, clear or remove exactly
 * the elements the check named. Everything goes in one patch.
 */
export const repairBoard = (ctx: CommandContext, codes: readonly IssueCode[], { danglingPolicy }: { danglingPolicy: "remove" | "detach" }): RepairResult => {
  const found = new Map(validateBoard(ctx).map((i) => [i.code, i]));
  const patch: DocPatch = { add: [], update: [], remove: [] };
  const repaired: RepairResult["repaired"] = [];
  const skipped: RepairResult["skipped"] = [];
  const updated = new Map<string, DrawingElement | NonNullable<DocPatch["update"][number]>>();
  const remove = new Set<string>();

  for (const code of codes) {
    const entry = found.get(code);
    if (!entry) {
      skipped.push({ code, reason: "no such problem on the board" });
      continue;
    }
    if (!REPAIRABLE.has(code)) {
      skipped.push({ code, reason: "this kind of problem is reported, not repaired automatically" });
      continue;
    }
    switch (code) {
      case "dangling_connector": {
        if (danglingPolicy === "remove") entry.ids.forEach((id) => remove.add(id));
        else {
          const detach = planDetach(ctx, entry.ids);
          detach?.update.forEach((el) => updated.set(el.id, el));
        }
        break;
      }
      case "bad_anchor":
      case "stale_connector":
      case "connector_through_node": {
        const result = planReroute(ctx, entry.ids, { forgetManual: code === "bad_anchor" || code === "stale_connector" });
        result.patch?.update.forEach((el) => updated.set(el.id, el));
        break;
      }
      case "dangling_group_ref":
        for (const id of entry.ids) {
          const element = ctx.stored.find((item) => item.id === id);
          if (element) updated.set(id, { ...element, groupId: undefined } as DrawingElement);
        }
        break;
      case "empty_group":
      case "orphan_edge_label":
      case "invalid_geometry":
        entry.ids.forEach((id) => remove.add(id));
        break;
    }
    repaired.push({ code, ids: entry.ids });
  }
  // Removing a shape takes its connectors with it (and a removed connector its label): a repair never orphans anything.
  for (const arrow of ctx.shapes.filter(isArrowElement)) {
    if ([arrow.startConnection?.elementId, arrow.endConnection?.elementId].some((end) => end !== undefined && remove.has(end))) remove.add(arrow.id);
  }
  for (const arrow of ctx.shapes.filter(isArrowElement)) {
    if (!remove.has(arrow.id)) continue;
    for (const label of ctx.shapes) if (label.ai?.role === "edge-label" && label.ai.semanticId === labelKeyOf(arrow)) remove.add(label.id);
  }
  patch.update = [...updated.values()].filter((el) => !remove.has(el.id)) as DocPatch["update"];
  patch.remove = [...remove];
  return { patch: patch.update.length === 0 && patch.remove.length === 0 ? null : patch, repaired, skipped };
};

export type { ArrowElement };
