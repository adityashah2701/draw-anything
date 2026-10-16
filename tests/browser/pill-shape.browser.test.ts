import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;
// Set SAVE_PILL_DIR=<dir> to keep a picture of the flowchart for visual inspection.
const OUT_DIR = process.env.SAVE_PILL_DIR;

const CODE = [
  "type flowchart",
  "Start [kind: start]",
  "Enter credentials [kind: workflow]",
  "Valid? [kind: decision]",
  "Customer submits the request and waits for confirmation by email [kind: end]",
  "Dashboard [kind: end]",
  "Locked out [shape: pill, color: red]",
  "Start > Enter credentials > Valid?",
  "Valid? > Dashboard: yes",
  "Valid? > Locked out: no",
  "Locked out > Customer submits the request and waits for confirmation by email",
].join("\n");

suite("pill (start/end) nodes in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("the label's pixels stay inside the pill outline, at 1x and 2x zoom, for short and very long labels", async () => {
    const results = await s.page.evaluate((code) => {
      const T = window.T;
      const { elements } = T.elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
      const pills = elements.filter((e) => e.type === "pill");
      const out: Array<{ label: string; zoom: number; textPixels: number; outside: number; minInset: number; box: [number, number] }> = [];
      for (const zoom of [1, 2]) {
        for (const pill of pills) {
          const [a, b] = pill.points;
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          const pad = 20;
          const draw = (withLabel: boolean) => {
            const c = document.createElement("canvas");
            c.width = Math.ceil((w + pad * 2) * zoom);
            c.height = Math.ceil((h + pad * 2) * zoom);
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            const el = { ...pill, label: withLabel ? pill.label : undefined, fill: "#ffffff" };
            T.drawElement(ctx, el, false, { zoom, panOffset: { x: (pad - Math.min(a.x, b.x)) * zoom, y: (pad - Math.min(a.y, b.y)) * zoom }, getElementBounds: (e) => T.getShapeBounds(e) });
            return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
          };
          const withText = draw(true);
          const bare = draw(false);
          const r = Math.min(w, h) / 2;
          let textPixels = 0;
          let outside = 0;
          let minInset = Infinity;
          for (let y = 0; y < withText.height; y++) {
            for (let x = 0; x < withText.width; x++) {
              const i = (y * withText.width + x) * 4;
              const diff = Math.abs(withText.data[i] - bare.data[i]) + Math.abs(withText.data[i + 1] - bare.data[i + 1]) + Math.abs(withText.data[i + 2] - bare.data[i + 2]);
              if (diff < 60) continue;
              textPixels++;
              // world position of this pixel relative to the pill's top-left corner
              const px = x / zoom - pad;
              const py = y / zoom - pad;
              const capCentre = px < r ? r : px > w - r ? w - r : px;
              const dist = Math.hypot(px - capCentre, py - h / 2);
              minInset = Math.min(minInset, r - dist);
              if (dist > r - 1) outside++;
            }
          }
          out.push({ label: pill.label ?? "", zoom, textPixels, outside, minInset: Math.round(minInset * 10) / 10, box: [w, h] });
        }
      }
      return out;
    }, CODE);
    expect(results.length).toBe(8); // 4 pills x 2 zoom levels
    for (const r of results) {
      expect(r.textPixels, `${r.label} @${r.zoom}x has visible text`).toBeGreaterThan(30);
      expect(r.outside, `${r.label} @${r.zoom}x: text pixels outside the outline`).toBe(0);
      expect(r.minInset, `${r.label} @${r.zoom}x: closest text pixel to the edge (units)`).toBeGreaterThan(2);
    }
  });

  it("connectors start and end on the pill's edge midpoints, and ink is drawn there", async () => {
    const r = await s.page.evaluate((code) => {
      const T = window.T;
      const { elements } = T.elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
      const pills = elements.filter((e) => e.type === "pill");
      const arrows = elements.filter((e) => e.type === "arrow") as Array<{ startConnection?: { elementId: string }; endConnection?: { elementId: string }; points: Array<{ x: number; y: number }> }>;
      // The router snaps connector points to whole units, and the layout places nodes at fractional
      // coordinates, so "on the midpoint" means within half a unit.
      const mids = (p: (typeof pills)[number]) => {
        const [a, b] = p.points;
        return [[(a.x + b.x) / 2, Math.min(a.y, b.y)], [Math.max(a.x, b.x), (a.y + b.y) / 2], [(a.x + b.x) / 2, Math.max(a.y, b.y)], [Math.min(a.x, b.x), (a.y + b.y) / 2]];
      };
      const onMidpoint = (p: (typeof pills)[number], e: { x: number; y: number }) => mids(p).some(([x, y]) => Math.abs(x - e.x) <= 0.5 && Math.abs(y - e.y) <= 0.5);
      let checked = 0;
      let off = 0;
      for (const pill of pills) {
        for (const arrow of arrows) {
          const ends: Array<{ x: number; y: number }> = [];
          if (arrow.startConnection?.elementId === pill.id) ends.push(arrow.points[0]);
          if (arrow.endConnection?.elementId === pill.id) ends.push(arrow.points[arrow.points.length - 1]);
          for (const e of ends) {
            checked++;
            if (!onMidpoint(pill, e)) off++;
          }
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const pts = elements.flatMap((el) => el.points);
      const pan = { x: 50 - Math.min(...pts.map((p) => p.x)), y: 50 - Math.min(...pts.map((p) => p.y)) };
      for (const el of elements) T.drawElement(ctx, el, false, { zoom: 1, panOffset: pan, getElementBounds: (x) => T.getShapeBounds(x) });
      let withoutInk = 0;
      for (const pill of pills) {
        for (const arrow of arrows) {
          for (const e of [arrow.startConnection?.elementId === pill.id ? arrow.points[0] : null, arrow.endConnection?.elementId === pill.id ? arrow.points[arrow.points.length - 1] : null]) {
            if (!e) continue;
            const d = ctx.getImageData(Math.round(e.x + pan.x) - 3, Math.round(e.y + pan.y) - 3, 7, 7).data;
            if (!d.some((v, i) => i % 4 === 3 && v > 100)) withoutInk++;
          }
        }
      }
      return { pills: pills.length, checked, off, withoutInk };
    }, CODE);
    expect(r.pills).toBe(4);
    expect(r.checked).toBeGreaterThanOrEqual(4);
    expect(r.off).toBe(0);
    expect(r.withoutInk).toBe(0);
  });

  it("hit-testing agrees with what is drawn: the middle hits, the square corner does not", async () => {
    const r = await s.page.evaluate((code) => {
      const T = window.T;
      const { elements } = T.elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
      const pill = elements.find((e) => e.type === "pill")!;
      const [a, b] = pill.points;
      const [minX, minY] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
      return { middle: T.shapeContainsPoint(pill, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), corner: T.shapeContainsPoint(pill, { x: minX + 1, y: minY + 1 }) };
    }, CODE);
    expect(r).toEqual({ middle: true, corner: false });
  });

  it("exports to SVG as rounded paths with its text, and the SVG parses", async () => {
    const r = await s.page.evaluate(async (code) => {
      const { elements } = window.T.elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
      const res = await window.T.exportScene({ elements, selectedIds: [], options: { format: "svg", scale: 1, transparent: false, selectionOnly: false } });
      const text = await res.blob.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const arcPaths = [...doc.querySelectorAll("path")].filter((p) => /A\d/.test(p.getAttribute("d") ?? "")).length;
      return { error: doc.querySelector("parsererror")?.textContent ?? null, arcPaths, text: [...doc.querySelectorAll("text")].map((t) => t.textContent).join("") };
    }, CODE);
    expect(r.error).toBeNull();
    // Each pill is one fill and one stroke path made of arcs (a diamond and the semantic node add their own).
    expect(r.arcPaths).toBeGreaterThanOrEqual(6);
    expect(r.text.replace(/\s+/g, "")).toContain("Start");
    expect(r.text.replace(/\s+/g, "")).toContain("Dashboard");
  });

  it("renders the whole flowchart (kept as a picture when SAVE_PILL_DIR is set)", async () => {
    const b64 = await s.page.evaluate(async (code) => {
      const { elements } = window.T.elementsFromDiagramCode(code, { generationId: "g", frameId: "f" });
      const res = await window.T.exportScene({ elements, selectedIds: [], options: { format: "png", scale: 2, transparent: false, selectionOnly: false } });
      const bytes = new Uint8Array(await res.blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, CODE);
    expect(b64.length).toBeGreaterThan(5000);
    if (OUT_DIR) {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(`${OUT_DIR}/flowchart-pills.png`, Buffer.from(b64, "base64"));
    }
  });
});
