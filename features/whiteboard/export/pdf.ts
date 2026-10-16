/**
 * A minimal single-page PDF holding one raster image. Dependency-free; the image is the RGB bytes
 * Flate-compressed (lossless). The page is the diagram, not a sheet to split it across.
 */
const encoder = new TextEncoder();
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** zlib/deflate as PDF's FlateDecode expects. */
export const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof CompressionStream === "undefined") throw new Error("CompressionStream is not available");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export interface PdfImagePage {
  /** Page size in PDF points (1/72 in). */
  pageWidth: number;
  pageHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** Flate-compressed, 8-bit DeviceRGB, row by row. */
  flateRgb: Uint8Array;
}

export const buildPdf = (page: PdfImagePage): Uint8Array => {
  const f = (n: number) => String(Math.round(n * 100) / 100);
  const content = encoder.encode(`q ${f(page.pageWidth)} 0 0 ${f(page.pageHeight)} 0 0 cm /Im0 Do Q`);
  const objects: Uint8Array[][] = [
    [encoder.encode("<< /Type /Catalog /Pages 2 0 R >>")],
    [encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(page.pageWidth)} ${f(page.pageHeight)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`)],
    [encoder.encode(`<< /Length ${content.length} >>\nstream\n`), content, encoder.encode("\nendstream")],
    [
      encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.flateRgb.length} >>\nstream\n`),
      page.flateRgb,
      encoder.encode("\nendstream"),
    ],
  ];
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n%âãÏÓ\n")];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const piece = concat([encoder.encode(`${i + 1} 0 obj\n`), ...body, encoder.encode("\nendobj\n")]);
    parts.push(piece);
    length += piece.length;
  });
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "].concat(offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `));
  parts.push(encoder.encode(`${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return concat(parts);
};
