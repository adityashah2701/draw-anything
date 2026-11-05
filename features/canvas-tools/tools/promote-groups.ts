import { createFrame } from "@/core/frames/frame-api";
import { applyPatch } from "@/core/groups/patch";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";

type Box = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

const boxOf = (el: DrawingElement): Box | null => {
  if (el.points.length < 2) return null;
  const xs = el.points.map((p) => p.x), ys = el.points.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null;
};
const within = (inner: Box, outer: Box) => inner.minX >= outer.minX - 1 && inner.minY >= outer.minY - 1 && inner.maxX <= outer.maxX + 1 && inner.maxY <= outer.maxY + 1;

/**
 * The generator draws a group as a guide rectangle plus a heading text. On the board a group is a real frame:
 * it owns its nodes (they move with it), its title is editable and nested groups nest. Each group rectangle becomes
 * a frame with its heading as the title (outer frames first, so an inner one is created inside its parent); the
 * guide rectangle and heading are dropped. Everything else is returned unchanged. Pure.
 */
export const promoteGroupFrames = (elements: readonly DrawingElement[]): DrawingElement[] => {
  const groups = elements.filter((el) => el.isGuide && el.ai?.role === "group");
  if (groups.length === 0) return [...elements];
  const titles = new Map(elements.filter((el) => el.ai?.role === "group-label").map((el) => [el.id.replace(/-label$/, ""), el.text ?? ""]));
  let stored: StoredElement[] = elements.filter((el) => !(el.isGuide && (el.ai?.role === "group" || el.ai?.role === "group-label")));
  const made: Array<{ id: string; box: Box }> = [];
  const ordered = groups.flatMap((g) => ((box) => (box ? [{ g, box }] : []))(boxOf(g))).sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  for (const { g, box } of ordered) {
    const parent = made.filter((f) => within(box, f.box)).sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
    const result = createFrame(stored, { id: g.id, box, title: titles.get(g.id) || undefined, parent: parent?.id ?? null, adopt: true });
    if (!result.ok) continue;
    stored = applyPatch(stored, { ...result.patch, origin: "layout" });
    made.push({ id: g.id, box });
  }
  return stored as DrawingElement[];
};
