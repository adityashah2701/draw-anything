import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FONT_MODES, findChrome, openPage, type BrowserSession, type FontMode } from "./harness";
import { inkBox, maxDelta } from "./page-helpers";

const suite = findChrome() ? describe : describe.skip;

interface LabelCase {
  name: string;
  type: "rectangle" | "semantic-node";
  label: string;
  w: number;
  h: number;
  fontSize?: number;
  fontWeight?: string;
  /** Line breaks depend on text width, which is not linear in font size for system fonts. */
  wrapSensitive?: boolean;
}

const CASES: LabelCase[] = [
  { name: "short rectangle label", type: "rectangle", label: "Hello", w: 200, h: 80, fontSize: 16 },
  { name: "wrapped rectangle label", type: "rectangle", label: "Authentication service gateway", w: 180, h: 110, fontSize: 18, wrapSensitive: true },
  { name: "label shrunk to fit (weight must not change)", type: "rectangle", label: "Authentication service gateway cluster", w: 150, h: 70, fontSize: 20, wrapSensitive: true },
  { name: "semantic node, one line", type: "semantic-node", label: "Database", w: 240, h: 78, fontSize: 17, fontWeight: "600" },
  { name: "semantic node, two lines", type: "semantic-node", label: "Authentication service gateway", w: 200, h: 78, fontSize: 17, fontWeight: "600", wrapSensitive: true },
  { name: "explicit newline", type: "rectangle", label: "Line one\nLine two", w: 200, h: 100, fontSize: 16 },
];
const ZOOMS = [0.5, 1, 2];
// One pixel for Chrome snapping DOM baselines to whole pixels (canvas draws at fractions) plus one for
// the antialiased glyph edge at the ink threshold.
const TOLERANCE_PX = 2

type Arg = { c: LabelCase; zoom: number };

for (const font of FONT_MODES) suite(`shape label: canvas drawing vs the DOM editor (${font} font)`, () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: font as FontMode });
  });
  afterAll(async () => {
    await s?.close();
  });

  const region = (c: LabelCase) => ({ minX: 60, minY: 40, maxX: 60 + c.w, maxY: 40 + c.h, width: c.w, height: c.h });

  for (const c of CASES) {
    for (const zoom of ZOOMS) {
      // With a system font the DOM re-wraps at screen size and can break lines differently from the
      // zoom-independent canvas layout; only a font with linear metrics (Inter) can promise equality.
      const run = font === "inter" || !c.wrapSensitive ? it : it.skip;
      run(`${c.name} @ ${zoom}x lands on the same pixels`, async () => {
        await s.page.evaluate(
          ({ c, zoom, b }: Arg & { b: ReturnType<typeof region> }) => {
            const T = window.T;
            document.body.innerHTML = "";
            const canvas = document.createElement("canvas");
            canvas.width = 900;
            canvas.height = 600;
            canvas.style.cssText = "position:absolute;left:0;top:0";
            document.body.appendChild(canvas);
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, 900, 600);
            const r = T.getShapeLabelRegion(c.type, b);
            T.renderShapeLabel({
              ctx,
              label: c.label,
              centerX: r.centerX * zoom,
              centerY: r.centerY * zoom,
              maxWidth: r.width * zoom,
              maxHeight: r.height * zoom,
              zoom,
              clipPath: (k) => {
                k.beginPath();
                k.rect(0, 0, 900, 600);
              },
              preferredColor: "#000000",
              preferredFontSize: c.fontSize,
              preferredFontWeight: c.fontWeight,
              maxLines: r.maxLines,
            });
          },
          { c, zoom, b: region(c) },
        );
        const canvasInk = await inkBox(s.page);

        await s.page.evaluate(
          ({ c, zoom, b }: Arg & { b: ReturnType<typeof region> }) => {
            const T = window.T;
            document.body.innerHTML = "";
            const probe = document.createElement("canvas").getContext("2d")!;
            const r = T.getShapeLabelRegion(c.type, b);
            // What the stage hands the editor when it opens.
            const size = c.fontSize ?? 16;
            const weight = c.fontWeight ?? T.defaultLabelWeight(size);
            const m = T.measureShapeLabel({
              ctx: probe,
              label: c.label,
              maxWidth: r.width * zoom,
              maxHeight: r.height * zoom,
              zoom,
              preferredFontSize: size,
              preferredFontWeight: weight,
              preferredFontStyle: "normal",
              maxLines: r.maxLines,
            })!;
            const style = T.shapeLabelEditorStyle({
              sx: r.centerX * zoom,
              sy: r.centerY * zoom,
              editTopOffset: T.measureLabelEditTopOffset(m.finalFontSize, weight, "normal"),
              editorWidth: m.wrapWidth,
              editorFontSize: m.finalFontSize,
              editorLineHeight: m.finalLineHeight,
              editorMinHeight: m.height,
              fontWeight: weight,
              fontStyle: "normal",
              color: "#000000",
            });
            const div = document.createElement("div");
            for (const [key, value] of Object.entries(style)) {
              (div.style as unknown as Record<string, string>)[key] =
                typeof value === "number" && key !== "zIndex" ? `${value}px` : String(value);
            }
            div.innerHTML = T.markdownToEditableHtml(T.normalizeRichTextInput(c.label));
            document.body.appendChild(div);
          },
          { c, zoom, b: region(c) },
        );
        const domInk = await inkBox(s.page);

        if (process.env.DEBUG_INK) console.log(font, c.name, zoom, JSON.stringify(canvasInk), JSON.stringify(domInk));
        expect(canvasInk && domInk).toBeTruthy();
        expect(maxDelta(canvasInk!, domInk!), `${font}: canvas ${JSON.stringify(canvasInk)} dom ${JSON.stringify(domInk)}`).toBeLessThanOrEqual(TOLERANCE_PX);
      });
    }
  }
});

for (const font of FONT_MODES)
  suite(`semantic node through the real renderer, panned and zoomed (${font} font)`, () => {
    let s: BrowserSession;
    beforeAll(async () => {
      s = await openPage({ font: font as FontMode });
    });
    afterAll(async () => {
      await s?.close();
    });

    for (const zoom of [0.5, 1, 2]) {
      it(`label stays beside the icon and the editor lands on it @ ${zoom}x`, async () => {
        const pan = { x: 37, y: 21 };
        const world = { x: 90, y: 60, w: 240, h: 78 };
        const geometry = await s.page.evaluate(({ zoom, pan, world }) => {
          const T = window.T;
          document.body.innerHTML = "";
          const canvas = document.createElement("canvas");
          canvas.width = 900;
          canvas.height = 600;
          canvas.style.cssText = "position:absolute;left:0;top:0";
          document.body.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 900, 600);
          ctx.strokeStyle = "#fff"; // hide the border: only text should leave ink
          const shape = {
            id: "n", type: "semantic-node", color: "#000000", fill: "#ffffff", strokeWidth: 2, label: "Database",
            fontSize: 17, fontWeight: "600", ai: { semanticKind: "generic" },
            points: [{ x: world.x, y: world.y }, { x: world.x + world.w, y: world.y + world.h }],
          } as unknown as Parameters<typeof T.renderSemanticNodeToCanvas>[0];
          T.renderSemanticNodeToCanvas(shape, { ctx, zoom, panOffset: pan, getElementBounds: () => null });
          const bounds = { minX: world.x, minY: world.y, maxX: world.x + world.w, maxY: world.y + world.h, width: world.w, height: world.h };
          const r = T.getShapeLabelRegion("semantic-node", bounds);
          return {
            // everything right of the icon box is label territory
            labelArea: {
              minX: Math.round((r.centerX - r.width / 2) * zoom + pan.x),
              maxX: Math.round((world.x + world.w) * zoom + pan.x),
              minY: Math.round(world.y * zoom + pan.y),
              maxY: Math.round((world.y + world.h) * zoom + pan.y),
            },
          };
        }, { zoom, pan, world });
        const canvasInk = await inkBox(s.page, geometry.labelArea);
        expect(canvasInk, "label ink beside the icon").toBeTruthy();

        await s.page.evaluate(({ zoom, pan, world }) => {
          const T = window.T;
          document.body.innerHTML = "";
          const probe = document.createElement("canvas").getContext("2d")!;
          const bounds = { minX: world.x, minY: world.y, maxX: world.x + world.w, maxY: world.y + world.h, width: world.w, height: world.h };
          const r = T.getShapeLabelRegion("semantic-node", bounds);
          const m = T.measureShapeLabel({
            ctx: probe, label: "Database", maxWidth: r.width * zoom, maxHeight: r.height * zoom, zoom,
            preferredFontSize: 17, preferredFontWeight: "600", preferredFontStyle: "normal", maxLines: r.maxLines,
          })!;
          const style = T.shapeLabelEditorStyle({
            sx: r.centerX * zoom + pan.x, sy: r.centerY * zoom + pan.y,
            editTopOffset: T.measureLabelEditTopOffset(m.finalFontSize, "600", "normal"),
            editorWidth: m.wrapWidth, editorFontSize: m.finalFontSize, editorLineHeight: m.finalLineHeight,
            editorMinHeight: m.height, fontWeight: "600", fontStyle: "normal", color: "#000000",
          });
          const div = document.createElement("div");
          for (const [k, v] of Object.entries(style)) {
            (div.style as unknown as Record<string, string>)[k] = typeof v === "number" && k !== "zIndex" ? `${v}px` : String(v);
          }
          div.innerHTML = T.markdownToEditableHtml("Database");
          document.body.appendChild(div);
        }, { zoom, pan, world });
        const domInk = await inkBox(s.page, geometry.labelArea);
        expect(domInk).toBeTruthy();
        expect(maxDelta(canvasInk!, domInk!), `${font}: canvas ${JSON.stringify(canvasInk)} dom ${JSON.stringify(domInk)}`).toBeLessThanOrEqual(TOLERANCE_PX);
        // The editor sits beside the icon: its ink starts to the right of the node's own centre line
        // of the icon column, never at the node's centre.
        expect(domInk!.minX).toBeGreaterThan(geometry.labelArea.minX - 1);
      });
    }
  });

