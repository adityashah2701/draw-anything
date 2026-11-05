import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LiveList, LiveObject } from "@liveblocks/client";
import { beforeAll, describe, expect, it } from "vitest";
import { frame } from "@/core/frames/test-helpers";
import { applyPatch } from "@/core/groups/patch";
import { arrow, group, rect } from "@/core/groups/test-helpers";
import { listLayoutEngines } from "@/core/layout/registry";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { createShape } from "@/core/shapes/shape-runtime";
import { EXAMPLES } from "@/features/ai/diagram-agent/prompt/examples";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { DrawingElementJson } from "@/liveblocks.config";
import { createCommandContext } from "./context";
import { ensureLayoutEngines, planEngineLayout } from "./layout-engine";

beforeAll(() => initializeShapeRegistry());

const shape = (type: string, id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({ ...(createShape(type as never, { id, points: [{ x, y }, { x: x + 140, y: y + 80 }] } as never) as unknown as object), ...extra }) as unknown as DrawingElement;
// A legacy board predates the stamp: what the code draws today is stored without it, as boards saved before were.
const code = (source: string) => elementsFromDiagramCode(source, { generationId: "legacy", frameId: "f" }).elements.map(({ placement: _stamp, ...rest }) => { void _stamp; return rest as DrawingElement; });
const readme = readFileSync(join(process.cwd(), "docs/diagram-code/README.md"), "utf8");
const examples = [...readme.matchAll(/```diagram-code\n([\s\S]*?)```/g)].map((m) => m[1]);

/** Boards as they were saved before any placement stamp or layout record existed: none carries either. */
const LEGACY: Record<string, () => StoredElement[]> = {
  "hand-drawn shapes and connectors": () => [
    shape("rectangle", "r1", 0, 0), shape("ellipse", "e1", 400, 40), shape("diamond", "d1", 800, 0),
    { ...arrow("a1", "r1", "e1", { points: [{ x: 140, y: 40 }, { x: 400, y: 80 }] }) }, arrow("a2", "e1", "d1"),
    { id: "t", type: "text", text: "note", points: [{ x: 50, y: 300 }], color: "#000", strokeWidth: 1, fontSize: 20 } as DrawingElement,
    { id: "f", type: "freehand", points: [{ x: 500, y: 300 }, { x: 540, y: 340 }, { x: 600, y: 310 }], color: "#000", strokeWidth: 3 } as DrawingElement,
  ],
  "locked shapes and a locked group": () => [rect("l1", 0, 0, 100, 60, { locked: true }), rect("l2", 300, 0), rect("l3", 600, 0), group("lg", { locked: true }), { ...rect("l4", 0, 300), groupId: "lg" } as DrawingElement, { ...rect("l5", 300, 300), groupId: "lg" } as DrawingElement, arrow("la", "l1", "l2")],
  "nested groups and frames with children": () => [frame("fr", -50, -50, 900, 500), { ...rect("c1", 0, 0), frameId: "fr" } as DrawingElement, { ...rect("c2", 300, 0), frameId: "fr", groupId: "g2" } as DrawingElement, { ...rect("c3", 600, 0), frameId: "fr", groupId: "g2" } as DrawingElement, group("g1"), group("g2", { groupId: "g1" }), arrow("fa", "c1", "c2", { frameId: "fr" })],
  "outline, icon, semantic and parametric shapes": () => [
    shape("outline", "o1", 0, 0, { variant: "cylinder" }), shape("outline", "o2", 300, 0, { variant: "ring", border: "double", marker: "clock" }), shape("semantic-node", "s1", 600, 0, { label: "Svc" }),
    shape("icon", "i1", 900, 0, { ai: { icon: "server" } }), arrow("oa", "o1", "o2", { relation: { kind: "composition", start: { multiplicity: "1" }, end: { multiplicity: "0..*" } } } as never),
  ],
  "a manually bent connector": () => [rect("m1", 0, 0), rect("m2", 500, 300), arrow("mb", "m1", "m2", { points: [{ x: 100, y: 30 }, { x: 250, y: 30 }, { x: 250, y: 330 }, { x: 500, y: 330 }], isManuallyRouted: true } as never)],
  ...Object.fromEntries(examples.map((c, i) => [`documented example ${i + 1}`, () => code(c)])),
  ...Object.fromEntries(EXAMPLES.map((e, i) => [`prompt example ${i + 1}`, () => code(e.code)])),
};

const ctxOf = (stored: StoredElement[]) => createCommandContext(stored, { newId: () => "n" });

describe("legacy boards are never moved by an automatic layout", () => {
  ensureLayoutEngines();
  const engines = listLayoutEngines().map((e) => e.id);

  it("knows the engines it must test", () => {
    expect(engines).toEqual(expect.arrayContaining(["architecture", "freeform"]));
  });

  for (const [name, build] of Object.entries(LEGACY)) {
    it(`${name}: preserve and adjust, in every engine, move nothing and create no record`, () => {
      const board = build();
      expect(board.filter((e) => "placement" in e || e.type === "layout").map((e) => `${e.id}:${e.type}:${String((e as { placement?: unknown }).placement)}`)).toEqual([]);
      for (const engine of engines) {
        for (const mode of ["preserve", "adjust"] as const) {
          const plan = planEngineLayout(ctxOf(board), { mode, engine, remember: false });
          expect(plan.preview.moves, `${engine} ${mode}`).toEqual([]);
          expect(plan.patch, `${engine} ${mode}`).toBeNull();
          expect(applyPatch(board, plan.patch ?? { add: [], update: [], remove: [] })).toEqual(board);
        }
      }
    });

    it(`${name}: overwrite moves a locked element never, and asks first about the rest`, () => {
      const board = build();
      const plan = planEngineLayout(ctxOf(board), { mode: "overwrite", engine: "architecture", confirm: true });
      const after = applyPatch(board, plan.patch ?? { add: [], update: [], remove: [] });
      for (const item of board as DrawingElement[]) {
        const locked = item.locked === true || (item.groupId && (board.find((g) => g.id === item.groupId) as { locked?: boolean } | undefined)?.locked === true);
        if (locked) expect(JSON.stringify((after.find((e) => e.id === item.id) as DrawingElement).points), item.id).toBe(JSON.stringify(item.points));
      }
    });

    it(`${name}: seeding a room from the saved snapshot and reading it back changes nothing`, () => {
      const board = build();
      const saved = parseSavedContent(JSON.stringify({ elements: board }));
      expect(saved.status).toBe("ok");
      const list = new LiveList<LiveObject<DrawingElementJson>>([]);
      // The seeding step of the editor: it writes what was saved and stamps nothing.
      (saved as unknown as { elements: DrawingElementJson[] }).elements.forEach((el) => list.push(new LiveObject(el)));
      expect(JSON.parse(JSON.stringify(list.toImmutable()))).toEqual(JSON.parse(JSON.stringify(board)));
    });
  }
});
