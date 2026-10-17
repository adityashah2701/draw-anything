import { compileAIDiagramDetailed, type CompileResult } from "@/features/ai/server/canvas-compiler";
import type { AIDiagramDocumentV1 } from "@/features/ai/types";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { BuilderState } from "./state";

export interface BuiltCanvas {
  /** Every element, shifted so the diagram's top-left corner is (0, 0). */
  elements: DrawingElement[];
  document: AIDiagramDocumentV1;
  diagnostics: CompileResult["diagnostics"];
  /** Node centres by diagram node id, in the same shifted space as `elements`. */
  centres: Map<string, { x: number; y: number }>;
}

const shiftTo = (elements: DrawingElement[]): DrawingElement[] => {
  let minX = Infinity;
  let minY = Infinity;
  for (const element of elements) {
    for (const p of element.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return elements;
  return elements.map((element) => ({ ...element, points: element.points.map((p) => ({ x: p.x - minX, y: p.y - minY })) }));
};

/**
 * Lays the current state out. The result is anchored at its top-left corner, not its centre: the layout
 * is centred on a fixed point, so a diagram that keeps growing would otherwise slide off the left of
 * the viewport the client anchored it in.
 */
export const buildCanvas = (state: BuilderState, generationId: string, frameId: string): BuiltCanvas | null => {
  if (state.parsed.nodes.length === 0) return null;
  const { document } = documentFromParsedCode(state.parsed, generationId);
  const compiled = compileAIDiagramDetailed(document, frameId, { offsets: state.offsets, edgeSides: state.edgeSides });
  const elements = shiftTo(compiled.elements);
  const centres = new Map<string, { x: number; y: number }>();
  for (const element of elements) {
    if (element.ai?.role !== "node" || !element.ai.semanticId || element.points.length < 2) continue;
    const [a, b] = element.points;
    centres.set(element.ai.semanticId, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return { elements, document, diagnostics: compiled.diagnostics, centres };
};

export interface CanvasDiff {
  added: DrawingElement[];
  updated: DrawingElement[];
  removedIds: string[];
}

/** What the client must do to go from what it has drawn (`drawn`: id to a signature) to `next`. */
export const diffElements = (drawn: Map<string, string>, next: DrawingElement[]): CanvasDiff & { signatures: Map<string, string> } => {
  const signatures = new Map<string, string>();
  const added: DrawingElement[] = [];
  const updated: DrawingElement[] = [];
  for (const element of next) {
    const signature = JSON.stringify(element);
    signatures.set(element.id, signature);
    const before = drawn.get(element.id);
    if (before === undefined) added.push(element);
    else if (before !== signature) updated.push(element);
  }
  const removedIds = [...drawn.keys()].filter((id) => !signatures.has(id));
  return { added, updated, removedIds, signatures };
};
