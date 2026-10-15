import type { Page } from "playwright-core";
import type * as Entry from "./entry";

export type TextModules = typeof Entry;
declare global {
  interface Window {
    T: TextModules;
  }
}

export interface Ink {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Dark-pixel bounding box of the current page, as drawn (canvas or DOM alike). */
export const inkBox = async (page: Page, only?: Ink): Promise<Ink | null> => {
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 900, height: 600 } });
  return page.evaluate(async ({ base64, only }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (only && (x < only.minX || x > only.maxX || y < only.minY || y > only.maxY)) continue;
        const i = (y * width + x) * 4;
        if (data[i] + data[i + 1] + data[i + 2] < 3 * 140) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  }, { base64: png.toString("base64"), only });
};

export const clearStage = (page: Page) =>
  page.evaluate(() => {
    document.body.innerHTML = "";
  });

export const maxDelta = (a: Ink, b: Ink) =>
  Math.max(
    Math.abs(a.minX - b.minX),
    Math.abs(a.minY - b.minY),
    Math.abs(a.maxX - b.maxX),
    Math.abs(a.maxY - b.maxY),
  );
