import { graphFromElements } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { lintDiagram } from "@/features/ai/diagram-agent/tools/lint";
import { measureLayout } from "@/features/ai/server/layout/metrics";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

/** Lint rules that are faults of the drawing (the agent must fix them before it finishes); the rest are advice. */
const BLOCKING_RULE = /^(family-shapes|er-|sequence-|class-|hld-|flow-|structure-no-frames)/;

export interface BoardReport {
  /** The diagram as code, names as written: what the agent sees of the board. */
  code: string;
  nodes: number;
  /** Faults: overlapping nodes, connectors through nodes, broken rules of the diagram family. `finish` is refused while any remain. */
  blocking: string[];
  /** Worth improving but never a reason to keep working: crossings, long lines, label clutter, loose structure. */
  advice: string[];
}

/**
 * Reads the diagram on the board the way a reviewer would: what it says (as diagram code and its family rules) and
 * what the picture does (overlaps, connectors through nodes, crossings). Pure; nothing is recompiled or moved.
 */
export const reportBoard = (shapes: readonly DrawingElement[]): BoardReport => {
  const { graph } = graphFromElements(shapes as DrawingElement[]);
  const code = graph.nodes.length > 0 ? serializeDiagramCode(graph) : "";
  if (!code) return { code: "", nodes: 0, blocking: [], advice: [] };
  const parsed = parseDiagramCode(code);
  const m = measureLayout(shapes as DrawingElement[], []);
  const findings = lintDiagram(parsed, m);
  const blocking = [
    ...(m.nodeOverlaps > 0 ? [`${m.nodeOverlaps} pair(s) of nodes overlap: move one of each pair, or let the layout place them (adjust_diagram: reset).`] : []),
    ...(m.edgeThroughNodes > 0 ? [`${m.edgeThroughNodes} connector(s) pass through a node: change their sides (adjust_diagram: sides A > B: right, left) or move a node.`] : []),
    ...findings.filter((f) => BLOCKING_RULE.test(f.rule)).map((f) => f.advice),
  ];
  const advice = [
    ...(m.edgeCrossings > 0 ? [`${m.edgeCrossings} crossing(s).`] : []),
    ...(m.labelsColliding > 0 ? [`${m.labelsColliding} connection label(s) collide with something.`] : []),
    ...findings.filter((f) => !BLOCKING_RULE.test(f.rule)).map((f) => f.advice),
  ];
  return { code, nodes: graph.nodes.length, blocking, advice: advice.slice(0, 8) };
};
