import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { find, node, setup } from "../test-helpers";

/** Every tool that changes a position or a size, run through the executor and the storage rule: the person's request, so `user`. */
const board = () => [
  node("a", "A", 0, 0, { placement: "auto" }),
  node("b", "B", 250, 40, { placement: "auto" }),
  node("c", "C", 800, 0, { placement: "auto" }),
];
const stampOf = (s: ReturnType<typeof setup>, id: string) => find<DrawingElement>(s.mem.stored, id).placement;

const MOVES: Array<[string, Record<string, unknown>, string[]]> = [
  ["move_elements", { ids: ["a"], dx: 50, dy: 0 }, ["a"]],
  ["resize_element", { ids: ["b"], width: 260 }, ["b"]],
  ["align_elements", { ids: ["a", "b", "c"], mode: "top" }, ["b"]],
  ["distribute_elements", { ids: ["a", "b", "c"], axis: "horizontal" }, ["b"]],
  ["auto_layout", { algorithm: "row" }, ["a", "b", "c"]],
];

describe("every position change stamps who made it", () => {
  for (const [tool, args, movedIds] of MOVES) {
    it(`${tool}: what moved is user, what did not keeps its stamp`, async () => {
      const s = setup({ elements: board() });
      const before = JSON.stringify(s.mem.stored.map((e) => [e.id, (e as DrawingElement).points]));
      const result = await s.run(tool, args);
      expect(result.ok, `${tool} ${JSON.stringify(result.error)}`).toBe(true);
      const after = s.mem.stored.map((e) => [e.id, (e as DrawingElement).points]);
      const changed = after.filter(([, points], i) => JSON.stringify(points) !== JSON.stringify((JSON.parse(before) as unknown[][])[i][1])).map(([id]) => id as string);
      expect(changed.length, `${tool} moved nothing`).toBeGreaterThan(0);
      for (const id of ["a", "b", "c"]) expect(stampOf(s, id), `${tool} ${id}`).toBe(changed.includes(id) ? "user" : "auto");
      void movedIds;
    });
  }

  it("a change that leaves the geometry alone leaves the stamp alone", async () => {
    const s = setup({ elements: board() });
    await s.ok("update_semantic_node", { ids: ["a"], label: "Renamed" }).catch(() => s.ok("update_text", { ids: ["a"], text: "x" }).catch(() => undefined));
    await s.ok("update_shape_style", { ids: ["a"], color: "#dc2626" }).catch(() => undefined);
    expect(stampOf(s, "a")).toBe("auto");
  });
});
