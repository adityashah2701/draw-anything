import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildPdf, deflate } from "./pdf";

const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("PDF writer", () => {
  it("round-trips pixel bytes through Flate", async () => {
    const rgb = new Uint8Array(3 * 40 * 30).map((_, i) => (i * 7) % 251);
    expect(new Uint8Array(inflateSync(await deflate(rgb)))).toEqual(rgb);
  });

  it("writes a one-page PDF whose xref offsets and startxref are exact", async () => {
    const rgb = new Uint8Array(3 * 4 * 2).fill(255);
    const bytes = buildPdf({ pageWidth: 300.5, pageHeight: 150.25, imageWidth: 4, imageHeight: 2, flateRgb: await deflate(rgb) });
    const pdf = text(bytes);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 300.5 150.25]");
    expect(pdf).toContain("/Width 4 /Height 2 /ColorSpace /DeviceRGB");
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const offsets = [...pdf.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("declares the image stream length it actually wrote", async () => {
    const flate = await deflate(new Uint8Array(3 * 8 * 8).fill(9));
    const pdf = text(buildPdf({ pageWidth: 10, pageHeight: 10, imageWidth: 8, imageHeight: 8, flateRgb: flate }));
    expect(pdf).toContain(`/Length ${flate.length} >>`);
  });
});
