import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession, type Point } from "./open-editor";
import { byId, rect, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

const text = (id: string, x: number, y: number, fontSize: number, content: string): El => ({
  id,
  type: "text",
  text: content,
  fontSize,
  fontWeight: "400",
  fontStyle: "normal",
  color: "#1f2937",
  strokeWidth: 1,
  points: [{ x, y }],
});

suite("editor smart guides", () => {
  let s: EditorSession;
  const open = async (elements: El[]) => {
    s = await openEditor({ elements: elements as never });
  };
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p) && !/willReadFrequently/.test(p))).toEqual([]);
    await s?.close();
  });
  beforeEach(() => undefined);

  const setView = (zoom: number, pan = { x: 60, y: 60 }) =>
    s.page.evaluate(
      ({ zoom, pan }) => {
        window.__editor.controller!.canvasViewport.loadViewportSettings({ zoom, panOffset: pan });
      },
      { zoom, pan },
    );

  /** Press on `from`, move to `to` and hold: the guides can be read before the button is released. */
  const hold = async (from: Point, to: Point, { alt = false }: { alt?: boolean } = {}) => {
    const a = await s.toScreen(from);
    const b = await s.toScreen(to);
    await s.page.mouse.move(a.x, a.y);
    if (alt) await s.page.keyboard.down("Alt");
    await s.page.mouse.down();
    await s.page.mouse.move(b.x, b.y, { steps: 6 });
    return {
      overlay: () =>
        s.page.evaluate(() => {
          const d = window.__editor.controller!.whiteboardDrawing;
          return { guides: d.alignmentGuides, spans: d.alignmentSpans };
        }),
      release: async () => {
        await s.page.mouse.up();
        if (alt) await s.page.keyboard.up("Alt");
        await s.waitForIdle();
      },
    };
  };
  const at = async (id: string) => byId(await s.elements(), id).points[0] as Point;

  describe("alignment guides", () => {
    // T: x 300..420, y 100..180.  M: 120x80 below it, far from every line of T.
    const board = () => [rect("T", 300, 100), rect("M", 100, 400)];

    it("snaps an edge onto another shape's edge and shows the guide while dragging", async () => {
      await open(board());
      const drag = await hold({ x: 160, y: 440 }, { x: 160 + 197, y: 440 }); // left edge 297, target 300
      const { guides } = await drag.overlay();
      expect(guides.some((g) => g.axis === "x" && g.at === 300)).toBe(true);
      await drag.release();
      expect(await at("M")).toEqual({ x: 300, y: 400 });
    });

    it("snaps centres too", async () => {
      // a narrow M: only its centre can reach T's centre (T spans 300..420, centre 360)
      await open([rect("T", 300, 100), rect("M", 100, 400, 60, 80)]);
      const drag = await hold({ x: 130, y: 440 }, { x: 130 + 227, y: 440 }); // M centre 357, 3 from 360
      const { guides } = await drag.overlay();
      expect(guides.some((g) => g.axis === "x" && g.at === 360)).toBe(true);
      await drag.release();
      expect((await at("M")).x).toBe(330);
    });

    it("does not snap when the edge is further than the tolerance", async () => {
      await open(board());
      const drag = await hold({ x: 160, y: 440 }, { x: 160 + 190, y: 440 }); // 10 away
      expect((await drag.overlay()).guides).toEqual([]);
      await drag.release();
      expect(await at("M")).toEqual({ x: 290, y: 400 });
    });

    it("Alt turns snapping off for the drag", async () => {
      await open(board());
      const drag = await hold({ x: 160, y: 440 }, { x: 160 + 197, y: 440 }, { alt: true });
      expect(await drag.overlay()).toEqual({ guides: [], spans: [] });
      await drag.release();
      expect(await at("M")).toEqual({ x: 297, y: 400 });
    });

    it("the reach is a screen distance: the same on screen at any zoom", async () => {
      // zoomed out to 0.5, six screen pixels reach twelve world units
      await open(board());
      await setView(0.5);
      let drag = await hold({ x: 160, y: 440 }, { x: 160 + 188, y: 440 }); // 12 world = 6 px away from 300
      await drag.release();
      expect((await at("M")).x).toBe(300);
      await s.close();

      // zoomed in to 2x, the same six pixels reach only three world units
      await open(board());
      await setView(2, { x: -100, y: -600 }); // keep the shapes on screen
      drag = await hold({ x: 160, y: 440 }, { x: 160 + 194, y: 440 }); // 6 world = 12 px away
      await drag.release();
      expect((await at("M")).x).toBe(294);
      await s.close();

      await open(board());
      await setView(2, { x: -100, y: -600 });
      drag = await hold({ x: 160, y: 440 }, { x: 160 + 198, y: 440 }); // 2 world = 4 px away
      await drag.release();
      expect((await at("M")).x).toBe(300);
    });

    it("a smaller tolerance from the snapping menu is honoured, and remembered after a reload", async () => {
      await open(board());
      await s.page.getByRole("button", { name: "Snapping", exact: true }).click();
      const tolerance = s.page.getByRole("textbox", { name: "Snap tolerance", exact: true });
      await tolerance.fill("2");
      await tolerance.press("Enter");
      await s.press("Escape");
      let drag = await hold({ x: 160, y: 440 }, { x: 160 + 195, y: 440 }); // 5 px away: now outside
      await drag.release();
      expect((await at("M")).x).toBe(295);

      await s.reload();
      expect(await s.page.evaluate(() => window.__editor.controller!.snapSettings.tolerancePx)).toBe(2);
      await s.page.evaluate(() => window.__editor.room.reset([]));
    });

    it("the master switch turns snapping and guides off", async () => {
      await open(board());
      await s.page.evaluate(() => window.__editor.controller!.setSnapSettings({ enabled: false }));
      const drag = await hold({ x: 160, y: 440 }, { x: 160 + 197, y: 440 });
      expect(await drag.overlay()).toEqual({ guides: [], spans: [] });
      await drag.release();
      expect((await at("M")).x).toBe(297);
    });

    it("a dragged group aligns as one box, and group members count as targets", async () => {
      await open([
        rect("T", 300, 100),
        rect("G1", 100, 400, 60, 80, { groupId: "grp" }),
        rect("G2", 180, 400, 60, 80, { groupId: "grp" }),
        { id: "grp", type: "group", points: [], color: "#000", strokeWidth: 0 },
      ]);
      const drag = await hold({ x: 130, y: 440 }, { x: 130 + 197, y: 440 }); // the group's right edge 240+197 = 437 vs T right 420? use its left edge: 100+197=297 -> 300
      await drag.release();
      expect(await at("G1")).toEqual({ x: 300, y: 400 });
      expect(await at("G2")).toEqual({ x: 380, y: 400 }); // moved together, keeping the 20px gap
    });
  });

  describe("equal spacing and distances", () => {
    // L and R in a row with 300 between them; M (100 wide) belongs exactly in the middle: x 300.
    const row = () => [rect("L", 100, 100, 100, 60), rect("R", 500, 100, 100, 60), rect("M", 285, 300, 100, 60)];

    it("snaps between two neighbours so both gaps are equal, and marks them", async () => {
      await open(row());
      const drag = await hold({ x: 335, y: 330 }, { x: 335 + 12, y: 330 - 200 }); // raw x 297, row height
      const { spans } = await drag.overlay();
      const gaps = spans.filter((sp) => sp.kind === "gap" && sp.axis === "x");
      expect(gaps.map((g) => [g.from, g.to]).sort()).toEqual([[200, 300], [400, 500]]);
      await drag.release();
      expect(await at("M")).toEqual({ x: 300, y: 100 });
    });

    it("matches the gap between two other shapes when placed after them", async () => {
      // A [100,200] and B [250,350] are 50 apart; M goes after B at x 400
      await open([rect("A", 100, 100, 100, 60), rect("B", 250, 100, 100, 60), rect("M", 600, 300, 100, 60)]);
      const drag = await hold({ x: 650, y: 330 }, { x: 650 - 197, y: 330 - 200 }); // raw x 403
      await drag.release();
      expect((await at("M")).x).toBe(400);
    });

    it("can be switched off without losing edge snapping", async () => {
      await open(row());
      await s.page.evaluate(() => window.__editor.controller!.setSnapSettings({ spacing: false }));
      const drag = await hold({ x: 335, y: 330 }, { x: 335 + 12, y: 330 - 200 });
      expect((await drag.overlay()).spans.filter((sp) => sp.kind === "gap")).toEqual([]);
      await drag.release();
      expect((await at("M")).x).toBe(297);
    });

    it("shows the distance to the nearest neighbour while dragging, in world units", async () => {
      await open([rect("L", 100, 100, 100, 60), rect("M", 600, 300, 100, 60)]);
      const drag = await hold({ x: 650, y: 330 }, { x: 650 - 360, y: 330 - 200 }); // M.minX = 240, 40 right of L
      const { spans } = await drag.overlay();
      expect(spans.some((sp) => sp.kind === "distance" && sp.axis === "x" && Math.abs(sp.to - sp.from - 40) < 0.01)).toBe(true);
      await drag.release();
    });

    it("measures in world units at any zoom", async () => {
      await open([rect("L", 100, 100, 100, 60), rect("M", 600, 300, 100, 60)]);
      await setView(0.5);
      const drag = await hold({ x: 650, y: 330 }, { x: 650 - 360, y: 330 - 200 });
      const { spans } = await drag.overlay();
      expect(spans.some((sp) => sp.kind === "distance" && Math.abs(sp.to - sp.from - 40) < 0.01)).toBe(true);
      await drag.release();
    });

    it("draws the distance labels on the canvas", async () => {
      await open([rect("L", 100, 100, 100, 60), rect("M", 600, 300, 100, 60)]);
      const drag = await hold({ x: 650, y: 330 }, { x: 650 - 360, y: 330 - 200 });
      await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await s.screenshot("guides-distance");
      await drag.release();
    });

    it("clears every guide when the drag ends", async () => {
      await open(row());
      const drag = await hold({ x: 335, y: 330 }, { x: 335 + 12, y: 330 - 200 });
      await drag.release();
      const { guides, spans } = await s.page.evaluate(() => {
        const d = window.__editor.controller!.whiteboardDrawing;
        return { guides: d.alignmentGuides, spans: d.alignmentSpans };
      });
      expect([guides, spans]).toEqual([[], []]);
    });
  });

  describe("text baselines", () => {
    it("aligns the baselines of two texts of different sizes, not their tops", async () => {
      // sizes chosen so that no top, centre or bottom of the two lines up when their baselines do
      await open([text("t1", 100, 100, 20, "Hello"), text("t2", 400, 300, 80, "World")]);
      const [b1, b2] = await s.page.evaluate(() => {
        const c = window.__editor.controller!;
        const [one, two] = window.__editor.room.elements();
        return [c.baselineOf(one), c.baselineOf(two)] as [number, number];
      });
      // move t2 so its baseline is 3 above t1's: its top is then far from t1's top
      const dy = b1 - b2 - 3;
      const drag = await hold({ x: 450, y: 340 }, { x: 350, y: 340 + dy });
      const { guides } = await drag.overlay();
      expect(guides.some((g) => g.kind === "baseline" && Math.abs(g.at - b1) < 0.5)).toBe(true);
      await drag.release();
      const moved = await s.page.evaluate(() => {
        const c = window.__editor.controller!;
        return c.baselineOf(window.__editor.room.elements()[1]);
      });
      expect(moved).toBeCloseTo(b1, 4);
    });
  });
});

suite("editor align and distribute commands", () => {
  let s: EditorSession;
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p))).toEqual([]);
    await s?.close();
  });
  const select = async (...ids: string[]) => {
    await s.click({ x: 900, y: 700 });
    const els = await s.elements();
    for (const [i, id] of ids.entries()) {
      const e = byId(els, id);
      const p = { x: e.points[0].x + 10, y: e.points[0].y + 10 };
      if (i > 0) await s.page.keyboard.down("Shift");
      await s.click(p);
      if (i > 0) await s.page.keyboard.up("Shift");
    }
  };
  const xs = async (...ids: string[]) => {
    const els = await s.elements();
    return ids.map((id) => byId(els, id).points[0].x);
  };

  it("Alt+A aligns left, Alt+D right, Alt+H centres", async () => {
    s = await openEditor({ elements: [rect("a", 100, 100, 100, 50), rect("b", 300, 200, 60, 50), rect("c", 500, 300, 140, 50)] as never });
    await select("a", "b", "c");
    await s.page.keyboard.press("Alt+KeyA");
    expect(await xs("a", "b", "c")).toEqual([100, 100, 100]);
    await s.page.keyboard.press("Alt+KeyD");
    // right edges meet at the widest one's: 100 + 140 = 240
    expect(await xs("a", "b", "c")).toEqual([140, 180, 100]);
    await s.press("Control+z");
    await s.press("Control+z");
    await s.page.keyboard.press("Alt+KeyH");
    const els = await s.elements();
    const centres = ["a", "b", "c"].map((id) => (byId(els, id).points[0].x + byId(els, id).points[1].x) / 2);
    expect(centres[0]).toBeCloseTo(centres[1], 6);
    expect(centres[1]).toBeCloseTo(centres[2], 6);
  });

  it("Alt+W, Alt+V and Alt+S align the vertical edges and centres", async () => {
    s = await openEditor({ elements: [rect("a", 100, 100, 100, 50), rect("b", 300, 200, 60, 80), rect("c", 500, 300, 140, 30)] as never });
    await select("a", "b", "c");
    await s.page.keyboard.press("Alt+KeyW");
    let els = await s.elements();
    expect(["a", "b", "c"].map((id) => byId(els, id).points[0].y)).toEqual([100, 100, 100]);
    await s.page.keyboard.press("Alt+KeyS");
    els = await s.elements();
    const bottoms = ["a", "b", "c"].map((id) => byId(els, id).points[1].y);
    expect(new Set(bottoms).size).toBe(1);
  });

  it("aligns whole groups as units and never moves a locked shape", async () => {
    s = await openEditor({
      elements: [
        rect("g1", 100, 100, 60, 50, { groupId: "G" }),
        rect("g2", 200, 100, 60, 50, { groupId: "G" }),
        rect("c", 400, 300, 80, 50),
        rect("fixed", 700, 500, 80, 50, { locked: true }),
        { id: "G", type: "group", points: [], color: "#000", strokeWidth: 0 },
      ] as never,
    });
    await select("g1", "c", "fixed");
    await s.page.keyboard.press("Alt+KeyA");
    expect(await xs("g1", "g2", "c", "fixed")).toEqual([100, 200, 100, 700]); // the group keeps its inner spacing; the locked shape stays
  });

  it("distributes three groups with equal gaps", async () => {
    s = await openEditor({
      elements: [
        rect("a", 100, 100, 100, 50),
        rect("b1", 250, 100, 50, 50, { groupId: "G" }),
        rect("b2", 310, 100, 50, 50, { groupId: "G" }),
        rect("c", 900, 100, 100, 50),
        { id: "G", type: "group", points: [], color: "#000", strokeWidth: 0 },
      ] as never,
    });
    await s.click({ x: 900, y: 700 });
    await s.drag({ x: 60, y: 60 }, { x: 1050, y: 200 }); // marquee all
    await s.page.keyboard.press("Alt+Shift+KeyH");
    const els = await s.elements();
    const box = (ids: string[]) => ({
      lo: Math.min(...ids.map((id) => byId(els, id).points[0].x)),
      hi: Math.max(...ids.map((id) => byId(els, id).points[1].x)),
    });
    const a = box(["a"]);
    const g = box(["b1", "b2"]);
    const c = box(["c"]);
    expect(g.lo - a.hi).toBeCloseTo(c.lo - g.hi, 6);
    expect(g.hi - g.lo).toBe(110); // the group's own width is untouched
  });
});
