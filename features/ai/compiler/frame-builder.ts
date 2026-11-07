import {
  FRAME_NEST_STEP,
  FRAME_PADDING,
  groupFrameStyle,
  FRAME_TITLE_FONT_SIZE,
  FRAME_TITLE_FONT_WEIGHT,
  frameTopBand,
} from "@/features/ai/layout/frame-constants";
import { estimateTextWidth } from "@/core/text/estimate";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import { placeGroupHeadings, type HeadingRequest } from "@/features/ai/layout/group-headings";
import type { Box } from "@/features/ai/layout/geometry";
import type {
  AIDiagramDocumentV1,
  AIDiagramGroup,
} from "@/features/ai/types";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { PositionedNode } from "./node-factory";

/** Where a group heading starts, from its frame's top-left corner. */
export const FRAME_TITLE_INSET = 16;
export const FRAME_TITLE_TOP = 8;

export interface GroupBox {
  group: AIDiagramGroup;
  members: PositionedNode[];
  depth: number;
}

/** Groups worth drawing: known members only, at least two, deduplicated by member set. */
export const usableGroups = (
  document: AIDiagramDocumentV1,
  positioned: Map<string, PositionedNode>,
): Array<{ group: AIDiagramGroup; members: PositionedNode[] }> => {
  const seen = new Set<string>();
  return document.groups
    .map((group) => ({
      group,
      members: Array.from(new Set(group.nodeIds))
        .map((id) => positioned.get(id))
        .filter((member): member is PositionedNode => member !== undefined),
    }))
    .filter(({ group, members }) => {
      if (members.length < 2) return false;
      const key = members.map((m) => m.node.id).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return group.label.trim().length > 0;
    })
    // outer (larger) groups first so they are drawn underneath
    .sort((a, b) => b.members.length - a.members.length || a.group.id.localeCompare(b.group.id));
};

export const nestingDepths = (
  groups: Array<{ group: AIDiagramGroup; members: PositionedNode[] }>,
): GroupBox[] => {
  const ids = groups.map((g) => new Set(g.members.map((m) => m.node.id)));
  const depth: number[] = new Array(groups.length).fill(0);
  // groups are sorted largest first, so every strict subset comes later
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const isSubset = [...ids[j]].every((id) => ids[i].has(id)) && ids[j].size < ids[i].size;
      if (isSubset) depth[i] = Math.max(depth[i], depth[j] + 1);
    }
  }
  return groups.map((g, i) => ({ ...g, depth: depth[i] }));
};

export const frameBounds = ({ members, depth }: GroupBox) => {
  const pad = FRAME_PADDING + depth * FRAME_NEST_STEP;
  return {
    minX: Math.min(...members.map((m) => m.bounds.minX)) - pad,
    maxX: Math.max(...members.map((m) => m.bounds.maxX)) + pad,
    minY: Math.min(...members.map((m) => m.bounds.minY)) - pad - frameTopBand(depth),
    maxY: Math.max(...members.map((m) => m.bounds.maxY)) + pad,
  };
};

export const intersects = (
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

export const contains = (
  outer: { minX: number; maxX: number; minY: number; maxY: number },
  inner: { minX: number; maxX: number; minY: number; maxY: number },
) =>
  outer.minX <= inner.minX &&
  outer.maxX >= inner.maxX &&
  outer.minY <= inner.minY &&
  outer.maxY >= inner.maxY;

/**
 * Frames drawn under the nodes of each group. A frame is only drawn when it
 * encloses exactly its members: one that would also cover an unrelated node, or
 * partly overlap another frame, would say something the graph does not, so it
 * is left out instead.
 */
export const buildGroupFrames = (
  document: AIDiagramDocumentV1,
  positioned: Map<string, PositionedNode>,
  frameId: string,
): { elements: DrawingElement[]; headings: HeadingRequest[]; members: Map<string, Set<string>>; dropped: string[] } => {
  const boxes = nestingDepths(usableGroups(document, positioned));
  const accepted: Array<{ box: GroupBox; bounds: ReturnType<typeof frameBounds> }> = [];

  for (const box of boxes) {
    const bounds = frameBounds(box);
    const memberIds = new Set(box.members.map((m) => m.node.id));
    const swallowsStranger = [...positioned.values()].some(
      (p) => !memberIds.has(p.node.id) && intersects(bounds, p.bounds),
    );
    const clashes = accepted.some(
      ({ bounds: other }) =>
        intersects(bounds, other) && !contains(other, bounds) && !contains(bounds, other),
    );
    if (!swallowsStranger && !clashes) accepted.push({ box, bounds });
  }
  const acceptedIds = new Set(accepted.map(({ box }) => box.group.id));
  const dropped = boxes.filter(({ group }) => !acceptedIds.has(group.id)).map(({ group }) => group.id);

  const headings: HeadingRequest[] = accepted.map(({ box, bounds }) => ({
    id: `${document.metadata.generationId}-group-${box.group.id}-label`,
    frame: bounds,
    width: Math.ceil(estimateTextWidth(box.group.label, FRAME_TITLE_FONT_SIZE, FRAME_TITLE_FONT_WEIGHT)),
    height: FRAME_TITLE_FONT_SIZE * LINE_HEIGHT_RATIO,
    top: FRAME_TITLE_TOP,
    inset: FRAME_TITLE_INSET,
  }));

  const elements = accepted.flatMap(({ box, bounds }) => {
    const base = `${document.metadata.generationId}-group-${box.group.id}`;
    const ai = {
      frameId,
      generationId: document.metadata.generationId,
      semanticId: box.group.id,
      diagramType: document.diagramType,
    };
    const frame: DrawingElement = {
      id: base,
      type: "rectangle",
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      ...groupFrameStyle(accepted.filter((other) => other.box !== box && contains(other.bounds, bounds)).length),
      isGuide: true,
      ai: { ...ai, role: "group" },
    };
    const title: DrawingElement = {
      id: `${base}-label`,
      type: "text",
      points: [{ x: bounds.minX + FRAME_TITLE_INSET, y: bounds.minY + FRAME_TITLE_TOP }],
      color: "#000000",
      strokeWidth: 1,
      text: box.group.label,
      fontSize: FRAME_TITLE_FONT_SIZE,
      fontWeight: FRAME_TITLE_FONT_WEIGHT,
      fontStyle: "normal",
      isGuide: true,
      ai: { ...ai, role: "group-label" },
    };
    return [frame, title];
  });
  const members = new Map(accepted.map(({ box }) => [`${document.metadata.generationId}-group-${box.group.id}-label`, new Set(box.members.map((m) => m.node.id))]));
  return { elements, headings, members, dropped };
};

export const adjustGroupHeadings = (
  frames: { headings: HeadingRequest[]; elements: DrawingElement[]; members: Map<string, Set<string>> },
  paths: Map<string, Point[]>,
  positionedByNodeId: Map<string, PositionedNode>,
): Box[] => {
  const headingSpots = placeGroupHeadings(frames.headings, Array.from(paths.values()), (id, grown) => {
    // A frame may grow to make room for its name unless that would cover a node that is not in it or cut into another frame.
    const own = frames.headings.find((h) => h.id === id)!;
    const memberIds = frames.members.get(id) ?? new Set<string>();
    const coversStranger = [...positionedByNodeId.values()].some((p) => !memberIds.has(p.node.id) && intersects(grown, p.bounds));
    const cutsFrame = frames.headings.some((h) => h.id !== id && intersects(grown, h.frame) && !contains(h.frame, grown) && !contains(grown, h.frame));
    return !coversStranger && !cutsFrame && grown.maxX >= own.frame.maxX;
  });
  for (const element of frames.elements) {
    const label = headingSpots.get(element.id);
    if (label) element.points = [{ x: label.x, y: label.y }];
    // A frame that grew: the rectangle is the element named like its heading, without the suffix.
    const grewFor = headingSpots.get(`${element.id}-label`);
    if (grewFor?.frameMaxX !== undefined && element.ai?.role === "group") element.points = [element.points[0], { x: grewFor.frameMaxX, y: element.points[1].y }];
  }
  return frames.headings.map((h) => {
    const spot = headingSpots.get(h.id)!;
    return { minX: spot.x, minY: spot.y, maxX: spot.x + h.width, maxY: spot.y + h.height };
  });
};
