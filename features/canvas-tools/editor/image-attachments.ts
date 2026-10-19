import { MAX_IMAGE_CHARS, MAX_IMAGE_SIDE, checkImageFile } from "../agent/images";

export { checkImageFile };

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });

/**
 * A picked image as the data URL that is sent: shrunk so its longest side is at most `MAX_IMAGE_SIDE` and
 * re-encoded as JPEG (transparent areas become white), then made smaller still until it fits the per-image
 * limit. A GIF contributes its first frame. Rejects with a sentence that is safe to show.
 */
export const prepareImage = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`"${file.name || "That file"}" could not be read as an image.`);
  try {
    let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Images cannot be prepared in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", attempt === 0 ? 0.85 : 0.7));
      if (!blob) throw new Error("The image could not be prepared.");
      const url = await blobToDataUrl(blob);
      if (url.length <= MAX_IMAGE_CHARS) return url;
      scale *= 0.7;
    }
    throw new Error(`"${file.name || "That image"}" is too detailed to attach, even after shrinking it.`);
  } finally {
    bitmap.close();
  }
};
