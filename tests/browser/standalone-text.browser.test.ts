import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FONT_MODES, findChrome, openPage, type BrowserSession, type FontMode } from "./harness";
import { inkBox, maxDelta } from "./page-helpers";

const suite = findChrome() ? describe : describe.skip;
const TOLERANCE_PX = 2; // DOM baseline snapping (1px) + antialiased edge (1px)

interface TextCase {
  name: string;
  text: string;
  fontSize: number;
  fontWeight: string;
  fontStyle?: string;
}
const CASES: TextCase[] = [
  { name: "single line", text: "Hello world", fontSize: 20, fontWeight: "400" },
  { name: "multiline", text: "First line\nSecond line is longer\nThird", fontSize: 18, fontWeight: "400" },
  { name: "bold heading", text: "Heading", fontSize: 36, fontWeight: "800" },
  { name: "italic", text: "Slanted text here", fontSize: 24, fontWeight: "400", fontStyle: "italic" },
];
const ZOOMS = [0.5, 1, 2];

type Arg = { c: TextCase; zoom: number };

for (const font of FONT_MODES)
  suite(`standalone text (${font} font)`, () => {
    let s: BrowserSession;
    beforeAll(async () => {
      s = await openPage({ font: font as FontMode });
    });
    afterAll(async () => {
      await s?.close();
    });

    for (const c of CASES) {
      for (const zoom of ZOOMS) {
        it(`${c.name} @ ${zoom}x: canvas, editor and bounds agree`, async () => {
          await s.page.evaluate(({ c, zoom }: Arg) => {
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
            const shape = {
              id: "t", type: "text", points: [{ x: 80, y: 60 }], color: "#000000", strokeWidth: 1,
              text: c.text, fontSize: c.fontSize, fontWeight: c.fontWeight, fontStyle: c.fontStyle ?? "normal",
            } as unknown as Parameters<typeof T.renderTextToCanvas>[0];
            T.renderTextToCanvas(shape, { ctx, zoom, panOffset: { x: 0, y: 0 }, getElementBounds: () => null, editingTextId: null });
          }, { c, zoom });
          const canvasInk = await inkBox(s.page);

          const dom = await s.page.evaluate(({ c, zoom }: Arg) => {
            const T = window.T;
            document.body.innerHTML = "";
            const size = c.fontSize * zoom;
            const style = T.textBlockEditorStyle({
              fontSizePx: size, lineHeightPx: size * 1.2, fontWeight: c.fontWeight,
              italic: c.fontStyle === "italic", color: "#000000",
            });
            const wrap = document.createElement("div");
            wrap.style.cssText = `position:absolute;left:${80 * zoom}px;top:${60 * zoom}px`;
            const editor = document.createElement("div");
            for (const [k, v] of Object.entries(style)) {
              (editor.style as unknown as Record<string, string>)[k] = typeof v === "number" && k !== "zIndex" ? `${v}px` : String(v);
            }
            editor.innerHTML = T.markdownToEditableHtml(T.normalizeRichTextInput(c.text));
            wrap.appendChild(editor);
            document.body.appendChild(wrap);
            const rect = editor.getBoundingClientRect();

            // The selection box the canvas draws comes from getTextBounds, measured at zoom 1.
            const probe = document.createElement("canvas").getContext("2d")!;
            const shape = {
              id: "t", type: "text", points: [{ x: 80, y: 60 }], color: "#000", strokeWidth: 1,
              text: c.text, fontSize: c.fontSize, fontWeight: c.fontWeight, fontStyle: c.fontStyle ?? "normal",
            } as unknown as Parameters<typeof T.getTextBounds>[0];
            const bounds = T.getTextBounds(shape, { textMeasureContext: probe, zoom })!;
            return { domHeight: rect.height, domWidth: rect.width, bounds };
          }, { c, zoom });
          const domInk = await inkBox(s.page);

          expect(canvasInk && domInk).toBeTruthy();
          expect(maxDelta(canvasInk!, domInk!), `${font}: canvas ${JSON.stringify(canvasInk)} dom ${JSON.stringify(domInk)}`).toBeLessThanOrEqual(TOLERANCE_PX);
          // Selection box height is exactly the editor's height (same line height, same line count).
          expect(dom.bounds.height * zoom).toBeCloseTo(dom.domHeight, 1);
          // Width: the editor is at least min-width 48; compare real text only.
          // Only with a font whose width is linear in size: system fonts (San Francisco) track
          // differently at each size, so a width measured at 1x is off by up to ~10% at other zooms.
          if (font === "inter" && dom.domWidth > 48 * zoom + 1) {
            expect(Math.abs(dom.bounds.width * zoom - dom.domWidth)).toBeLessThanOrEqual(TOLERANCE_PX * Math.max(1, zoom));
          }
        });
      }
    }

    // Resizing scales the measured width by the font-size ratio; exact only for linear fonts.
    (font === "inter" ? it : it.skip)("resizing keeps the opposite edge fixed with a real canvas context", async () => {
      const res = await s.page.evaluate(() => {
        const T = window.T;
        const ctx = document.createElement("canvas").getContext("2d")!;
        const shape = {
          id: "t", type: "text", points: [{ x: 100, y: 50 }], color: "#000", strokeWidth: 1,
          text: "Resize me\nplease", fontSize: 20, fontWeight: "400", fontStyle: "normal",
        } as unknown as Parameters<typeof T.getTextBounds>[0];
        const original = T.getTextBounds(shape, { textMeasureContext: ctx, zoom: 1 })!;
        const out: Record<string, number> = {};
        for (const [handle, point] of [
          ["w", { x: original.minX - original.width, y: 60 }],
          ["nw", { x: original.minX - 60, y: original.minY - 40 }],
          ["se", { x: original.maxX + 80, y: original.maxY + 40 }],
        ] as const) {
          const next = T.getTextBounds(T.resizeText(shape, handle, point, original) as typeof shape, { textMeasureContext: ctx, zoom: 1 })!;
          out[`${handle}-maxX`] = next.maxX - original.maxX;
          out[`${handle}-maxY`] = next.maxY - original.maxY;
          out[`${handle}-minX`] = next.minX - original.minX;
          out[`${handle}-minY`] = next.minY - original.minY;
        }
        return out;
      });
      if (process.env.DEBUG_RESIZE) console.log("RESIZE", JSON.stringify(res));
      // Inter is linear in size, so the anchored edge must not move at all (1e-3).
      expect(Math.abs(res["w-maxX"])).toBeLessThan(1e-3);
      expect(Math.abs(res["nw-maxX"])).toBeLessThan(1e-3);
      expect(Math.abs(res["nw-maxY"])).toBeLessThan(1e-3);
      expect(res["se-minX"]).toBe(0);
      expect(res["se-minY"]).toBe(0);
    });
  });
