import { describe, expect, it } from "vitest";
import { buildCanvas } from "./canvas";
import { renderCanvasPng, renderCanvasSvg } from "./render-png";
import { addLines, createState } from "./state";

const state = addLines(
  createState(),
  "type architecture\nCustomers [icon: users, shape: icon]\nWeb App [icon: browser, shape: icon]\nOrders [kind: service]\nOrders DB [kind: database, shape: icon]\nCustomers > Web App: HTTPS\nWeb App > Orders",
).state;
const elements = buildCanvas(addLines(state, "Orders > Orders DB: SQL").state, "g", "f")!.elements;

describe("canvas picture for a vision model", () => {
  it("renders the editor's drawing as SVG, with node names and the white background", async () => {
    const drawing = await renderCanvasSvg(elements);
    expect(drawing?.svg).toContain("Orders");
    expect(drawing?.svg).toContain('fill="#ffffff"');
  });

  it("encodes a PNG that fits the size limit", async () => {
    const url = await renderCanvasPng(elements, 512);
    expect(url).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(url!.split(",")[1], "base64");
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const { default: sharp } = await import("sharp");
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512);
  });

  it("returns undefined for an empty canvas instead of throwing", async () => {
    expect(await renderCanvasPng([])).toBeUndefined();
  });
});
