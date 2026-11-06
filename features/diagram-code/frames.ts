import { assignToFrame, createFrame } from "@/core/frames/frame-api";
import { FRAME_DEFAULTS } from "@/core/frames/frame-model";
import { makeBounds, unionBounds } from "@/core/geometry/box";
import { applyPatch } from "@/core/groups/patch";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { Bounds, DrawingElement, FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import type { ContainerRef, DiagramIR, IRFrame } from "./language/ir";
import { LineIndex } from "./language/source";
import type { DiagramCodeIssue } from "./types";

/**
 * Frames of a compiled diagram, drawn through the canvas frame API (`core/frames`), the only place
 * that knows what a frame is. The layout engine places nodes as before; this layer then wraps them:
 * each frame gets a box around what it holds (or the box the code gave), the frame is created with
 * `createFrame`, and its members are handed over with `assignToFrame`. A frame the API refuses
 * (too deep, ...) is reported and its contents stay where they are.
 */

/** Id of the frame element drawn for a frame of the code. */
export const frameElementId = (generationId: string, frameId: string) => `${generationId}-frame-${frameId}`;

const FALLBACK_SIZE = { width: 240, height: 160 };

/** Ids of the arrows' ends are element ids; the nodes they stand for are found by `ai.semanticId`. */
const isArrow = (el: DrawingElement) => el.type === "arrow" || el.type === "arrow-bidirectional";

export interface FramedDiagram {
  elements: DrawingElement[];
  issues: DiagramCodeIssue[];
}

export const drawFrames = (ir: DiagramIR, elements: DrawingElement[], { source, generationId, frameId }: { source: string; generationId: string; frameId: string }): FramedDiagram => {
  if (ir.frames.length === 0) return { elements, issues: [] };
  const issues: DiagramCodeIssue[] = [];
  const index = new LineIndex(source);
  /** A warning pointing at the frame's declaration. */
  const warn = (frame: IRFrame, code: string, message: string) => {
    const start = index.positionAt(frame.span.start);
    const end = index.positionAt(frame.span.end);
    issues.push({ line: start.line, column: start.column, endLine: end.line, endColumn: end.column, span: frame.span, severity: "warning", code, message });
  };

  // Parent links of every container, to find the frame a node, group or frame sits in.
  const parents = new Map<string, ContainerRef | undefined>();
  for (const group of ir.groups) parents.set(`group:${group.id}`, group.parent);
  for (const frame of ir.frames) parents.set(`frame:${frame.id}`, frame.parent);
  const enclosingFrame = (start: ContainerRef | undefined): string | undefined => {
    for (let at = start, guard = 0; at && guard < 1_000; guard += 1) {
      if (at.type === "frame") return at.id;
      at = parents.get(`${at.type}:${at.id}`);
    }
    return undefined;
  };
  const frameChain = (id: string | undefined): string[] => {
    const chain: string[] = [];
    for (let at = id, guard = 0; at && guard < 1_000; guard += 1) {
      chain.push(at);
      at = ir.frames.find((frame) => frame.id === at)?.parent?.id;
    }
    return chain;
  };

  // Which frame holds each drawn element: nodes and groups by the code's nesting, arrows by their two ends.
  const nodeFrame = new Map(ir.nodes.map((node) => [node.id, enclosingFrame(node.parent)]));
  const groupFrame = new Map(ir.groups.map((group) => [group.id, enclosingFrame(group.parent)]));
  const nodeOfElement = new Map<string, string>();
  const ownerOf = new Map<string, string>(); // element id -> frame id of the code
  const arrowFrame = new Map<string, string | undefined>(); // arrow semantic id -> frame
  for (const el of elements) {
    const semantic = el.ai?.semanticId;
    if (el.ai?.role === "node" && semantic) {
      nodeOfElement.set(el.id, semantic);
      const owner = nodeFrame.get(semantic);
      if (owner) ownerOf.set(el.id, owner);
    } else if ((el.ai?.role === "group" || el.ai?.role === "group-label") && semantic) {
      const owner = groupFrame.get(semantic);
      if (owner) ownerOf.set(el.id, owner);
    }
  }
  for (const el of elements) {
    if (!isArrow(el)) continue;
    const arrow = el as DrawingElement & { startConnection?: { elementId: string }; endConnection?: { elementId: string } };
    const from = arrow.startConnection && nodeOfElement.get(arrow.startConnection.elementId);
    const to = arrow.endConnection && nodeOfElement.get(arrow.endConnection.elementId);
    if (!from || !to) continue;
    const fromChain = frameChain(nodeFrame.get(from));
    const toChain = new Set(frameChain(nodeFrame.get(to)));
    const shared = fromChain.find((id) => toChain.has(id));
    arrowFrame.set(el.ai?.semanticId ?? el.id, shared);
    if (shared) ownerOf.set(el.id, shared);
  }
  for (const el of elements) {
    if (el.ai?.role !== "edge-label") continue;
    const arrow = [...arrowFrame.keys()].find((id) => `${id}-label` === el.ai!.semanticId);
    const owner = arrow === undefined ? undefined : arrowFrame.get(arrow);
    if (owner) ownerOf.set(el.id, owner);
  }

  // Boxes, innermost first: a frame wraps its own elements and the boxes of the frames inside it.
  const byId = new Map(elements.map((el) => [el.id, el]));
  const heldBy = new Map<string, string[]>();
  for (const [elementId, frame] of ownerOf) heldBy.set(frame, [...(heldBy.get(frame) ?? []), elementId]);
  const childFrames = new Map<string, IRFrame[]>();
  for (const frame of ir.frames) if (frame.parent) childFrames.set(frame.parent.id, [...(childFrames.get(frame.parent.id) ?? []), frame]);

  const boxes = new Map<string, Bounds>();
  const contentOf = (frame: IRFrame): Bounds | null => {
    const parts: Bounds[] = [];
    for (const id of heldBy.get(frame.id) ?? []) {
      const el = byId.get(id);
      const bounds = el && !isArrow(el) ? getShapeBounds(el) : null;
      if (bounds) parts.push(bounds);
    }
    for (const child of childFrames.get(frame.id) ?? []) parts.push(boxOf(child));
    return unionBounds(parts);
  };
  const boxOf = (frame: IRFrame): Bounds => {
    const known = boxes.get(frame.id);
    if (known) return known;
    const padding = frame.padding ?? FRAME_DEFAULTS.padding;
    const content = contentOf(frame);
    const minX = frame.x ?? (content ? content.minX - padding : 0);
    const minY = frame.y ?? (content ? content.minY - padding : 0);
    const maxX = frame.width !== undefined ? minX + frame.width : content ? content.maxX + padding : minX + FALLBACK_SIZE.width;
    const maxY = frame.height !== undefined ? minY + frame.height : content ? content.maxY + padding : minY + FALLBACK_SIZE.height;
    const box = makeBounds(minX, minY, Math.max(maxX, minX + 1), Math.max(maxY, minY + 1));
    boxes.set(frame.id, box);
    return box;
  };
  const depthOf = (frame: IRFrame) => frameChain(frame.id).length;

  // Sibling frames that the layout packed closer than two paddings and a title band would overlap: the padding on
  // their facing sides is trimmed (never into the contents, and leaving room for the title tab) until 8 units separate them.
  for (const frame of ir.frames) boxOf(frame);
  const siblings = new Map<string, IRFrame[]>();
  for (const frame of ir.frames) if (frame.x === undefined && frame.y === undefined) siblings.set(frame.parent?.id ?? "", [...(siblings.get(frame.parent?.id ?? "") ?? []), frame]);
  for (const group of siblings.values()) {
    for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) {
      const [p, q] = [group[i], group[j]];
      const [bp, bq] = [boxes.get(p.id)!, boxes.get(q.id)!];
      const [cp, cq] = [contentOf(p), contentOf(q)];
      if (!cp || !cq) continue;
      const ox = Math.min(bp.maxX, bq.maxX) - Math.max(bp.minX, bq.minX);
      const oy = Math.min(bp.maxY, bq.maxY) - Math.max(bp.minY, bq.minY);
      if (ox <= 0 || oy <= 0) continue;
      const vertical = oy <= ox;
      const pFirst = vertical ? bp.minY + bp.maxY < bq.minY + bq.maxY : bp.minX + bp.maxX < bq.minX + bq.maxX;
      const [first, second, cFirst, cSecond] = pFirst ? [bp, bq, cp, cq] : [bq, bp, cq, cp];
      // The second frame's title tab sits above its box, so a frame below needs room for it too.
      let need = (vertical ? first.maxY - second.minY + FRAME_DEFAULTS.tabHeight : first.maxX - second.minX) + 8;
      const end = vertical ? first.maxY : first.maxX;
      const cut = Math.max(0, Math.min(need, end - ((vertical ? cFirst.maxY : cFirst.maxX) + 4)));
      need -= cut;
      const start = vertical ? second.minY : second.minX;
      const push = Math.max(0, Math.min(need, (vertical ? cSecond.minY - 4 : cSecond.minX - 4) - start));
      const trimmedFirst = vertical ? makeBounds(first.minX, first.minY, first.maxX, end - cut) : makeBounds(first.minX, first.minY, end - cut, first.maxY);
      const trimmedSecond = vertical ? makeBounds(second.minX, start + push, second.maxX, second.maxY) : makeBounds(start + push, second.minY, second.maxX, second.maxY);
      boxes.set(pFirst ? p.id : q.id, trimmedFirst);
      boxes.set(pFirst ? q.id : p.id, trimmedSecond);
    }
  }

  let stored: StoredElement[] = [...elements] as unknown as StoredElement[];
  const created = new Map<string, string>(); // code frame id -> element id
  const nearestCreated = (frame: IRFrame): string | null => {
    for (const id of frameChain(frame.parent?.id)) {
      const element = created.get(id);
      if (element) return element;
    }
    return null;
  };

  for (const frame of [...ir.frames].sort((a, b) => depthOf(a) - depthOf(b))) {
    const box = boxOf(frame);
    const elementId = frameElementId(generationId, frame.id);
    const result = createFrame(stored, {
      id: elementId,
      box,
      title: frame.title,
      style: { ...(frame.color ? { color: frame.color } : {}), ...(frame.padding !== undefined ? { padding: frame.padding } : {}) },
      parent: nearestCreated(frame),
    });
    if (!result.ok) {
      warn(frame, "frame/not-drawn", `The frame "${frame.title}" is not drawn: ${result.message}`);
      continue;
    }
    stored = applyPatch(stored, { ...result.patch, origin: "layout" }); // frames a diagram draws are placed by its layout
    // Tag it so a later update recognises it as the one drawn for this declaration.
    stored = stored.map((el) =>
      el.id === elementId ? ({ ...el, ai: { semanticId: frame.id, generationId, frameId, diagramType: undefined } } as unknown as StoredElement) : el,
    );
    created.set(frame.id, elementId);

    // An explicit box that misses its contents is the author's choice; say so rather than moving anything.
    const content = contentOf(frame);
    if (content && (content.minX < box.minX || content.minY < box.minY || content.maxX > box.maxX || content.maxY > box.maxY)) {
      warn(frame, "frame/contents-outside", `Some of what is inside "${frame.title}" sticks out of the box x/y/w/h give it.`);
    }
  }

  for (const frame of ir.frames) {
    const elementId = created.get(frame.id);
    if (!elementId) continue;
    const members = heldBy.get(frame.id) ?? [];
    if (members.length === 0) continue;
    const result = assignToFrame(stored, elementId, members);
    if (!result.ok) {
      warn(frame, "frame/not-drawn", `The contents of "${frame.title}" were not put inside it: ${result.message}`);
      continue;
    }
    stored = applyPatch(stored, { ...result.patch, origin: "layout" }); // frames a diagram draws are placed by its layout
  }

  return { elements: stored as unknown as DrawingElement[], issues };
};

export const isCodeFrame = (el: DrawingElement): el is FrameShape & DrawingElement => el.type === "frame" && typeof el.ai?.semanticId === "string";
