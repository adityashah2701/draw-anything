import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FONT_MODES, findChrome, openPage, type BrowserSession, type FontMode } from "./harness";

const suite = findChrome() ? describe : describe.skip;
const FIXTURES = ["architecture", "flowchart", "mind-map", "stress", "auth-flow"] as const;
// Set SAVE_LAYOUT_PNG=<dir> to keep a picture of every fixture for visual inspection.
const PNG_DIR = process.env.SAVE_LAYOUT_PNG;

interface Fit {
  nodes: number;
  /** Labels the real renderer has to draw smaller than requested (17px), or cannot fit. */
  shrunk: string[];
  cut: string[];
  /** Real label width against the box the estimator sized, to show how close the estimate is. */
  worstFill: number;
  width: number;
  height: number;
}

for (const font of FONT_MODES)
  suite(`compiled fixtures on the real canvas (${font} font)`, () => {
    let s: BrowserSession;
    beforeAll(async () => {
      s = await openPage({ font: font as FontMode });
    });
    afterAll(async () => {
      await s?.close();
    });

    for (const name of FIXTURES) {
      it(`${name}: every label fits at its requested size, and the drawing renders`, async () => {
        const fit = await s.page.evaluate((name) => {
          const T = window.T;
          const doc = T.LAYOUT_FIXTURES[name];
          const { elements } = T.compileAIDiagramDetailed(doc, "frame");
          const probe = document.createElement("canvas").getContext("2d")!;

          const nodes = elements.filter((e) => e.type === "semantic-node");
          const shrunk: string[] = [];
          const cut: string[] = [];
          let worstFill = 0;
          for (const node of nodes) {
            const [a, b] = node.points;
            const bounds = { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y, width: b.x - a.x, height: b.y - a.y };
            const region = T.getShapeLabelRegion("semantic-node", bounds);
            const layout = T.layoutShapeLabel(probe, {
              label: node.label ?? "",
              boxWidth: region.width,
              boxHeight: region.height,
              fontSize: node.fontSize,
              fontWeight: node.fontWeight,
              maxLines: region.maxLines,
            });
            // a word split across lines counts as cut: it reads as a typo
            if (!layout || !layout.fits || layout.brokenWord) cut.push(node.label ?? "");
            else if (layout.fontSize < (node.fontSize ?? 16)) shrunk.push(node.label ?? "");
            if (layout) worstFill = Math.max(worstFill, layout.width / layout.wrapWidth);
          }

          // Draw it all with the real renderers, fitted to the page.
          const all = elements.flatMap((e) => e.points);
          const minX = Math.min(...all.map((p) => p.x)) - 40;
          const minY = Math.min(...all.map((p) => p.y)) - 40;
          const maxX = Math.max(...all.map((p) => p.x)) + 40;
          const maxY = Math.max(...all.map((p) => p.y)) + 40;
          const zoom = Math.min(1600 / (maxX - minX), 1100 / (maxY - minY), 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil((maxX - minX) * zoom);
          canvas.height = Math.ceil((maxY - minY) * zoom);
          canvas.id = "out";
          document.body.innerHTML = "";
          document.body.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const context = {
            zoom,
            panOffset: { x: -minX * zoom, y: -minY * zoom },
            getElementBounds: (el: (typeof elements)[number]) => T.getShapeBounds(el, { textMeasureContext: ctx, zoom }),
          };
          for (const el of elements.filter((e) => e.ai?.role === "group")) T.drawElement(ctx, el, false, context);
          for (const el of elements.filter((e) => e.ai?.role !== "group")) T.drawElement(ctx, el, false, context);
          return { nodes: nodes.length, shrunk, cut, worstFill, width: canvas.width, height: canvas.height } satisfies Fit;
        }, name);

        if (PNG_DIR) {
          mkdirSync(PNG_DIR, { recursive: true });
          const png = await s.page.locator("#out").screenshot();
          writeFileSync(`${PNG_DIR}/${name}-${font}.png`, png);
        }
        if (process.env.DEBUG_FIT) console.log("FIT", font, name, JSON.stringify(fit));

        expect(fit.nodes).toBeGreaterThan(0);
        expect(fit.cut, "labels that cannot fit at all").toEqual([]);
        if (font === "inter") {
          // The estimator is Inter's: with Inter no node may need its label shrunk.
          expect(fit.shrunk).toEqual([]);
        } else {
          // Another font is a few percent wider or narrower; allow a small share to shrink.
          expect(fit.shrunk.length / fit.nodes).toBeLessThanOrEqual(0.1);
        }
      });
    }
  });
