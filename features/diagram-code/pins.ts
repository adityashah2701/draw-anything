import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import type { NodePin } from "@/features/ai/server/layout/pins";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { documentFromParsedCode, graphFromElements } from "./canvas";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode } from "./serialize";

const MOVED_BY_PX = 2;

const centreOf = (element: DrawingElement) => {
  const xs = element.points.map((p) => p.x);
  const ys = element.points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Nodes the user has positioned by hand. The layout is deterministic, so recompiling the diagram's
 * own graph shows where the engine would put every node; a node whose centre differs is one the
 * user moved. Moving the whole diagram is not a manual choice, so the common shift (the median) is
 * removed first.
 *
 * A board laid out by a different version of the engine looks "all moved" and is pinned as a
 * whole: regenerating it then keeps every position, which is the safe way to be wrong.
 */
export const findMovedNodes = (elements: DrawingElement[]): Map<string, NodePin> => {
  const { graph } = graphFromElements(elements);
  if (graph.nodes.length < 2) return new Map();

  const { document } = documentFromParsedCode(parseDiagramCode(serializeDiagramCode(graph)), "pin-detect");
  const fresh = new Map(
    compileAIDiagramToCanvas(document, "pin-detect")
      .filter((e) => e.ai?.role === "node")
      .map((e) => [e.ai!.semanticId!, centreOf(e)]),
  );

  const current = elements
    .filter((e) => e.points.length >= 2 && !e.isGuide && e.ai?.role !== "group" && ["semantic-node", "rectangle", "circle", "diamond", "triangle"].includes(e.type))
    .map((e) => ({ id: e.ai?.semanticId ?? e.id, at: centreOf(e) }))
    .filter((n) => fresh.has(n.id));

  const dx = median(current.map((n) => n.at.x - fresh.get(n.id)!.x));
  const dy = median(current.map((n) => n.at.y - fresh.get(n.id)!.y));
  const pins = new Map<string, NodePin>();
  for (const n of current) {
    const want = fresh.get(n.id)!;
    if (Math.hypot(n.at.x - want.x - dx, n.at.y - want.y - dy) > MOVED_BY_PX) pins.set(n.id, { ...n.at });
  }
  return pins;
};
