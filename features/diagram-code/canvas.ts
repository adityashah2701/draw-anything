import { buildAIDiagramDocument } from "@/features/ai/server/validation";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import {
  normalizeModelGraphDraftDetailed,
  normalizeModelPlan,
} from "@/features/ai/schemas";
import type { AIDiagramType, AIModelProvider } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { parseDiagramCode } from "./parse";
import type { SerializableGraph } from "./serialize";
import type { NodePin } from "@/features/ai/server/layout/pins";
import type { DiagramCodeIssue } from "./types";

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
    nodes: parsed.nodes.map((node) => ({ id: node.id, label: node.label, kind: node.kind ?? node.icon, icon: node.icon, shape: node.shape, color: node.color })),
    edges: parsed.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      dashed: edge.dashed,
      bidirectional: edge.bidirectional,
      plain: edge.plain,
      color: edge.color,
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

  return { elements: compileAIDiagramToCanvas(document, frameId, { pins }), issues };
};

// ── canvas -> code ──────────────────────────────────────────────────────────

const NODE_TYPES = new Set(["semantic-node", "rectangle", "circle", "diamond", "pill", "triangle"]);

const boundsOf = (element: DrawingElement) => ({
  minX: Math.min(...element.points.map((p) => p.x)),
  maxX: Math.max(...element.points.map((p) => p.x)),
  minY: Math.min(...element.points.map((p) => p.y)),
  maxY: Math.max(...element.points.map((p) => p.y)),
});

export interface GraphFromElements {
  graph: SerializableGraph;
  /** Elements the graph was built from; replacing them replaces the diagram. */
  consumedIds: string[];
}

/**
 * Read a diagram off the canvas: labelled shapes are nodes, arrows attached to
 * two of them are connections, and generated group frames become groups.
 * Anything else (notes, drawings, dangling arrows) is ignored and left alone.
 */
export const graphFromElements = (elements: DrawingElement[]): GraphFromElements => {
  const consumed = new Set<string>();
  const nodeElements = elements.filter(
    (el) =>
      NODE_TYPES.has(el.type) &&
      !el.isGuide &&
      el.ai?.role !== "group" &&
      el.points.length >= 2,
  );

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
      shape: el.type === "diamond" || el.type === "pill" ? el.type : undefined,
    };
  });

  const labelFor = (suffixOf: string) =>
    elements.find((el) => el.ai?.role === "edge-label" && el.ai.semanticId === `${suffixOf}-label`);

  const edges: SerializableGraph["edges"] = [];
  for (const el of elements) {
    if (el.type !== "arrow" && el.type !== "arrow-bidirectional") continue;
    const arrow = el as DrawingElement & {
      startConnection?: { elementId: string };
      endConnection?: { elementId: string };
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
    });
    consumed.add(el.id);
    if (label) consumed.add(label.id);
  }

  const groups: SerializableGraph["groups"] = [];
  for (const frame of elements.filter((el) => el.ai?.role === "group" && el.points.length >= 2)) {
    const box = boundsOf(frame);
    const members = nodeElements
      .filter((el) => {
        const b = boundsOf(el);
        return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;
      })
      .map((el) => idOfElement.get(el.id)!);
    if (members.length < 2) continue;
    const title = elements.find(
      (el) => el.ai?.role === "group-label" && el.ai.semanticId === frame.ai?.semanticId,
    );
    groups.push({
      id: frame.ai?.semanticId ?? frame.id,
      label: title?.text?.trim() || "Group",
      nodeIds: members,
    });
    consumed.add(frame.id);
    if (title) consumed.add(title.id);
  }

  const types = nodeElements
    .map((el) => el.ai?.diagramType)
    .filter((type): type is string => Boolean(type));
  const diagramType = types.length > 0 ? (types[0] as AIDiagramType) : undefined;

  return { graph: { diagramType, nodes, edges, groups }, consumedIds: [...consumed] };
};
