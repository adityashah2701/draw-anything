import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { documentFromParsedCode, elementsFromDiagramCode, graphFromElements } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import type { ArrowShape, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const compile = (code: string, options = {}) => {
  const { document } = documentFromParsedCode(parseDiagramCode(code), "t");
  return compileAIDiagramToCanvas(document, "f", options);
};
const centre = (els: DrawingElement[], label: string) => {
  const e = els.find((x) => x.label === label)!;
  return { x: (e.points[0].x + e.points[1].x) / 2, y: (e.points[0].y + e.points[1].y) / 2 };
};
const chain = (header: string) => compile(`type flowchart\n${header}\nA > B > C > D`);
const centres = (els: DrawingElement[]) => ["A", "B", "C", "D"].map((l) => centre(els, l));

describe("direction", () => {
  it("lays a chain top to bottom by default and for `direction down`", () => {
    for (const header of ["", "direction down"]) {
      const c = centres(chain(header));
      expect(c[0].y).toBeLessThan(c[1].y);
      expect(c[1].y).toBeLessThan(c[3].y);
      expect(new Set(c.map((p) => Math.round(p.x))).size).toBe(1);
    }
  });

  it("lays a chain left to right for `direction right`, on one line", () => {
    const c = centres(chain("direction right"));
    expect(c[0].x).toBeLessThan(c[1].x);
    expect(c[1].x).toBeLessThan(c[2].x);
    expect(c[2].x).toBeLessThan(c[3].x);
    expect(new Set(c.map((p) => Math.round(p.y))).size).toBe(1);
  });

  it("reverses the order for `direction left` and `direction up`", () => {
    const left = centres(chain("direction left"));
    expect(left[0].x).toBeGreaterThan(left[1].x);
    expect(left[2].x).toBeGreaterThan(left[3].x);
    const up = centres(chain("direction up"));
    expect(up[0].y).toBeGreaterThan(up[1].y);
    expect(up[2].y).toBeGreaterThan(up[3].y);
  });

  it("leaves a wide node enough room: nodes in a left-to-right row do not overlap", () => {
    const els = compile("type flowchart\ndirection right\nA > B\nA > C\nA > D\nB > E\nC > E\nD > E");
    const boxes = els.filter((e) => e.ai?.role === "node").map((e) => ({ x0: e.points[0].x, y0: e.points[0].y, x1: e.points[1].x, y1: e.points[1].y }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${i} overlaps ${j}`).toBe(false);
      }
    }
  });

  it("leaves connectors leaving by the right side and arriving by the left in a left-to-right layout", () => {
    const els = compile("type flowchart\ndirection right\nA > B");
    const arrow = els.find((e) => e.type === "arrow") as ArrowShape;
    expect(arrow.startConnection!.anchorId).toMatch(/-right$/);
    expect(arrow.endConnection!.anchorId).toMatch(/-left$/);
  });

  it("survives canvas to code and back: the header is written and read again", () => {
    const drawn = elementsFromDiagramCode("type flowchart\ndirection right\nA > B > C", { generationId: "g", frameId: "f" });
    const { graph } = graphFromElements(drawn.elements);
    expect(graph.direction).toBe("right");
    const code = serializeDiagramCode(graph);
    expect(code).toMatch(/^direction right$/m);
    const again = elementsFromDiagramCode(code, { generationId: "g2", frameId: "f2" });
    const c = ["A", "B", "C"].map((l) => centre(again.elements, l));
    expect(c[0].x).toBeLessThan(c[2].x);
  });

  it("writes no direction header for a default drawing", () => {
    const drawn = elementsFromDiagramCode("type flowchart\nA > B", { generationId: "g", frameId: "f" });
    expect(serializeDiagramCode(graphFromElements(drawn.elements).graph)).not.toMatch(/direction/);
  });
});

describe("connector style", () => {
  const arrows = (options = {}, type = "flowchart") => compile(`type ${type}\nA > B > C`, options).filter((e) => e.type === "arrow") as ArrowShape[];

  it("draws rounded elbow connectors by default, from the diagram's profile", () => {
    for (const a of arrows()) {
      expect(a.routingMode).toBe("orthogonal");
      expect(a.cornerRadius).toBeGreaterThan(0);
    }
  });

  it("draws mind maps and concept maps with smooth connectors, from their profile", () => {
    expect(arrows({}, "mind-map").every((a) => a.routingMode === "curved")).toBe(true);
    expect(arrows({ connectors: "elbow" }, "mind-map").every((a) => a.routingMode === "orthogonal")).toBe(true);
  });

  it("lets the caller's choice beat the profile default", () => {
    expect(arrows({ connectors: "straight" }).every((a) => a.routingMode === "straight" && !a.cornerRadius)).toBe(true);
    expect(arrows({ connectors: "curved" }).every((a) => a.routingMode === "curved")).toBe(true);
    expect(arrows({ connectors: "elbow" }).every((a) => a.routingMode === "orthogonal")).toBe(true);
  });
});
