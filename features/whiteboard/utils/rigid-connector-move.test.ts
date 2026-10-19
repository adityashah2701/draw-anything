import { describe, expect, it } from "vitest";
import { createCommandContext } from "@/features/whiteboard/commands/context";
import { planConnectorLabel, planCreateConnector } from "@/features/whiteboard/commands/connectors";
import { planMoveBy } from "@/features/whiteboard/commands/arrange";
import { startDragSession } from "@/features/whiteboard/hooks/interaction/drag-session";
import { rect } from "@/core/groups/test-helpers";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { planShapeMoves, uniformOffsets } from "./move-plan";

let counter = 0;
const ctxOf = (stored: StoredElement[]) => createCommandContext(stored, { newId: () => `id${++counter}` });

const board = (): StoredElement[] => {
  let stored = [rect("a", 0, 0), rect("b", 300, 200), rect("c", 0, 400), rect("far", 900, 900)] as StoredElement[];
  for (const [from, to] of [["a", "b"], ["c", "b"]] as const) {
    const plan = planCreateConnector(ctxOf(stored), { id: `${from}${to}`, from: { id: from }, to: { id: to } });
    if (!("patch" in plan)) throw new Error(JSON.stringify(plan));
    stored = [...stored, ...plan.patch.add];
  }
  const label = planConnectorLabel(ctxOf(stored), "ab", "yes")!;
  return [...stored, ...label.patch.add];
};

const apply = (stored: StoredElement[], changed: readonly DrawingElement[]) => {
  const byId = new Map(changed.map((shape) => [shape.id, shape]));
  return stored.map((item) => byId.get(item.id) ?? item) as StoredElement[];
};
const find = (stored: StoredElement[], id: string) => stored.find((item) => item.id === id)!;
const xy = (shape: StoredElement) => shape.points.map((p) => ({ x: p.x, y: p.y }));
const translated = (shape: StoredElement, dx: number, dy: number) => shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe("moving a diagram carries its connectors rigidly", () => {
  const original = board();
  const diagram = ["a", "b", "c"];

  it("the board starts with routed connectors and a label", () => {
    expect(find(original, "ab").points.length).toBeGreaterThan(2);
    expect(find(original, "ab-label")).toBeDefined();
  });

  for (const selectConnectors of [true, false]) {
    it(`every drag frame is the original path translated (connectors ${selectConnectors ? "selected" : "not selected"})`, () => {
      const ids = selectConnectors ? [...diagram, "ab", "cb", "ab-label"] : diagram;
      const session = startDragSession(ids, original as DrawingElement[], { x: 0, y: 0 }, (shape) => getShapeBounds(shape))!;
      let current = original;
      for (const [dx, dy] of [[5, 7], [12, -3], [60, 40], [0, 0], [-20, 15]]) {
        const changed = planShapeMoves(session.origin, uniformOffsets(session.origin, dx, dy), ctxOf(current).reroute);
        current = apply(original, changed);
        for (const id of ["ab", "cb", "ab-label"]) expect(xy(find(current, id)), `${id} at ${dx},${dy}`).toEqual(translated(find(original, id), dx, dy));
        ;
      }
    });
  }

  it("a nudge of the whole diagram translates the connectors and writes the label once", () => {
    const patch = planMoveBy(ctxOf(original), diagram, 10, 20)!;
    expect(patch.update.filter((shape) => shape.id === "ab-label")).toHaveLength(1);
    const next = apply(original, patch.update as DrawingElement[]);
    for (const id of ["ab", "cb", "ab-label"]) expect(xy(find(next, id))).toEqual(translated(find(original, id), 10, 20));
  });

  it("an end that moves relative to the other is still re-routed and stays attached", () => {
    const session = startDragSession(["a"], original as DrawingElement[], { x: 0, y: 0 }, (shape) => getShapeBounds(shape))!;
    expect(session.origin.map((shape) => shape.id)).toEqual(["a"]);
    const changed = planShapeMoves(session.origin, uniformOffsets(session.origin, 0, 100), ctxOf(original).reroute);
    const next = apply(original, changed);
    const path = find(next, "ab").points;
    expect(path).not.toEqual(translated(find(original, "ab"), 0, 100));
    expect(path[0].y).toBe(find(original, "ab").points[0].y + 100);
    expect(xy(find(next, "ab")).at(-1)).toEqual(xy(find(original, "ab")).at(-1));
    expect(find(next, "cb").points).toEqual(find(original, "cb").points);
  });

  it("a connector to a shape outside the move is not carried along", () => {
    const session = startDragSession(["a", "b"], original as DrawingElement[], { x: 0, y: 0 }, (shape) => getShapeBounds(shape))!;
    expect(session.origin.map((shape) => shape.id).sort()).toEqual(["a", "ab", "ab-label", "b"]);
  });
});
