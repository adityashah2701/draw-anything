import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

/*
 * The semantic node through the real canvas renderer, measured in pixels: the icon and the label must
 * land in the boxes the layout promises, never overlap, never leave the node, at several sizes, zooms
 * and themes. (The geometry itself is unit-tested in core/shapes/semantic-node/layout.test.ts.)
 */

interface Case {
  name: string;
  label: string;
  w: number;
  h: number;
  nodeStyle?: Record<string, unknown>;
  fontSize?: number;
}
const CASES: Case[] = [
  { name: "short label, default size", label: "Database", w: 168, h: 78 },
  { name: "long label wraps to several lines", label: "Primary PostgreSQL database cluster (eu-west-1)", w: 240, h: 110 },
  { name: "explicit line breaks", label: "one\ntwo\nthree", w: 200, h: 110 },
  { name: "narrow and tall stacks the icon over the label", label: "Gateway", w: 104, h: 120 },
  { name: "minimum size", label: "API", w: 112, h: 56 },
  { name: "wide node", label: "Auth", w: 420, h: 90 },
  { name: "large icon", label: "Queue", w: 240, h: 120, nodeStyle: { iconSize: 48 } },
  { name: "icon on the right", label: "Worker", w: 240, h: 78, nodeStyle: { iconPlacement: "right" } },
  { name: "label too long for the box is cut, not drawn over the border", label: "word ".repeat(40), w: 168, h: 78 },
];
const ZOOMS = [0.5, 1, 2];
const PAN = { x: 37, y: 21 };
const ORIGIN = { x: 90, y: 60 };

interface Probe {
  /** Pixels that are not the page background, per area. */
  iconInk: { minX: number; minY: number; maxX: number; maxY: number } | null;
  labelInk: { minX: number; minY: number; maxX: number; maxY: number } | null;
  anyInk: { minX: number; minY: number; maxX: number; maxY: number } | null;
  layout: {
    placement: string;
    align: string;
    icon: { cx: number; cy: number; size: number } | null;
    text: { x: number; y: number; width: number; height: number };
  };
}

suite("semantic node: where things land on the canvas", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  /**
   * One real render, then the pixels sorted by what drew them: the label is near-black text, the icon is the
   * database glyph in violet on a faint violet tile, so a blue-over-green cast marks it.
   */
  const probe = (c: Case, zoom: number) =>
    s.page.evaluate(
      ({ c, zoom, pan, origin }) => {
        const T = window.T;
        document.body.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 600;
        document.body.appendChild(canvas);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 900, 600);
        ctx.strokeStyle = "#ffffff"; // hide the border: only content leaves ink
        ctx.lineWidth = 2;
        const shape = {
          id: "n", type: "semantic-node", color: "#000000", fill: "#ffffff", strokeWidth: 2, label: c.label,
          fontSize: c.fontSize ?? 17, fontWeight: "600", ai: { icon: "database" },
          points: [{ x: origin.x, y: origin.y }, { x: origin.x + c.w, y: origin.y + c.h }],
          ...(c.nodeStyle ? { nodeStyle: c.nodeStyle } : {}),
        } as unknown as Parameters<typeof T.renderSemanticNodeToCanvas>[0];
        T.renderSemanticNodeToCanvas(shape, { ctx, zoom, panOffset: pan, getElementBounds: () => null });
        const { data, width, height } = ctx.getImageData(0, 0, 900, 600);
        const box = () => ({ minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 });
        const any = box(), icon = box(), label = box();
        const grow = (b: ReturnType<typeof box>, x: number, y: number) => {
          if (x < b.minX) b.minX = x;
          if (x > b.maxX) b.maxX = x;
          if (y < b.minY) b.minY = y;
          if (y > b.maxY) b.maxY = y;
        };
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            if (r >= 250 && g >= 250 && b >= 250) continue;
            grow(any, x, y);
            if (b - g > 12) grow(icon, x, y);
            else if (Math.max(r, g, b) < 140 && Math.max(r, g, b) - Math.min(r, g, b) < 50) grow(label, x, y);
          }
        }
        const out = (b: ReturnType<typeof box>) => (b.maxX < 0 ? null : b);
        const layout = T.layoutSemanticNode({ minX: origin.x, minY: origin.y, width: c.w, height: c.h }, c.nodeStyle);
        return {
          iconInk: out(icon),
          labelInk: out(label),
          anyInk: out(any),
          layout: { placement: layout.placement, align: layout.align, icon: layout.icon, text: layout.text },
        } as Probe;
      },
      { c, zoom, pan: PAN, origin: ORIGIN },
    );

  const toScreen = (v: number, axis: "x" | "y", zoom: number) => v * zoom + PAN[axis];
  // Antialiasing and glyph side bearings: a couple of pixels of slack, scaled a little with zoom.
  const slack = (zoom: number) => 2 + zoom;

  for (const c of CASES) {
    for (const zoom of ZOOMS) {
      it(`${c.name} @ ${zoom}x: icon and label stay in their boxes and never overlap`, async () => {
        const p = await probe(c, zoom);
        const tol = slack(zoom);
        const node = {
          minX: toScreen(ORIGIN.x, "x", zoom), maxX: toScreen(ORIGIN.x + c.w, "x", zoom),
          minY: toScreen(ORIGIN.y, "y", zoom), maxY: toScreen(ORIGIN.y + c.h, "y", zoom),
        };

        // Nothing is drawn outside the node.
        expect(p.anyInk, "something is drawn").toBeTruthy();
        expect(p.anyInk!.minX).toBeGreaterThanOrEqual(node.minX - tol);
        expect(p.anyInk!.maxX).toBeLessThanOrEqual(node.maxX + tol);
        expect(p.anyInk!.minY).toBeGreaterThanOrEqual(node.minY - tol);
        expect(p.anyInk!.maxY).toBeLessThanOrEqual(node.maxY + tol);

        // The icon is where the layout put it.
        expect(p.iconInk, "the icon is drawn").toBeTruthy();
        const icon = p.layout.icon!;
        const half = (icon.size / 2) * zoom;
        const ix = toScreen(icon.cx, "x", zoom);
        const iy = toScreen(icon.cy, "y", zoom);
        expect(p.iconInk!.minX).toBeGreaterThanOrEqual(ix - half - tol);
        expect(p.iconInk!.maxX).toBeLessThanOrEqual(ix + half + tol);
        expect(p.iconInk!.minY).toBeGreaterThanOrEqual(iy - half - tol);
        expect(p.iconInk!.maxY).toBeLessThanOrEqual(iy + half + tol);

        // The label stays in its text box: not clipped into the icon, not over the border.
        expect(p.labelInk, "the label is drawn").toBeTruthy();
        const t = p.layout.text;
        expect(p.labelInk!.minX).toBeGreaterThanOrEqual(toScreen(t.x, "x", zoom) - tol);
        expect(p.labelInk!.maxX).toBeLessThanOrEqual(toScreen(t.x + t.width, "x", zoom) + tol);
        expect(p.labelInk!.minY).toBeGreaterThanOrEqual(toScreen(t.y, "y", zoom) - tol);
        expect(p.labelInk!.maxY).toBeLessThanOrEqual(toScreen(t.y + t.height, "y", zoom) + tol);

        // Icon and label never share a pixel column band AND row band at once.
        const apartX = p.iconInk!.maxX < p.labelInk!.minX || p.labelInk!.maxX < p.iconInk!.minX;
        const apartY = p.iconInk!.maxY < p.labelInk!.minY || p.labelInk!.maxY < p.iconInk!.minY;
        expect(apartX || apartY, `icon ${JSON.stringify(p.iconInk)} label ${JSON.stringify(p.labelInk)}`).toBe(true);
      });
    }
  }

  it("a single-line label is flush with the left edge of its box, beside the icon", async () => {
    const p = await probe({ name: "x", label: "Database", w: 240, h: 78 }, 1);
    expect(p.layout.align).toBe("left");
    // Within a pixel or two of the box edge (the first glyph's side bearing), not centred in the node.
    expect(Math.abs(p.labelInk!.minX - (p.layout.text.x + PAN.x))).toBeLessThanOrEqual(3);
    expect(p.labelInk!.minX).toBeLessThan(ORIGIN.x + PAN.x + 120);
  });

  it("the icon is bigger than before: its ink is more than 20px across at 1x", async () => {
    const p = await probe({ name: "x", label: "Database", w: 168, h: 78 }, 1);
    expect(p.iconInk!.maxX - p.iconInk!.minX).toBeGreaterThan(20);
  });

  it("the label and the icon are vertically centred on the same line in a default node", async () => {
    const p = await probe({ name: "x", label: "Database", w: 168, h: 78 }, 1);
    const iconMid = (p.iconInk!.minY + p.iconInk!.maxY) / 2;
    const labelMid = (p.labelInk!.minY + p.labelInk!.maxY) / 2;
    expect(Math.abs(iconMid - labelMid)).toBeLessThanOrEqual(6);
  });
});

suite("semantic node: dark theme", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  /** Brightest icon pixel (0-255) when a node without fill is drawn on the page background of each theme. */
  const brightest = (dark: boolean, fill: string | undefined) =>
    s.page.evaluate(
      ({ dark, fill }) => {
        const T = window.T;
        document.documentElement.classList.toggle("dark", dark);
        document.body.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 160;
        document.body.appendChild(canvas);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = dark ? "#0d0d0d" : "#ffffff";
        ctx.fillRect(0, 0, 300, 160);
        const shape = {
          id: "n", type: "semantic-node", color: dark ? "#ffffff" : "#000000", strokeWidth: 2, label: "",
          ai: { icon: "user" }, points: [{ x: 20, y: 20 }, { x: 188, y: 98 }],
          ...(fill ? { fill } : {}),
        } as unknown as Parameters<typeof T.renderSemanticNodeToCanvas>[0];
        ctx.strokeStyle = dark ? "#0d0d0d" : "#ffffff";
        T.renderSemanticNodeToCanvas(shape, { ctx, zoom: 1, panOffset: { x: 0, y: 0 }, getElementBounds: () => null });
        const { data } = ctx.getImageData(32, 39, 40, 40);
        let max = 0, min = 255;
        for (let i = 0; i < data.length; i += 4) {
          const l = Math.max(data[i], data[i + 1], data[i + 2]);
          max = Math.max(max, l);
          min = Math.min(min, l);
        }
        document.documentElement.classList.remove("dark");
        return { max, min };
      },
      { dark, fill },
    );

  it("a line icon with no fill is lightened on the dark canvas so it still reads", async () => {
    const light = await brightest(false, undefined);
    const dark = await brightest(true, undefined);
    // The slate icon (#475569, brightest channel 0x69) is drawn lighter on dark.
    expect(light.min).toBeLessThanOrEqual(0x69 + 2);
    expect(dark.max).toBeGreaterThan(0x69 + 40);
  });

  it("the same icon on a dark fill is lightened in the light theme too", async () => {
    const onDark = await brightest(false, "#0f172a");
    expect(onDark.max).toBeGreaterThan(0x69 + 40);
  });
});
