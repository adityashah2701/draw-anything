import { ExportError } from "./errors";

/** A file name from a board title: letters, digits, `-` and `_` only, never empty. */
export const exportFilename = (title: string | undefined, extension: string): string => {
  const base = (title ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "whiteboard"}.${extension}`;
};

/** Save a blob through a temporary link, then release the object URL and the link. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // The download starts synchronously from the click; the delay only covers slow browsers.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
};

const asClipboardError = (error: unknown, what: string) => {
  if (error instanceof ExportError) return error;
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return new ExportError("clipboard-denied", `The browser blocked copying to the clipboard. Allow clipboard access for this site, or download the ${what}.`);
  }
  return new ExportError("render-failed", "Copying failed.");
};

/** Put a PNG on the clipboard. Takes a promise because Safari needs the write to start inside the click. */
export const copyPngToClipboard = async (png: Promise<Blob>) => {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new ExportError("clipboard-unsupported", "This browser cannot copy images. Download the PNG instead.");
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch (error) {
    throw asClipboardError(error, "PNG");
  }
};

/**
 * Put SVG markup on the clipboard as text, which every editor and code field accepts. Browsers do not
 * allow `image/svg+xml` on the clipboard (Chrome refuses it as unsafe), so there is no image flavour.
 */
export const copySvgToClipboard = async (svg: Promise<string>) => {
  if (!navigator.clipboard?.writeText) {
    throw new ExportError("clipboard-unsupported", "This browser cannot copy to the clipboard. Download the SVG instead.");
  }
  try {
    await navigator.clipboard.writeText(await svg);
  } catch (error) {
    throw asClipboardError(error, "SVG");
  }
};
