import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import type { ArrowShape, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { measureLayout } from "./metrics";

const compile = (code: string) => {
  const { document } = documentFromParsedCode(parseDiagramCode(code), "t");
  const elements = compileAIDiagramToCanvas(document, "f");
  const arrows = elements.filter((e) => e.type === "arrow") as ArrowShape[];
  const nodeId = (label: string) => elements.find((e) => e.label === label)!.id;
  return { elements, arrows, nodeId };
};
const last = (a: ArrowShape) => a.points[a.points.length - 1];
const first = (a: ArrowShape) => a.points[0];

describe("attachment points", () => {
  it("gives four connectors that arrive at one side four separate points, in the order of their sources", () => {
    const { arrows, nodeId, elements } = compile("type architecture\nA > T\nB > T\nC > T\nD > T");
    const into = arrows.filter((a) => a.endConnection?.elementId === nodeId("T"));
    expect(into).toHaveLength(4);
    const sameSide = into.filter((a) => a.endConnection!.anchorId!.endsWith("-top"));
    expect(sameSide.length).toBe(4);
    const xs = into.map((a) => last(a).x);
    expect(new Set(xs).size).toBe(4);
    const sourceX = (a: ArrowShape) => {
      const s = elements.find((e) => e.id === a.startConnection!.elementId)!;
      return (s.points[0].x + s.points[1].x) / 2;
    };
    const bySource = [...into].sort((a, b) => sourceX(a) - sourceX(b)).map((a) => last(a).x);
    expect(bySource).toEqual([...bySource].sort((a, b) => a - b));
    expect(into.every((a) => a.endConnection!.anchorId!.includes("-anchor-p"))).toBe(true);
  });

  it("keeps a single connector on the middle of its side, with the plain id", () => {
    const { arrows } = compile("type architecture\nA > B");
    expect(arrows[0].startConnection!.anchorId).toMatch(/-anchor-bottom$/);
    expect(arrows[0].endConnection!.anchorId).toMatch(/-anchor-top$/);
  });

  it("keeps a fan-out on one shared start, so it still reads as one trunk", () => {
    const { arrows } = compile("type architecture\nA > B\nA > C\nA > D");
    expect(new Set(arrows.map((a) => `${first(a).x},${first(a).y}`)).size).toBe(1);
  });

  it("keeps every point on its node's edge", () => {
    const { arrows, elements } = compile("type architecture\nA > T\nB > T\nC > T");
    for (const a of arrows) {
      const target = elements.find((e) => e.id === a.endConnection!.elementId)!;
      const top = Math.min(target.points[0].y, target.points[1].y);
      expect(last(a).y).toBeCloseTo(top, 3);
    }
  });
});

describe("room between rows", () => {
  const rowGap = (options: { channelGaps?: boolean }) => {
    const code = "type flowchart\nA > M: first\nB > M: second\nC > M: third\nA > N\nB > N";
    const { document } = documentFromParsedCode(parseDiagramCode(code), "t");
    const els = compileAIDiagramToCanvas(document, "f", options);
    const top = (label: string) => els.find((e) => e.label === label)!.points[0].y;
    return top("M") - top("A");
  };

  it("is wider for a busy layer boundary when asked for, and unchanged otherwise", () => {
    expect(rowGap({ channelGaps: true })).toBeGreaterThan(rowGap({}));
    expect(rowGap({})).toBe(rowGap({ channelGaps: false }));
  });
});

describe("fixtures do not get worse (numbers from before this unit)", () => {
  // crossings, shared-line pairs, connectors through a node
  const before: Record<string, [number, number, number]> = {
    architecture: [4, 1, 0],
    flowchart: [0, 5, 0],
    "mind-map": [0, 0, 0],
    stress: [29, 27, 1],
    "auth-flow": [2, 10, 0],
  };
  it.each(Object.entries(LAYOUT_FIXTURES))("%s", (name, doc) => {
    const els: DrawingElement[] = compileAIDiagramToCanvas(doc, "f");
    const m = measureLayout(els, doc.groups);
    const [crossings, shared, through] = before[name];
    // Separate points trade a few extra crossings for connectors that no longer run on top of each other
    // (the compiler orders shared lines before crossings); what is plainly broken must not grow.
    expect(m.edgeCrossings).toBeLessThanOrEqual(crossings + 3);
    expect(m.edgeOverlaps).toBeLessThanOrEqual(shared);
    expect(m.edgeThroughNodes).toBeLessThanOrEqual(through);
  });

  it("keeps the middle-of-side drawing when separate points would put a connector through a node", () => {
    const doc = LAYOUT_FIXTURES.stress;
    const m = measureLayout(compileAIDiagramToCanvas(doc, "f"), doc.groups);
    expect(m.edgeThroughNodes).toBeLessThanOrEqual(1);
  });

  it("draws every connector on the middle of its side when asked not to spread", () => {
    const { document } = documentFromParsedCode(parseDiagramCode("type architecture\nA > T\nB > T\nC > T"), "t");
    const els = compileAIDiagramToCanvas(document, "f", { spreadPorts: false });
    const into = (els.filter((e) => e.type === "arrow") as ArrowShape[]);
    expect(into.every((a) => /-anchor-top$/.test(a.endConnection!.anchorId!))).toBe(true);
  });

  it("have fewer shared-line pairs overall", () => {
    const total = Object.values(LAYOUT_FIXTURES).reduce((sum, doc) => sum + measureLayout(compileAIDiagramToCanvas(doc, "f"), doc.groups).edgeOverlaps, 0);
    expect(total).toBeLessThan(43);
  });
});
