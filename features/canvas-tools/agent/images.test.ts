import { describe, expect, it } from "vitest";
import { MAX_IMAGES, MAX_IMAGE_CHARS, checkImageFile, countImages, imageNote, isImageDataUrl, stripImages } from "./images";
import { turnRequestSchema } from "./types";

const png = "data:image/png;base64,iVBORw0KGgo=";

describe("image attachments: validation", () => {
  it("accepts only base64 data URLs of the four image types, within the size limit", () => {
    expect(isImageDataUrl(png)).toBe(true);
    expect(isImageDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    for (const bad of ["https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGI+", "data:image/png;base64,", "data:image/png;base64,a b", "javascript:alert(1)", 5, null]) expect(isImageDataUrl(bad)).toBe(false);
    expect(isImageDataUrl(`data:image/png;base64,${"A".repeat(MAX_IMAGE_CHARS)}`)).toBe(false);
  });

  it("checks a picked file before it is read", () => {
    expect(checkImageFile({ type: "image/png", size: 1000, name: "a.png" }, 0)).toBeNull();
    expect(checkImageFile({ type: "application/pdf", size: 10, name: "a.pdf" }, 0)).toMatch(/not a PNG/);
    expect(checkImageFile({ type: "image/svg+xml", size: 10 }, 0)).toMatch(/not a PNG/);
    expect(checkImageFile({ type: "image/png", size: 50 * 1024 * 1024, name: "big.png" }, 0)).toMatch(/larger than/);
    expect(checkImageFile({ type: "image/png", size: 10 }, MAX_IMAGES)).toMatch(/up to 4/);
  });

  it("the request schema enforces count, type and total size on the server", () => {
    const base = { whiteboardId: "b1", messages: [{ role: "user" as const, content: "see this" }] };
    expect(turnRequestSchema.safeParse({ ...base, messages: [{ ...base.messages[0], images: [png] }] }).success).toBe(true);
    expect(turnRequestSchema.safeParse({ ...base, messages: [{ ...base.messages[0], images: Array(5).fill(png) }] }).success).toBe(false);
    expect(turnRequestSchema.safeParse({ ...base, messages: [{ ...base.messages[0], images: ["data:image/svg+xml;base64,AAAA"] }] }).success).toBe(false);
    const big = `data:image/jpeg;base64,${"A".repeat(900_000)}`;
    const many = Array.from({ length: 4 }, () => ({ role: "user" as const, content: "x", images: [big, big] }));
    expect(turnRequestSchema.safeParse({ ...base, messages: many }).success).toBe(false);
  });
});

describe("images and the stored conversation", () => {
  it("replaces pixels with a note so nothing heavy is stored or replayed", () => {
    const messages = [
      { role: "user", content: "copy this layout", images: [png, png] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "no images here" },
    ];
    expect(countImages(messages)).toBe(2);
    const stripped = stripImages(messages);
    expect(stripped[0]).toEqual({ role: "user", content: `copy this layout\n${imageNote(2)}` });
    expect(countImages(stripped)).toBe(0);
    expect(stripped[2]).toBe(messages[2]);
    expect(JSON.stringify(stripped)).not.toContain("base64");
    expect(messages[0].images).toHaveLength(2); // the input is untouched
  });
});
