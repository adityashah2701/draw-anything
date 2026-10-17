import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;
type El = Record<string, any>;
type Pt = { x: number; y: number };
const arrowOf = async (s: EditorSession) => ((await s.elements()).find((e) => e.type === "arrow") as El);
const orthogonal = (pts: Pt[]) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
const text = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

suite("editor orthogonal routing", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
    await s.pickTool("r");
    await s.drag({ x: 100, y: 100 }, { x: 220, y: 160 });
    await s.pickTool("r");
    await s.drag({ x: 500, y: 300 }, { x: 620, y: 360 });
    await s.pickTool("a");
    await s.drag({ x: 215, y: 130 }, { x: 505, y: 330 });
  });
  afterEach(async () => {
    await s?.close();
  });

  it("a fresh arrow leaves and arrives straight out of its anchors, with no jog at the shape", async () => {
    const pts = (await arrowOf(s)).points as Pt[];
    expect(orthogonal(pts), text(pts)).toBe(true);
    expect(pts[0]).toMatchObject({ x: 220, y: 130 });
    expect(pts.at(-1)).toMatchObject({ x: 500, y: 330 });
    expect(pts[1].y).toBe(130); // horizontal out of the right side
    expect(pts.at(-2)!.y).toBe(330); // horizontal into the left side: no 6 px jog
  });

  const grabSegment = async (index: number) => {
    await s.click({ x: 360, y: 230 }); // selects the arrow
    const pts = (await arrowOf(s)).points as Pt[];
    const mid = { x: (pts[index].x + pts[index + 1].x) / 2, y: (pts[index].y + pts[index + 1].y) / 2 };
    const at = await s.toScreen(mid);
    await s.page.mouse.move(at.x, at.y);
    await s.page.mouse.down();
    return mid;
  };
  const moveTo = async (p: Pt) => {
    const at = await s.toScreen(p);
    await s.page.mouse.move(at.x, at.y);
  };

  it("dragging the middle segment moves that lane smoothly, frame after frame, and keeps the path clean", async () => {
    const mid = await grabSegment(1);
    const xs: number[] = [];
    for (let k = 1; k <= 8; k += 1) {
      await moveTo({ x: mid.x - 12 * k, y: mid.y + 3 * k });
      const pts = (await arrowOf(s)).points as Pt[];
      expect(orthogonal(pts), text(pts)).toBe(true);
      expect(pts.length, text(pts)).toBe(4); // no bends pile up while dragging
      xs.push(pts[1].x);
    }
    await s.page.mouse.up();
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeLessThan(xs[i - 1]); // follows the pointer, never jumps back
    expect((await arrowOf(s)).isManuallyRouted).toBe(true);
  });

  it("dragging the segment next to the shape slides the lane instead of bending the arrow at the anchor", async () => {
    const mid = await grabSegment(0);
    await moveTo({ x: mid.x + 60, y: mid.y + 200 });
    await moveTo({ x: mid.x + 90, y: mid.y - 120 });
    await s.page.mouse.up();
    const pts = (await arrowOf(s)).points as Pt[];
    expect(pts.length, text(pts)).toBe(4);
    expect(pts[1].y).toBe(pts[0].y); // still leaves horizontally
    expect(pts[1].x).toBeGreaterThan(pts[0].x);
  });

  it("a lane cannot be dragged past the shape it leaves: it stops a stub's length out", async () => {
    const mid = await grabSegment(1);
    await moveTo({ x: 40, y: mid.y });
    await s.page.mouse.up();
    const pts = (await arrowOf(s)).points as Pt[];
    expect(pts[1].x, text(pts)).toBeGreaterThan(pts[0].x);
    expect(pts.at(-2)!.x, text(pts)).toBeLessThan(pts.at(-1)!.x);
  });

  it("after a manual edit, moving the target keeps the arrow attached and its approach clean", async () => {
    const mid = await grabSegment(1);
    await moveTo({ x: mid.x + 40, y: mid.y });
    await s.page.mouse.up();
    const rects = (await s.elements()).filter((e) => e.type === "rectangle") as El[];
    const target = rects[1];
    const centre = { x: (target.points[0].x + target.points[1].x) / 2, y: (target.points[0].y + target.points[1].y) / 2 };
    await s.drag(centre, { x: centre.x + 70, y: centre.y + 90 });
    const moved = ((await s.elements()).filter((e) => e.type === "rectangle") as El[])[1];
    const end = (await arrowOf(s)).points.at(-1) as Pt;
    expect(end.x).toBe(moved.points[0].x); // on the left side of the moved target
    expect(end.y).toBe((moved.points[0].y + moved.points[1].y) / 2);
    const pts = (await arrowOf(s)).points as Pt[];
    expect(orthogonal(pts), text(pts)).toBe(true);
    expect(pts.at(-2)!.y, text(pts)).toBe(end.y); // arrives horizontally, no jog or run along the edge
    expect(pts.at(-2)!.x, text(pts)).toBeLessThan(end.x);
  });
});
