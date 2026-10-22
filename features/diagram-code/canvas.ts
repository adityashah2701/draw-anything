import { buildAIDiagramDocument } from "@/features/ai/server/validation";
import { compileAIDiagramToCanvas, kindColors } from "@/features/ai/server/canvas-compiler";
import {
  normalizeModelGraphDraftDetailed,
  normalizeModelPlan,
} from "@/features/ai/schemas";
import type { AIDiagramType, AIModelProvider } from "@/features/ai/types";
import { isOutlineVariantId } from "@/core/shapes/outline/variants";
import type { DrawingElement, FrameShape } from "@/features/whiteboard/types/whiteboard.types";
import { tint } from "@/core/color/named-colors";
import { parseAnchorSide } from "@/core/anchors/generate-anchors";
import { drawFrames } from "./frames";
import { compileDiagramCode } from "./language/compile";
import { parseDiagramCode } from "./parse";
import type { SerializableGraph } from "./serialize";
import type { NodePin } from "@/features/ai/server/layout/pins";
import type { DiagramCodeIssue } from "./types";

/** The colour a frame has unless one is chosen. */
const DEFAULT_FRAME_COLOR = "#64748b";

type FrameElement = FrameShape;

export interface CodeToCanvasResult {
  elements: DrawingElement[];
  issues: DiagramCodeIssue[];
}


export const documentFromParsedCode = (
  parsed: ReturnType<typeof parseDiagramCode>,
  generationId: string,
  /** Who produced the diagram, when it is not hand-written code. */
  meta: { prompt?: string; provider?: AIModelProvider; modelName?: string } = {},
) => {
  const { graph, warnings } = normalizeModelGraphDraftDetailed({
    nodes: parsed.nodes.map((node) => ({ id: node.id, label: node.label, kind: node.kind ?? node.icon, icon: node.icon, shape: node.shape, color: node.color, x: node.x, y: node.y, width: node.width, height: node.height })),
    edges: parsed.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      dashed: edge.dashed,
      bidirectional: edge.bidirectional,
      plain: edge.plain,
      color: edge.color,
      fromSide: edge.fromSide,
      toSide: edge.toSide,
    })),
    groups: parsed.groups.map((group) => ({ id: group.id, label: group.label, nodeIds: group.nodeIds })),
  });
  const document = buildAIDiagramDocument({
    prompt: meta.prompt ?? "diagram code",
    plan: normalizeModelPlan({
      diagramType: parsed.diagramType ?? "flowchart",
      summary: parsed.title ?? "Diagram from code",
    }),
    graph,
    provider: meta.provider ?? "local",
    modelName: meta.modelName ?? "diagram-code",
    generationId,
    improvementPasses: 0,
  });
  return { document, warnings };
};

/**
 * Diagram code -> canvas elements, using the same document builder and
 * compiler as AI generation, so code and AI produce identical-looking output.
 * Nothing is drawn if the code has errors (a half-applied edit is worse than none).
 */
export const elementsFromDiagramCode = (
  source: string,
  {
    generationId,
    frameId,
    pins,
  }: {
    generationId: string;
    frameId: string;
    /** Nodes (by id) that must keep their centre; see `findMovedNodes`. */
    pins?: Map<string, NodePin>;
  },
): CodeToCanvasResult => {
  const parsed = parseDiagramCode(source);
  const issues = [...parsed.issues];
  if (issues.some((issue) => issue.severity === "error")) return { elements: [], issues };
  if (parsed.nodes.length === 0) {
    return {
      elements: [],
      issues: [...issues, { line: 1, severity: "error", message: "There is nothing to draw yet: add at least one node." }],
    };
  }

  const { document, warnings } = documentFromParsedCode(parsed, generationId);
  warnings.forEach((message) => issues.push({ line: 1, severity: "warning", message }));

  const compiled = compileAIDiagramToCanvas(document, frameId, { pins });
  if (parsed.frames.length === 0) return { elements: compiled, issues };
  const framed = drawFrames(compileDiagramCode(source).ir, compiled, { source, generationId, frameId });
  return { elements: framed.elements, issues: [...issues, ...framed.issues] };
};

// ── canvas -> code ──────────────────────────────────────────────────────────

const NODE_TYPES = new Set(["semantic-node", "rectangle", "circle", "ellipse", "diamond", "pill", "triangle", "icon", "outline"]);

/** An icon the user inserted by hand is not a diagram node; only the ones a diagram generated are. */
const isDiagramNode = (el: DrawingElement) => NODE_TYPES.has(el.type) && (el.type !== "icon" || el.ai?.role === "node");

/** The `shape:` an element is written with. An outline whose variant is unknown reads back as a plain box. */
const shapeOfElement = (el: DrawingElement): string | undefined =>
  el.type === "diamond" || el.type === "pill" || el.type === "icon" ? el.type : el.type === "outline" && isOutlineVariantId(el.variant) ? el.variant : undefined;

const boundsOf = (element: DrawingElement) => ({
  minX: Math.min(...element.points.map((p) => p.x)),
  maxX: Math.max(...element.points.map((p) => p.x)),
  minY: Math.min(...element.points.map((p) => p.y)),
  maxY: Math.max(...element.points.map((p) => p.y)),
});

/**
 * The explicit colour a node was given in code. The compiler draws `color:` as a stroke plus a fill that
 * is exactly `tint(color, 0.88)`; kind and default colours use hand-picked fills, so that pair is the
 * signature of a custom colour and nothing else needs to be remembered.
 */
/** Where a node is and how big, in whole canvas units. */
const layoutOf = (el: DrawingElement) => {
  const b = boundsOf(el);
  return { x: Math.round(b.minX), y: Math.round(b.minY), width: Math.round(b.maxX - b.minX), height: Math.round(b.maxY - b.minY) };
};

/** An explicit line colour: not the black (white in the dark theme) the agent draws, nor the tool's default grey. */
const customEdgeColor = (el: DrawingElement): string | undefined =>
  el.color && /^#[0-9a-f]{6}$/i.test(el.color) && !["#000000", "#ffffff", "#475569"].includes(el.color.toLowerCase()) ? el.color.toLowerCase() : undefined;

/** The sides a connection leaves and enters by, from its anchors; swapped back when the arrow was drawn reversed. */
const sidesOf = (arrow: { startConnection?: { anchorId?: string }; endConnection?: { anchorId?: string } }, reversed: boolean) => {
  const start = arrow.startConnection?.anchorId ? parseAnchorSide(arrow.startConnection.anchorId) : undefined;
  const end = arrow.endConnection?.anchorId ? parseAnchorSide(arrow.endConnection.anchorId) : undefined;
  return reversed ? { fromSide: end ?? undefined, toSide: start ?? undefined } : { fromSide: start ?? undefined, toSide: end ?? undefined };
};

const customColorOf = (el: DrawingElement): string | undefined => {
  if (!el.fill || !el.color || !/^#[0-9a-f]{6}$/i.test(el.color) || el.fill !== tint(el.color, 0.88)) return undefined;
  const byKind = kindColors(el.ai?.semanticKind);
  // A kind's own colours are not a choice the user made, even when they happen to fit the signature.
  return byKind && byKind.stroke.toLowerCase() === el.color.toLowerCase() ? undefined : el.color.toLowerCase();
};

/** Which canvas elements each part of the graph came from, so a later update can keep them. */
export interface GraphProvenance {
  /** Graph node id to the element drawn for it. */
  nodes: Map<string, string>;
  /** Aligned with `graph.edges`: the arrow, and its label element when it has one. */
  edges: Array<{ arrowId: string; labelId?: string }>;
  /** Aligned with `graph.groups`: the frame rectangle and its title. */
  groups: Array<{ frameId: string; titleId?: string }>;
  /** Graph frame id to the frame element it was read from. */
  frames: Map<string, string>;
}

export interface GraphFromElements {
  graph: SerializableGraph;
  /** Elements the graph was built from; replacing them replaces the diagram. */
  consumedIds: string[];
  provenance: GraphProvenance;
}

/**
 * Read a diagram off the canvas: labelled shapes are nodes, arrows attached to
 * two of them are connections, and generated group frames become groups.
 * Anything else (notes, drawings, dangling arrows) is ignored and left alone.
 */
export const graphFromElements = (
  elements: DrawingElement[],
  { layout = false }: {
    /** Also write where each node is and how big, and which sides the connections use. */
    layout?: boolean;
  } = {},
): GraphFromElements => {
  const consumed = new Set<string>();
  const nodeElements = elements.filter(
    (el) =>
      isDiagramNode(el) &&
      !el.isGuide &&
      el.ai?.role !== "group" &&
      el.points.length >= 2,
  );

  // With positions the code reads top to bottom, left to right, like the picture.
  if (layout) nodeElements.sort((a, b) => boundsOf(a).minY - boundsOf(b).minY || boundsOf(a).minX - boundsOf(b).minX);

  let unlabeled = 0;
  const idOfElement = new Map<string, string>();
  const nodes = nodeElements.map((el) => {
    const id = el.ai?.semanticId ?? el.id;
    idOfElement.set(el.id, id);
    consumed.add(el.id);
    return {
      id,
      label: el.label?.trim() || el.text?.trim() || `Shape ${(unlabeled += 1)}`,
      kind: el.ai?.semanticKind ?? (el.type === "diamond" ? "decision" : undefined),
      icon: el.ai?.icon,
      shape: shapeOfElement(el),
      color: customColorOf(el),
      ...(layout ? layoutOf(el) : {}),
    };
  });

  const labelFor = (suffixOf: string) =>
    elements.find((el) => el.ai?.role === "edge-label" && el.ai.semanticId === `${suffixOf}-label`);

  const edges: SerializableGraph["edges"] = [];
  const edgeSources: GraphProvenance["edges"] = [];
  for (const el of elements) {
    if (el.type !== "arrow" && el.type !== "arrow-bidirectional") continue;
    const arrow = el as DrawingElement & {
      startConnection?: { elementId: string; anchorId?: string };
      endConnection?: { elementId: string; anchorId?: string };
      arrowHeadStart?: boolean;
      arrowHeadEnd?: boolean;
      dashed?: boolean;
    };
    const start = arrow.startConnection && idOfElement.get(arrow.startConnection.elementId);
    const end = arrow.endConnection && idOfElement.get(arrow.endConnection.elementId);
    if (!start || !end || start === end) continue;

    const both = el.type === "arrow-bidirectional" || (arrow.arrowHeadStart && arrow.arrowHeadEnd);
    const reversed = !both && arrow.arrowHeadStart && !arrow.arrowHeadEnd;
    const label = labelFor(el.ai?.semanticId ?? el.id);
    edges.push({
      from: reversed ? end : start,
      to: reversed ? start : end,
      label: label?.text,
      dashed: arrow.dashed || undefined,
      bidirectional: both ? true : undefined,
      plain: arrow.arrowHeadEnd === false && !arrow.arrowHeadStart ? true : undefined,
      color: customEdgeColor(el),
      ...(layout ? sidesOf(arrow, Boolean(reversed)) : {}),
    });
    edgeSources.push({ arrowId: el.id, labelId: label?.id });
    consumed.add(el.id);
    if (label) consumed.add(label.id);
  }

  // Frames: ownership is the element's own `frameId`, so a node belongs to every frame above it.
  const frameElements = elements.filter((el): el is FrameElement => el.type === "frame" && el.points.length >= 2);
  const frameElementById = new Map(frameElements.map((el) => [el.id, el]));
  const framesAbove = (start: string | undefined): string[] => {
    const chain: string[] = [];
    for (let at = start, guard = 0; at && frameElementById.has(at) && !chain.includes(at) && guard < 100; guard += 1) {
      chain.push(at);
      at = frameElementById.get(at)!.frameId;
    }
    return chain;
  };
  const framedNodes = new Map<string, string[]>(); // frame element id -> graph node ids
  const innermostFrameOf = new Map<string, string | undefined>(); // graph node id -> frame element id
  for (const el of nodeElements) {
    const chain = framesAbove(el.frameId);
    innermostFrameOf.set(idOfElement.get(el.id)!, chain[0]);
    for (const frame of chain) framedNodes.set(frame, [...(framedNodes.get(frame) ?? []), idOfElement.get(el.id)!]);
  }
  const graphFrames: NonNullable<SerializableGraph["frames"]> = [];
  const frameSources = new Map<string, string>();
  const graphIdOfFrame = (el: FrameElement) => el.ai?.semanticId ?? el.id;
  for (const el of frameElements) {
    const members = framedNodes.get(el.id);
    if (!members || members.length === 0) continue;
    const box = boundsOf(el);
    graphFrames.push({
      id: graphIdOfFrame(el),
      title: el.title?.trim() || "Frame",
      parentId: el.frameId && frameElementById.has(el.frameId) ? graphIdOfFrame(frameElementById.get(el.frameId)!) : undefined,
      nodeIds: members,
      ...(layout ? { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY } : {}),
      padding: el.padding,
      color: el.color && /^#[0-9a-f]{6}$/i.test(el.color) && el.color.toLowerCase() !== DEFAULT_FRAME_COLOR ? el.color.toLowerCase() : undefined,
    });
    frameSources.set(graphIdOfFrame(el), el.id);
    consumed.add(el.id);
  }

  const groups: SerializableGraph["groups"] = [];
  const groupSources: GraphProvenance["groups"] = [];
  for (const frame of elements.filter((el) => el.ai?.role === "group" && el.points.length >= 2)) {
    const box = boundsOf(frame);
    const members = nodeElements
      .filter((el) => {
        const b = boundsOf(el);
        return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;
      })
      .map((el) => idOfElement.get(el.id)!);
    if (members.length < 2) continue;
    // A group cannot span frames, so one that does is left on the board as it is.
    const nodeIdOfGraph = new Map([...idOfElement].map(([elementId, graphId]) => [graphId, elementId]));
    if (new Set(members.map((id) => innermostFrameOf.get(id))).size > 1 && nodeIdOfGraph.size > 0) continue;
    const title = elements.find(
      (el) => el.ai?.role === "group-label" && el.ai.semanticId === frame.ai?.semanticId,
    );
    groups.push({
      id: frame.ai?.semanticId ?? frame.id,
      label: title?.text?.trim() || "Group",
      nodeIds: members,
    });
    groupSources.push({ frameId: frame.id, titleId: title?.id });
    consumed.add(frame.id);
    if (title) consumed.add(title.id);
  }

  const types = nodeElements
    .map((el) => el.ai?.diagramType)
    .filter((type): type is string => Boolean(type));
  const diagramType = types.length > 0 ? (types[0] as AIDiagramType) : undefined;

  const nodeSources = new Map<string, string>();
  for (const el of nodeElements) nodeSources.set(idOfElement.get(el.id)!, el.id);

  return {
    graph: { diagramType, nodes, edges, groups, frames: graphFrames },
    consumedIds: [...consumed],
    provenance: { nodes: nodeSources, edges: edgeSources, groups: groupSources, frames: frameSources },
  };
};
