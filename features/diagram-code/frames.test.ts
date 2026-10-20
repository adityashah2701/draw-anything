import { describe, expect, it } from "vitest";
import { frameBox } from "@/core/frames/frame-model";
import { buildFrameIndex } from "@/core/frames/frame-index";
import type { DrawingElement, FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { canvasDrift, loadFromCanvas, planApply, type ApplyPlan } from "./apply";
import { elementsFromDiagramCode } from "./canvas";
import { compileDiagramCode } from "./language/compile";
import { serializeDiagramCode } from "./serialize";

const applyPlan = (canvas: DrawingElement[], plan: ApplyPlan): DrawingElement[] => {
  const gone = new Set(plan.patch.remove);
  const updates = new Map(plan.patch.update.map((el) => [el.id, el]));
  return [...canvas.filter((el) => !gone.has(el.id)).map((el) => updates.get(el.id) ?? el), ...plan.patch.add];
};
const ready = (outcome: ReturnType<typeof planApply>) => {
  expect(outcome.status).toBe("ready");
  return (outcome as Extract<typeof outcome, { status: "ready" }>).plan;
};
const draw = (code: string) => {
  const plan = ready(planApply({ code, canvas: [], generationId: "g1" }));
  return { canvas: applyPlan([], plan), sync: plan.sync };
};
const draft = (code: string) => elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
const node = (elements: DrawingElement[], id: string) => elements.find((el) => el.ai?.role === "node" && el.ai.semanticId === id)!;
const frames = (elements: DrawingElement[]) => elements.filter((el): el is FrameShape & DrawingElement => el.type === "frame");
const inside = (box: { minX: number; minY: number; maxX: number; maxY: number }, el: DrawingElement) => {
  const xs = el.points.map((p) => p.x);
  const ys = el.points.map((p) => p.y);
  return Math.min(...xs) >= box.minX && Math.max(...xs) <= box.maxX && Math.min(...ys) >= box.minY && Math.max(...ys) <= box.maxY;
};

const EDGE = `frame Edge {
  Web
  API
}
DB
Web > API
API > DB
`;

describe("drawing frames from code", () => {
  it("creates a frame element around its members and gives them its id as their frame", () => {
    const { elements, issues } = draft(EDGE);
    expect(issues).toEqual([]);
    const [frame] = frames(elements);
    expect(frame.title).toBe("Edge");
    for (const id of ["web", "api"]) {
      expect(node(elements, id).frameId).toBe(frame.id);
      expect(inside(frameBox(frame)!, node(elements, id))).toBe(true);
    }
    expect(node(elements, "db").frameId).toBeUndefined();
  });

  it("keeps a connection between two members in the frame and one that leaves it at the top level", () => {
    const { elements } = draft(EDGE);
    const [frame] = frames(elements);
    const arrows = elements.filter((el) => el.ai?.role === "edge");
    const inner = arrows.find((el) => (el as { endConnection?: { elementId: string } }).endConnection?.elementId === node(elements, "api").id)!;
    const outer = arrows.find((el) => (el as { endConnection?: { elementId: string } }).endConnection?.elementId === node(elements, "db").id)!;
    expect(inner.frameId).toBe(frame.id);
    expect(outer.frameId).toBeUndefined();
  });

  it("nests frames and wraps the inner box inside the outer one", () => {
    const { elements, issues } = draft("frame Cloud {\n  frame Edge {\n    Web\n  }\n  API\n}\nWeb > API");
    expect(issues).toEqual([]);
    const cloud = frames(elements).find((f) => f.title === "Cloud")!;
    const edge = frames(elements).find((f) => f.title === "Edge")!;
    expect(edge.frameId).toBe(cloud.id);
    expect(node(elements, "web").frameId).toBe(edge.id);
    expect(node(elements, "api").frameId).toBe(cloud.id);
    const index = buildFrameIndex(elements as unknown as StoredElement[]);
    expect(index.depthOf.get(edge.id)).toBe(1);
    const box = frameBox(cloud)!;
    expect(frameBox(edge)!.minX).toBeGreaterThanOrEqual(box.minX);
    expect(frameBox(edge)!.maxY).toBeLessThanOrEqual(box.maxY);
  });

  it("puts a group inside a frame, with its label", () => {
    const { elements, issues } = draft("frame Edge {\n  group Services {\n    A\n    B\n  }\n}\nA > B");
    expect(issues).toEqual([]);
    const [frame] = frames(elements);
    const group = elements.find((el) => el.ai?.role === "group")!;
    const label = elements.find((el) => el.ai?.role === "group-label")!;
    expect(group.frameId).toBe(frame.id);
    expect(label.frameId).toBe(frame.id);
    expect(node(elements, "a").frameId).toBe(frame.id);
  });

  it("uses the box the code gives and warns when contents stick out of it", () => {
    const { elements, issues } = draft("frame Tiny [x: 0, y: 0, w: 90, h: 70] {\n  A\n  B\n}\nA > B");
    const [frame] = frames(elements);
    const box = frameBox(frame)!;
    expect([box.minX, box.minY, box.maxX, box.maxY]).toEqual([0, 0, 90, 70]);
    expect(issues).toEqual([expect.objectContaining({ code: "frame/contents-outside", severity: "warning", line: 1 })]);
  });

  it("applies colour, padding and the label as the title", () => {
    const { elements } = draft('frame Edge [color: red, padding: 40, label: "Edge tier"] {\n  A\n}\nA > B');
    const [frame] = frames(elements);
    expect(frame.title).toBe("Edge tier");
    expect(frame.padding).toBe(40);
    expect(frame.color).toMatch(/^#/);
  });

  it("reports a frame the API refuses and still draws the nodes", () => {
    let code = "";
    for (let i = 0; i < 10; i += 1) code += `${"  ".repeat(i)}frame F${i} {\n`;
    code += `${"  ".repeat(10)}Leaf\n`;
    for (let i = 9; i >= 0; i -= 1) code += `${"  ".repeat(i)}}\n`;
    code += "Leaf > Other";
    const { elements, issues } = draft(code);
    expect(node(elements, "leaf")).toBeDefined();
    expect(issues.some((i) => i.code === "frame/not-drawn")).toBe(true);
    expect(frames(elements).length).toBeGreaterThan(0);
  });
});

describe("frames in sync", () => {
  it("draws on an empty board, and applying the same code again changes nothing", () => {
    const { canvas, sync } = draw(EDGE);
    expect(frames(canvas)).toHaveLength(1);
    expect(Object.values(sync.owned)).toContain("frame:edge");
    const again = ready(planApply({ code: EDGE, canvas, sync, generationId: "g2" }));
    expect(again.patch).toEqual({ add: [], update: [], remove: [] });
  });

  it("renames a frame in place, keeping its element and its members", () => {
    const { canvas, sync } = draw(EDGE);
    const before = frames(canvas)[0].id;
    const plan = ready(planApply({ code: EDGE.replace("frame Edge {", 'frame Edge [label: "Public edge"] {'), canvas, sync, generationId: "g2" }));
    expect(plan.patch.add).toEqual([]);
    expect(plan.patch.remove).toEqual([]);
    const next = applyPlan(canvas, plan);
    expect(frames(next)[0].id).toBe(before);
    expect(frames(next)[0].title).toBe("Public edge");
    expect(node(next, "web").frameId).toBe(before);
  });

  it("keeps a frame the person resized when the code did not change its box", () => {
    const { canvas, sync } = draw(EDGE);
    const resized = canvas.map((el) =>
      el.type === "frame" ? ({ ...el, points: [el.points[0], { x: el.points[1].x + 120, y: el.points[1].y + 40 }] } as DrawingElement) : el,
    );
    const plan = ready(planApply({ code: EDGE, canvas: resized, sync, generationId: "g2" }));
    expect(plan.patch.update.filter((el) => el.type === "frame")).toEqual([]);
    expect(canvasDrift(resized, sync).edited).toContain(frames(resized)[0].id);
  });

  it("grows a frame without a box to take in a node added to it, and leaves a roomy box alone", () => {
    const { canvas, sync } = draw(EDGE);
    const frame = frames(canvas)[0];
    const roomy = canvas.map((el) => (el.id === frame.id ? ({ ...el, points: [el.points[0], { x: el.points[1].x + 600, y: el.points[1].y + 600 }] } as DrawingElement) : el));
    const before = frameBox(roomy.find((el) => el.id === frame.id) as FrameShape)!;
    const added = ready(planApply({ code: EDGE.replace("  API\n}", "  API\n  Cache\n}"), canvas: roomy, sync, generationId: "g2" }));
    const next = applyPlan(roomy, added);
    const grown = frameBox(next.find((el) => el.id === frame.id) as FrameShape)!;
    expect(node(next, "cache").frameId).toBe(frame.id);
    expect(inside(grown, node(next, "cache"))).toBe(true);
    // The box the person made larger is kept, not shrunk back.
    expect(grown.maxX).toBeGreaterThanOrEqual(before.maxX);
    expect(grown.maxY).toBeGreaterThanOrEqual(before.maxY);
  });

  it("moves a node into a frame by editing the code, and takes it out again", () => {
    const { canvas, sync } = draw(EDGE);
    const frame = frames(canvas)[0];
    const moved = EDGE.replace("  API\n}\nDB", "  API\n  DB\n}");
    const plan = ready(planApply({ code: moved, canvas, sync, generationId: "g2" }));
    const next = applyPlan(canvas, plan);
    expect(node(next, "db").frameId).toBe(frame.id);
    const back = ready(planApply({ code: EDGE, canvas: next, sync: plan.sync, generationId: "g3" }));
    expect(node(applyPlan(next, back), "db").frameId).toBeUndefined();
  });

  it("removes a frame whose declaration was deleted, leaving its nodes on the board", () => {
    const { canvas, sync } = draw(EDGE);
    const flat = "Web\nAPI\nDB\nWeb > API\nAPI > DB\n";
    const plan = ready(planApply({ code: flat, canvas, sync, generationId: "g2" }));
    const next = applyPlan(canvas, plan);
    expect(frames(next)).toHaveLength(0);
    expect(node(next, "web").frameId).toBeUndefined();
  });
});

describe("frames read back off the canvas", () => {
  it("writes frames and their members as code that means the same, then syncs with nothing to do", () => {
    const code = "frame Cloud {\n  frame Edge {\n    Web\n  }\n  API\n}\nDB\nWeb > API\nAPI > DB\n";
    const { canvas } = draw(code);
    const loaded = loadFromCanvas(canvas, { generationId: "g1", layout: false })!;
    // The canvas adds what the compiler inferred (kinds), so compare the containment, which is what frames are.
    const shape = (source: string) => {
      const { ir } = compileDiagramCode(source);
      return { frames: ir.frames.map((f) => [f.id, f.title, f.parent?.id]), nodes: ir.nodes.map((n) => [n.id, n.parent?.id]).sort() };
    };
    expect(shape(loaded.code)).toEqual(shape(code));
    const plan = ready(planApply({ code: loaded.code, canvas, sync: loaded.sync, generationId: "g2" }));
    expect(plan.patch).toEqual({ add: [], update: [], remove: [] });
    expect(canvasDrift(canvas, loaded.sync)).toEqual({ edited: [], missing: [] });
  });

  it("with layout, writes the frame box and still has nothing to sync", () => {
    const { canvas } = draw(EDGE);
    const loaded = loadFromCanvas(canvas, { generationId: "g1", layout: true })!;
    expect(loaded.code).toMatch(/frame Edge \[x: -?\d+, y: -?\d+, w: \d+, h: \d+\] \{/);
    const plan = ready(planApply({ code: loaded.code, canvas, sync: loaded.sync, generationId: "g2" }));
    expect(plan.patch.add).toEqual([]);
    expect(plan.patch.remove).toEqual([]);
    expect(plan.patch.update.filter((el) => el.type === "frame")).toEqual([]);
  });

  it("reads a frame a person drew by hand around two shapes", () => {
    const { canvas } = draw("A\nB\nA > B\n");
    const a = node(canvas, "a");
    const b = node(canvas, "b");
    const frame = { id: "hand", type: "frame", title: "Mine", points: [{ x: -50, y: -50 }, { x: 600, y: 400 }], color: "#64748b", strokeWidth: 1 } as unknown as DrawingElement;
    const board = [frame, ...canvas.map((el) => (el.id === a.id || el.id === b.id ? ({ ...el, frameId: "hand" } as DrawingElement) : el))];
    const loaded = loadFromCanvas(board, { generationId: "g1", layout: false })!;
    expect(loaded.code).toContain("frame Mine {");
    expect(loaded.sync.owned.hand).toBe("frame:mine");
    const plan = ready(planApply({ code: loaded.code, canvas: board, sync: loaded.sync, generationId: "g2" }));
    expect(plan.patch.remove).toEqual([]);
    expect(plan.patch.add).toEqual([]);
  });

  it("leaves a group that spans two frames on the board instead of dropping it from the code", () => {
    const { canvas } = draw("frame One {\n  A\n}\nframe Two {\n  B\n}\ngroup Both {\n}\nA > B\n");
    const a = node(canvas, "a");
    const b = node(canvas, "b");
    expect(a.frameId).not.toBe(b.frameId);
    const loaded = loadFromCanvas(canvas, { generationId: "g1" })!;
    expect(loaded.code).toContain("frame One");
    expect(loaded.code).toContain("frame Two");
  });
});

describe("serializing frames", () => {
  it("round-trips nesting, groups, boxes and unusual titles", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g", label: "Pair", nodeIds: ["a", "b"] }],
      frames: [
        { id: "outer", title: "frame: the outer one", nodeIds: ["a", "b", "c"], x: 0, y: 0, width: 400, height: 300 },
        { id: "inner", title: "Inner", parentId: "outer", nodeIds: ["c"], padding: 10, color: "#ff0000" },
      ],
    };
    const code = serializeDiagramCode(graph);
    const { ir, diagnostics } = compileDiagramCode(code);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(ir.frames.map((f) => f.title).sort()).toEqual(["Inner", "frame: the outer one"]);
    expect(ir.frames.find((f) => f.title === "Inner")?.parent?.id).toBe(ir.frames.find((f) => f.title !== "Inner")!.id);
    expect(ir.groups).toHaveLength(1);
    expect(serializeDiagramCode(graph)).toBe(code);
  });

  it("leaves out a frame with nothing in it and a group that spans frames", () => {
    const code = serializeDiagramCode({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [],
      groups: [{ id: "g", label: "Both", nodeIds: ["a", "b"] }],
      frames: [
        { id: "f1", title: "One", nodeIds: ["a"] },
        { id: "f2", title: "Two", nodeIds: ["b"] },
        { id: "empty", title: "Empty", nodeIds: [] },
      ],
    });
    expect(code).not.toContain("Empty");
    expect(compileDiagramCode(code).ir.groups).toHaveLength(0);
    expect(compileDiagramCode(code).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
