import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportOptions, ExportResult } from "@/features/whiteboard/export/export-scene";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { findChrome, openPage, type BrowserSession } from "./harness";

interface PixelStats {
  width: number;
  height: number;
  corner: number[];
  ink: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  ringAlpha: number;
}
declare global {
  interface Window {
    H: {
      fixture(name: "architecture" | "flowchart" | "mind-map" | "stress" | "auth-flow"): DrawingElement[];
      mixed(): DrawingElement[];
      run(elements: unknown[], selectedIds: string[], options: Partial<ExportOptions>): Promise<ExportResult>;
      b64(blob: Blob): Promise<string>;
      pixels(blob: Blob): Promise<PixelStats>;
    };
  }
}

const suite = findChrome() ? describe : describe.skip;
// Set SAVE_EXPORT_DIR=<dir> to keep every exported file and a screenshot for inspection.
const OUT_DIR = process.env.SAVE_EXPORT_DIR;
const save = (name: string, base64: string) => {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}`, Buffer.from(base64, "base64"));
};

// Helpers run inside the page, next to the real modules on window.T.
const HELPERS = `
window.H = {
  fixture(name) { return T.compileAIDiagramToCanvas(T.LAYOUT_FIXTURES[name], "frame"); },
  mixed() {
    const p = (x, y) => ({ x, y });
    const base = { color: "#1f2937", strokeWidth: 2 };
    return [
      { ...base, id: "rect", type: "rectangle", points: [p(0, 0), p(220, 120)], fill: "#dbeafe", label: "Line one\\nLine two\\nA much longer third line of text" },
      { ...base, id: "circle", type: "circle", points: [p(400, 60), p(460, 60)], fill: "#fef3c7", label: "Circle" },
      { ...base, id: "diamond", type: "diamond", points: [p(540, 0), p(760, 120)], fill: "#fce7f3", label: "Ready to ship?" },
      { ...base, id: "tri", type: "triangle", points: [p(0, 240), p(160, 360)], fill: "#dcfce7", label: "Tri" },
      { ...base, id: "free", type: "freehand", points: [p(220, 260), p(260, 300), p(300, 250), p(340, 330)], strokeWidth: 6 },
      { ...base, id: "line", type: "line", points: [p(400, 260), p(520, 340)] },
      { ...base, id: "text", type: "text", points: [p(560, 250)], text: "日本語 مرحبا 😀 café – naïve", fontSize: 24 },
      { ...base, id: "long", type: "rectangle", points: [p(0, 440), p(260, 560)], fill: "#ede9fe", label: "Supercalifragilisticexpialidocious and then some more words that wrap across many lines" },
      { ...base, id: "ortho", type: "arrow", points: [p(220, 60), p(300, 60), p(300, 20), p(400, 20)], arrowHeadEnd: true, routingMode: "orthogonal", color: "#64748b", startConnection: { elementId: "rect" }, endConnection: { elementId: "circle" } },
      { ...base, id: "straight", type: "arrow", points: [p(460, 60), p(540, 60)], arrowHeadEnd: true, dashed: true, routingMode: "straight", color: "#64748b", startConnection: { elementId: "circle" }, endConnection: { elementId: "diamond" } },
      { ...base, id: "both", type: "arrow-bidirectional", points: [p(80, 360), p(80, 440)], arrowHeadStart: true, arrowHeadEnd: true, color: "#64748b" },
    ];
  },
  async run(elements, selectedIds, options) {
    const r = await T.exportScene({ elements, selectedIds, options: { format: "png", scale: 1, transparent: false, selectionOnly: false, ...options } });
    return r;
  },
  async b64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  async pixels(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1, ringAlpha = 0, ink = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const a = d[(y * c.width + x) * 4 + 3];
      if (a > 0) { ink++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      if ((x < 6 || y < 6 || x >= c.width - 6 || y >= c.height - 6) && a > ringAlpha) ringAlpha = a;
    }
    return { width: bmp.width, height: bmp.height, corner: Array.from(d.slice(0, 4)), ink, minX, minY, maxX, maxY, ringAlpha };
  },
};
`;

suite("export in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("PNG at 1x/2x/3x has the scaled size, and the board stays untouched", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const elements = H.fixture("architecture");
      const before = JSON.stringify(elements);
      const out: Array<{ scale: number; width: number; height: number; css: [number, number]; ring: number }> = [];
      for (const scale of [1, 2, 3] as const) {
        const res = await H.run(elements, [], { scale });
        const px = await H.pixels(res.blob);
        out.push({ scale, width: px.width, height: px.height, css: [res.width, res.height], ring: px.ringAlpha });
      }
      return { out, untouched: JSON.stringify(elements) === before };
    });
    expect(r.untouched).toBe(true);
    for (const o of r.out) {
      expect(o.width).toBe(Math.ceil(o.css[0] * o.scale));
      expect(o.height).toBe(Math.ceil(o.css[1] * o.scale));
      expect(o.ring, "opaque background all the way to the edge").toBe(255);
    }
    expect(r.out[1].width / r.out[0].width).toBeCloseTo(2, 1);
    expect(r.out[2].width / r.out[0].width).toBeCloseTo(3, 1);
  });

  it("a transparent PNG has alpha 0 in the margin and real ink inside, with nothing touching the edge", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const res = await H.run(H.mixed(), [], { scale: 2, transparent: true });
      const px = await H.pixels(res.blob);
      return { px, pad: window.T.EXPORT_PADDING };
    });
    expect(r.px.corner[3]).toBe(0);
    expect(r.px.ringAlpha, "the outer 6px ring is empty").toBe(0);
    expect(r.px.ink).toBeGreaterThan(5000);
    // Ink starts about one padding in from every edge (stroke and text included), never at the edge.
    const pad = r.pad * 2;
    expect(r.px.minX).toBeGreaterThanOrEqual(pad - 8);
    expect(r.px.minX).toBeLessThanOrEqual(pad + 2);
    expect(r.px.minY).toBeGreaterThanOrEqual(pad - 8);
    expect(r.px.minY).toBeLessThanOrEqual(pad + 2);
    expect(r.px.width - 1 - r.px.maxX).toBeGreaterThanOrEqual(pad - 8);
    expect(r.px.height - 1 - r.px.maxY).toBeGreaterThanOrEqual(pad - 8);
  });

  it("an opaque PNG is white where nothing is drawn", async () => {
    const px = await s.page.evaluate(async () => {
      const H = window.H;
      return H.pixels((await H.run(H.mixed(), [], { transparent: false })).blob);
    });
    expect(px.corner).toEqual([255, 255, 255, 255]);
  });

  it("SVG parses as XML, has no script or external references, and keeps every label", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const res = await H.run(H.mixed(), [], { format: "svg" });
      const text = await res.blob.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      return {
        text,
        error: doc.querySelector("parsererror")?.textContent ?? null,
        type: res.blob.type,
        width: doc.documentElement.getAttribute("width"),
        viewBox: doc.documentElement.getAttribute("viewBox"),
        texts: [...doc.querySelectorAll("text")].map((t) => t.textContent),
        forbidden: doc.querySelectorAll("script,image,foreignObject,use,[href],[xlink\\:href],[onload]").length,
        size: [res.width, res.height],
      };
    });
    save("mixed.svg", Buffer.from(r.text).toString("base64"));
    expect(r.error).toBeNull();
    expect(r.type).toBe("image/svg+xml;charset=utf-8");
    expect(r.forbidden).toBe(0);
    expect(r.text).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(r.viewBox!.split(" ").map(Number)[2]).toBe(r.size[0]);
    expect(Number(r.width)).toBe(r.size[0]);
    const all = r.texts.join("|");
    expect(all).toContain("日本語 مرحبا 😀 café – naïve");
    // A line of words is one element, so it can be selected and searched as a unit.
    expect(r.texts).toContain("Line one");
    expect(r.texts).toContain("Line two");
    expect(all).toContain("Circle");
    expect(all).toContain("Ready");
    expect(all).toContain("Supercalifragilisticexpialidocious");
  });

  it("the SVG draws the same picture as the PNG (same renderer), within font-hinting noise", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = H.fixture("architecture");
      const png = await H.run(els, [], { scale: 1 });
      const svg = await H.run(els, [], { scale: 1, format: "svg" });
      return { svg: await svg.blob.text(), png: await H.b64(png.blob), w: png.width, h: png.height };
    });
    save("architecture.png", r.png);
    save("architecture.svg", Buffer.from(r.svg).toString("base64"));
    // Rasterise the SVG inline (so the page's Inter applies) with a real screenshot, then compare to the PNG.
    await s.page.setViewportSize({ width: r.w + 20, height: r.h + 20 });
    await s.page.evaluate((svg) => {
      const host = document.createElement("div");
      host.id = "host";
      host.style.cssText = "position:absolute;left:0;top:0;line-height:0";
      host.innerHTML = svg.replace(/^<\?xml[^>]*>\s*/, "");
      document.body.appendChild(host);
    }, r.svg);
    const shot = (await s.page.locator("#host").screenshot()).toString("base64");
    save("architecture-svg-screenshot.png", shot);
    const diff = await s.page.evaluate(
      async ({ shot, png }) => {
        const load = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height);
        };
        const a = await load(shot);
        const b = await load(png);
        let differing = 0;
        let inked = 0;
        for (let i = 0; i < b.data.length; i += 4) {
          const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
          if (b.data[i] < 250 || a.data[i] < 250) inked += 1;
          if (d > 96) differing += 1;
        }
        return { sizeA: [a.width, a.height], sizeB: [b.width, b.height], differing, inked };
      },
      { shot, png: r.png },
    );
    await s.page.evaluate(() => document.getElementById("host")?.remove());
    console.log(`svg-vs-png: ${diff.differing} of ${diff.inked} inked pixels differ (${((100 * diff.differing) / diff.inked).toFixed(2)}%)`);
    expect(diff.sizeA).toEqual(diff.sizeB);
    expect(diff.inked).toBeGreaterThan(1000);
    // Measured 0.00% (0 of ~247,600 inked pixels differ by more than 96/255); a missing shape or label would be far larger.
    expect(diff.differing / diff.inked).toBeLessThan(0.01);
  });

  it("selection-only exports the picked nodes and the connectors between them, with tight bounds", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = H.fixture("flowchart");
      const nodes = els.filter((e) => e.ai?.role === "node");
      const arrows = els.filter((e) => e.type === "arrow");
      const a = nodes[0];
      const edge = arrows.find((x) => x.startConnection?.elementId === a.id)!;
      const b = nodes.find((n) => n.id === edge.endConnection?.elementId)!;
      const full = await H.run(els, [], {});
      const picked = await H.run(els, [a.id, b.id], { selectionOnly: true, format: "svg" });
      const text = await picked.blob.text();
      const policy = window.T.elementsForSelectionExport(els, [a.id, b.id]).map((e) => e.id);
      return { full: [full.width, full.height], picked: [picked.width, picked.height], policy, expect: [a.id, b.id, edge.id], svgTexts: (text.match(/<text /g) ?? []).length };
    });
    expect(r.picked[0] * r.picked[1]).toBeLessThan(r.full[0] * r.full[1]);
    for (const id of r.expect) expect(r.policy).toContain(id);
    expect(r.svgTexts).toBeGreaterThanOrEqual(2);
  });

  it("selection-only with nothing selected fails with a clear error and does not throw an unhandled one", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      try {
        await H.run(H.mixed(), [], { selectionOnly: true });
        return null;
      } catch (e) {
        return { name: (e as Error).name, code: (e as { code?: string }).code, message: (e as Error).message };
      }
    });
    expect(r).toMatchObject({ name: "ExportError", code: "no-selection" });
  });

  it("an empty board reports that there is nothing to export", async () => {
    const r = await s.page.evaluate(async () => {
      try {
        await window.H.run([], [], {});
        return null;
      } catch (e) {
        return (e as { code?: string }).code;
      }
    });
    expect(r).toBe("nothing-to-export");
  });

  it("the result does not depend on the page theme or the screen density", async () => {
    const fingerprint = async (dark: boolean) =>
      s.page.evaluate(async (dark) => {
        document.documentElement.classList.toggle("dark", dark);
        const H = window.H;
        const res = await H.run(H.fixture("auth-flow"), [], { scale: 2, format: "svg" });
        document.documentElement.classList.remove("dark");
        return res.blob.text();
      }, dark);
    const light = await fingerprint(false);
    const dark = await fingerprint(true);
    expect(dark).toBe(light);
    const dpr2 = await openPage({ font: "inter", deviceScaleFactor: 2 });
    try {
      await dpr2.page.addScriptTag({ content: HELPERS });
      const text = await dpr2.page.evaluate(async () => (await window.H.run(window.H.fixture("auth-flow"), [], { scale: 2, format: "svg" })).blob.text());
      expect(text).toBe(light);
    } finally {
      await dpr2.close();
    }
  });

  it("icons are exported as vector glyphs, not text badges", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = H.fixture("architecture");
      const svg = await (await H.run(els, [], { format: "svg" })).blob.text();
      const nodes = els.filter((e) => e.type === "semantic-node").length;
      return { svg, nodes, roundStrokes: (svg.match(/stroke-linecap="round"/g) ?? []).length };
    });
    expect(r.nodes).toBeGreaterThan(5);
    expect(r.roundStrokes).toBeGreaterThanOrEqual(r.nodes);
  });

  it("an edited semantic node exports what the canvas shows: the replaced icon, the chosen colour, a hidden icon gone, and always in the light theme", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const base = { type: "semantic-node", color: "#1f2937", strokeWidth: 2, fill: "#eef2ff", fontSize: 17, fontWeight: "600" };
      const els = [
        { ...base, id: "a", label: "Orders", points: [{ x: 0, y: 0 }, { x: 168, y: 78 }], ai: { icon: "database" }, nodeStyle: { originalIcon: "queue" } },
        { ...base, id: "b", label: "Coloured", points: [{ x: 0, y: 120 }, { x: 168, y: 198 }], ai: { icon: "database" }, nodeStyle: { iconColor: "#dc2626", iconSize: 48 } },
        { ...base, id: "c", label: "No icon", points: [{ x: 0, y: 240 }, { x: 168, y: 318 }], ai: { icon: "database" }, nodeStyle: { iconHidden: true } },
        { ...base, id: "d", label: "Stacked", points: [{ x: 220, y: 0 }, { x: 330, y: 130 }], ai: { icon: "queue" } },
        { ...base, id: "e", label: "Legacy", points: [{ x: 220, y: 160 }, { x: 388, y: 238 }] },
        { ...base, id: "f", label: "No fill", fill: undefined, points: [{ x: 220, y: 280 }, { x: 388, y: 358 }], ai: { icon: "user" } },
      ];
      document.documentElement.classList.add("dark");
      try {
        const svg = await (await H.run(els, [], { format: "svg" })).blob.text();
        const png = await H.run(els, [], { format: "png", scale: 1 });
        const light = await (await H.run(els, [], { format: "svg" })).blob.text();
        const glyph = (id: string) => window.T.listIcons().find((icon) => icon.id === id)!.paths[0];
        return { svg, light, pngSize: png.blob.size, database: glyph("database"), queue: glyph("queue") };
      } finally {
        document.documentElement.classList.remove("dark");
      }
    });
    // The database glyph appears for a and b, not for c (hidden); the queue glyph only for d.
    expect(r.svg.split(`d="${r.database}"`).length - 1).toBe(2);
    expect(r.svg.split(`d="${r.queue}"`).length - 1).toBe(1);
    expect(r.svg).toContain('stroke="#dc2626"'); // b's chosen icon colour
    expect(r.svg).toContain("No icon");
    expect(r.svg).toContain("Stacked");
    // The same board exported in the dark and in the light page theme is identical: exports are always light.
    expect(r.svg).toBe(r.light);
    // A node with no fill exports with a dark border and label, not the lightened ones the dark canvas uses.
    expect(r.svg).toMatch(/stroke="#1f2937"/);
    expect(r.pngSize).toBeGreaterThan(500);
  });

  it("a bare icon with a caption exports as SVG, PNG and PDF, with its caption text", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = [
        { id: "i1", type: "icon", points: [{ x: 0, y: 0 }, { x: 96, y: 100 }], color: "#334155", strokeWidth: 2, label: "Customers", fontSize: 14, fontWeight: "600", ai: { icon: "user", role: "node", semanticId: "c" } },
      ];
      const svg = await (await H.run(els, [], { format: "svg" })).blob.text();
      const png = await H.run(els, [], { format: "png", scale: 1 });
      const pdf = await H.run(els, [], { format: "pdf", scale: 1 });
      return { svg, pngSize: png.blob.size, pdfSize: pdf.blob.size };
    });
    expect(r.svg).toContain("Customers");
    expect(r.svg).toContain('stroke-linecap="round"');
    expect(r.pngSize).toBeGreaterThan(200);
    expect(r.pdfSize).toBeGreaterThan(200);
  });

  it("refuses an oversized raster with a message, but still exports the same board as SVG", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = [
        { id: "a", type: "rectangle", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: "#000", strokeWidth: 2 },
        { id: "b", type: "rectangle", points: [{ x: 40000, y: 0 }, { x: 40100, y: 100 }], color: "#000", strokeWidth: 2 },
      ];
      let code: string | undefined, message = "";
      try { await H.run(els, [], { scale: 1 }); } catch (e) { code = (e as { code?: string }).code; message = (e as Error).message; }
      const svg = await H.run(els, [], { format: "svg" });
      return { code, message, svgWidth: svg.width };
    });
    expect(r.code).toBe("too-large");
    expect(r.message).toMatch(/limit/);
    expect(r.svgWidth).toBeGreaterThan(40000);
  });

  it("copies a PNG to the clipboard when allowed, and reports a clear error when it is not", async () => {
    const context = s.page.context();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const ok = await s.page.evaluate(async () => {
      const H = window.H;
      window.focus();
      try {
        await window.T.copyPngToClipboard(H.run(H.mixed(), [], { scale: 1 }).then((r) => r.blob));
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType("image/png");
        const px = await H.pixels(blob);
        return { type: blob.type, width: px.width };
      } catch (e) {
        return { error: `${(e as { code?: string }).code}: ${(e as Error).message}` };
      }
    });
    expect(ok, JSON.stringify(ok)).toMatchObject({ type: "image/png" });
    expect((ok as { width: number }).width).toBeGreaterThan(100);

    // Chrome allows clipboard-write by default, so a real denial cannot be provoked here: make the API
    // reject exactly as a denial does (NotAllowedError) and check the mapping to a user-facing error.
    const failures = await s.page.evaluate(async () => {
      const png = () => window.H.run(window.H.mixed(), [], {}).then((r) => r.blob);
      const code = async () => {
        try {
          await window.T.copyPngToClipboard(png());
          return "copied";
        } catch (e) {
          return (e as { code?: string }).code;
        }
      };
      const real = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
      const denied = await code();
      navigator.clipboard.write = () => Promise.reject(new TypeError("boom"));
      const broken = await code();
      navigator.clipboard.write = real;
      const item = window.ClipboardItem;
      (window as unknown as { ClipboardItem?: unknown }).ClipboardItem = undefined;
      const unsupported = await code();
      window.ClipboardItem = item;
      return { denied, broken, unsupported };
    });
    expect(failures).toEqual({ denied: "clipboard-denied", broken: "render-failed", unsupported: "clipboard-unsupported" });
  });

  it("Copy SVG puts the same markup on the clipboard as the SVG export, and it parses as XML", async () => {
    await s.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const els = H.mixed();
      const direct = await (await H.run(els, [], { format: "svg", scale: 1 })).blob.text();
      await window.T.copySvgToClipboard(H.run(els, [], { format: "svg", scale: 1 }).then((x) => x.blob.text()));
      const copied = await navigator.clipboard.readText();
      const doc = new DOMParser().parseFromString(copied, "image/svg+xml");
      return { same: copied === direct, length: copied.length, error: doc.querySelector("parsererror")?.textContent ?? null, root: doc.documentElement.nodeName };
    });
    expect(r.same).toBe(true);
    expect(r.length).toBeGreaterThan(1000);
    expect(r.error).toBeNull();
    expect(r.root).toBe("svg");
  });

  it("a failed SVG copy maps to a clear error", async () => {
    const codes = await s.page.evaluate(async () => {
      const svg = () => Promise.resolve("<svg xmlns='http://www.w3.org/2000/svg'/>");
      const code = async () => {
        try {
          await window.T.copySvgToClipboard(svg());
          return "copied";
        } catch (e) {
          return (e as { code?: string }).code;
        }
      };
      const real = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
      const denied = await code();
      navigator.clipboard.writeText = () => Promise.reject(new TypeError("boom"));
      const broken = await code();
      (navigator.clipboard as unknown as { writeText?: unknown }).writeText = undefined;
      const unsupported = await code();
      navigator.clipboard.writeText = real;
      return { denied, broken, unsupported };
    });
    expect(codes).toEqual({ denied: "clipboard-denied", broken: "render-failed", unsupported: "clipboard-unsupported" });
  });

  it("PDF is a valid one-page file whose image decodes to the diagram, on a white page", async () => {
    const r = await s.page.evaluate(async () => {
      const H = window.H;
      const res = await H.run(H.mixed(), [], { format: "pdf", scale: 2, transparent: true });
      const bytes = new Uint8Array(await res.blob.arrayBuffer());
      const text = new TextDecoder("latin1").decode(bytes);
      const lengthMatch = /\/Width (\d+) \/Height (\d+)[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(text)!;
      const streamStart = text.indexOf("stream\n", lengthMatch.index) + 7;
      const flate = bytes.slice(streamStart, streamStart + Number(lengthMatch[3]));
      const raw = new Uint8Array(await new Response(new Blob([flate]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
      const media = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)!;
      return {
        b64: await H.b64(res.blob),
        header: text.slice(0, 8),
        pages: (text.match(/\/Type \/Page /g) ?? []).length,
        w: Number(lengthMatch[1]), h: Number(lengthMatch[2]),
        rawLength: raw.length,
        corner: Array.from(raw.slice(0, 3)),
        nonWhite: raw.reduce((n, v, i) => (i % 3 === 0 && v < 200 ? n + 1 : n), 0),
        media: [Number(media[1]), Number(media[2])],
        css: [res.width, res.height],
      };
    });
    save("mixed.pdf", r.b64);
    expect(r.header).toBe("%PDF-1.4");
    expect(r.pages).toBe(1);
    expect(r.rawLength).toBe(r.w * r.h * 3);
    expect(r.corner).toEqual([255, 255, 255]);
    expect(r.nonWhite).toBeGreaterThan(1000);
    expect(r.media[0]).toBeCloseTo(r.css[0] * 0.75, 1);
    expect(r.media[1]).toBeCloseTo(r.css[1] * 0.75, 1);
    expect(r.w).toBe(Math.ceil(r.css[0] * 2));
  });

  it("a large board exports without freezing the page", async () => {
    const r = await s.page.evaluate(async () => {
      const els: Array<Record<string, unknown>> = [];
      const cols = 40;
      for (let i = 0; i < 1200; i++) {
        const x = (i % cols) * 220, y = Math.floor(i / cols) * 120;
        els.push({ id: `n${i}`, type: i % 7 === 0 ? "diamond" : "rectangle", points: [{ x, y }, { x: x + 180, y: y + 80 }], color: "#1f2937", strokeWidth: 2, fill: "#eef2ff", label: `Service ${i} handles requests` });
        if (i % cols) els.push({ id: `e${i}`, type: "arrow", points: [{ x: x - 40, y: y + 40 }, { x, y: y + 40 }], arrowHeadEnd: true, color: "#64748b", strokeWidth: 2, routingMode: "straight" });
      }
      let worstGap = 0, last = performance.now(), stop = false;
      const beat = () => { const now = performance.now(); worstGap = Math.max(worstGap, now - last); last = now; if (!stop) setTimeout(beat, 0); };
      beat();
      const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      const before = heap();
      const t0 = performance.now();
      const svg = await window.H.run(els, [], { format: "svg" });
      const t1 = performance.now();
      const png = await window.H.run(els, [], { scale: 1 });
      const t2 = performance.now();
      stop = true;
      const px = await window.H.pixels(png.blob);
      return { count: els.length, svgMs: Math.round(t1 - t0), pngMs: Math.round(t2 - t1), worstGap: Math.round(worstGap), svgKB: Math.round(svg.blob.size / 1024), pngKB: Math.round(png.blob.size / 1024), px: [px.width, px.height], heapGrowthMB: Math.round((heap() - before) / 1048576) };
    });
    console.log("large board:", JSON.stringify(r));
    expect(r.px[0]).toBeGreaterThan(8000);
    // Drawing yields to the event loop every ~12 ms; a frozen page would show a gap of seconds.
    expect(r.worstGap).toBeLessThan(500);
  });
});

suite("export security and limits in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("hostile board content cannot add script, handlers or external references to an SVG", async () => {
    const r = await s.page.evaluate(async () => {
      const w = window as unknown as { __pwned?: boolean };
      const evil = '<script>window.__pwned=1</script>"><img src=x onerror="window.__pwned=1">';
      const p = (x: number, y: number) => ({ x, y });
      const els = [
        { id: "a", type: "rectangle", points: [p(0, 0), p(300, 120)], color: 'red" onload="window.__pwned=1', strokeWidth: 2, fill: "url(javascript:window.__pwned=1)", label: evil },
        { id: "b", type: "text", points: [p(0, 200)], text: `${evil}\u0000\u0007 \uD800 😀`, fontSize: 18, color: "#000", strokeWidth: 1, fontStyle: 'italic" onclick="window.__pwned=1' },
        { id: "c", type: "rectangle", points: [p(0, 300), p(100, 400)], color: "#000", strokeWidth: 2, fill: "javascript:alert(1)", label: '1 < 2 && 3 > 2 & "quoted"' },
      ];
      const res = await window.T.exportScene({
        elements: els as never,
        selectedIds: [],
        options: { format: "svg", scale: 1, transparent: false, selectionOnly: false },
        title: "</title><script>window.__pwned=1</script>",
      });
      const text = await res.blob.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const host = document.createElement("div");
      host.innerHTML = text.replace(/^<\?xml[^>]*>\s*/, "");
      document.body.appendChild(host);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const attrs = [...doc.querySelectorAll("*")].flatMap((e) => [...e.attributes].map((a) => a.name));
      const result = {
        text,
        parseError: doc.querySelector("parsererror")?.textContent ?? null,
        scripts: doc.querySelectorAll("script,foreignObject,image,use,iframe").length,
        handlerAttrs: attrs.filter((n) => n.toLowerCase().startsWith("on")),
        hrefAttrs: attrs.filter((n) => /href/i.test(n)),
        pwned: w.__pwned === true || (w.__pwned as unknown) === 1,
        texts: [...doc.querySelectorAll("text")].map((t) => t.textContent ?? ""),
      };
      host.remove();
      return result;
    });
    expect(r.parseError).toBeNull();
    expect(r.scripts).toBe(0);
    expect(r.handlerAttrs).toEqual([]);
    expect(r.hrefAttrs).toEqual([]);
    expect(r.pwned).toBe(false);
    expect(r.text).not.toMatch(/javascript:/i);
    // The only url() references are the file's own clip paths.
    const urls = r.text.match(/url\([^)]*\)/gi) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => /^url\(#clip\d+\)$/.test(u))).toBe(true);
    // Only the editor's own tags are treated as markup; anything else, hostile or not, is drawn as the text
    // it is (escaped in the file, plain text when parsed), so the hostile strings are visible and inert.
    const shown = r.texts.join("");
    expect(shown.replace(/\s+/g, "")).toContain("<script>window.__pwned=1</script>");
    // (A label wraps inside its box and a wrap drops the space, so compare without whitespace.)
    expect(shown.replace(/\s+/g, "")).toContain('1<2&&3>2&"quoted"');
    expect(shown).toContain("😀");
  });

  it("a selection export does not contain the text of anything unselected", async () => {
    const r = await s.page.evaluate(async () => {
      const p = (x: number, y: number) => ({ x, y });
      const box = (id: string, x: number, label: string) => ({ id, type: "rectangle", points: [p(x, 0), p(x + 100, 60)], color: "#000", strokeWidth: 2, label });
      const els = [box("a", 0, "PUBLIC-A"), box("b", 200, "PUBLIC-B"), box("c", 400, "SECRET-C")];
      const res = await window.H.run(els, ["a", "b"], { selectionOnly: true, format: "svg" });
      return res.blob.text();
    });
    expect(r).toContain("PUBLIC-A");
    expect(r).toContain("PUBLIC-B");
    expect(r).not.toContain("SECRET-C");
  });

  it("limits a PDF more tightly than a PNG, with a message", async () => {
    const r = await s.page.evaluate(async () => {
      const p = (x: number, y: number) => ({ x, y });
      const els = [
        { id: "a", type: "rectangle", points: [p(0, 0), p(10, 10)], color: "#000", strokeWidth: 2 },
        { id: "b", type: "rectangle", points: [p(5000, 3000), p(5010, 3010)], color: "#000", strokeWidth: 2 },
      ];
      const attempt = async (format: "png" | "pdf") => {
        try {
          await window.H.run(els, [], { format, scale: 2 });
          return "ok";
        } catch (e) {
          return (e as { code?: string }).code ?? "other";
        }
      };
      // About 10,000 x 6,000 px at 2x is 60 megapixels: under the PNG limit, over the PDF limit.
      return { png: await attempt("png"), pdf: await attempt("pdf") };
    });
    expect(r).toEqual({ png: "ok", pdf: "too-large" });
  });

  it("the exported PNG canvas is never tainted (toBlob works and the picture has ink)", async () => {
    const px = await s.page.evaluate(async () => {
      const H = window.H;
      return H.pixels((await H.run(H.fixture("architecture"), [], { scale: 1 })).blob);
    });
    expect(px.ink).toBeGreaterThan(10_000);
  });

  it("cancelling stops an export and reports it, without leaving the page stuck", async () => {
    const r = await s.page.evaluate(async () => {
      const els: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 4000; i++) els.push({ id: `n${i}`, type: "rectangle", points: [{ x: (i % 60) * 120, y: Math.floor(i / 60) * 80 }, { x: (i % 60) * 120 + 100, y: Math.floor(i / 60) * 80 + 60 }], color: "#000", strokeWidth: 2, label: `Item ${i}` });
      const controller = new AbortController();
      const started = window.T.exportScene({ elements: els as never, selectedIds: [], options: { format: "png", scale: 1, transparent: false, selectionOnly: false }, signal: controller.signal });
      setTimeout(() => controller.abort(), 20);
      try {
        await started;
        return "finished";
      } catch (e) {
        return (e as { code?: string }).code ?? (e as Error).name;
      }
    });
    expect(r).toBe("cancelled");
  });
});
