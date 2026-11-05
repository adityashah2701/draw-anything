import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { EXAMPLES } from "@/features/ai/diagram-agent/prompt/examples";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import * as baseline from "../../tests/browser/baseline-fixtures";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const LEGACY_EXAMPLE_COUNT = 3;

/**
 * Every diagram source that exists today, compiled the way the app compiles it. The goldens captured from this
 * BEFORE the layout foundations existed (`__fixtures__/legacy-corpus.golden.json`) prove that nothing in the
 * foundations changes where an existing drawing puts a node or a connector.
 */
export interface CorpusItem {
  name: string;
  elements: DrawingElement[];
}

const readme = readFileSync(join(process.cwd(), "docs/diagram-code/README.md"), "utf8");
const examples = [...readme.matchAll(/```diagram-code\n([\s\S]*?)```/g)].map((match) => match[1]);

export const legacyCorpus = (): CorpusItem[] => [
  ...Object.entries(LAYOUT_FIXTURES).map(([name, document]) => ({ name: `layout:${name}`, elements: compileAIDiagramToCanvas(document, "frame") })),
  ...baseline.BASELINE_NAMES.map((name) => ({ name: `baseline:${name}`, elements: compileAIDiagramToCanvas((baseline as unknown as Record<string, never>)[name], "frame") })),
  ...examples.map((code, i) => ({ name: `readme:${i + 1}`, elements: elementsFromDiagramCode(code, { generationId: "corpus", frameId: "corpus" }).elements })),
  // Only the examples that existed before the layout foundations; later ones (ER, sequence, class) have no legacy drawing to protect.
  ...EXAMPLES.slice(0, LEGACY_EXAMPLE_COUNT).map((example, i) => ({ name: `prompt:${i + 1}`, elements: elementsFromDiagramCode(example.code, { generationId: "corpus", frameId: "corpus" }).elements })),
];

const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** The part of a drawing the foundations must not change: which elements exist, their types, and every point. */
export const summarize = (elements: readonly DrawingElement[]) =>
  elements.map((element) => ({ id: element.id, type: element.type, points: element.points.map((p) => [round(p.x), round(p.y)]) }));
