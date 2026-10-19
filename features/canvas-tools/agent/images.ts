/**
 * Image attachments for the agent: the limits and the checks, shared by the panel (before sending) and the
 * server (which never trusts the panel). Images are `data:` URLs, sent only with the run that carries them
 * and never stored in the board's conversation (see `stripImages`).
 */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGES = 4;
/** What a person may pick, before the panel shrinks it. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** Longest side after the panel shrinks an image: plenty to read a screenshot or a sketch. */
export const MAX_IMAGE_SIDE = 1280;
/** One image as a data URL (base64 characters), after shrinking. */
export const MAX_IMAGE_CHARS = 1_000_000;
/** All images of one request. */
export const MAX_TOTAL_IMAGE_CHARS = 3_000_000;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,[A-Za-z0-9+/]+={0,2}$/;

export const isImageDataUrl = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_IMAGE_CHARS && DATA_URL.test(value);

export const isAllowedImageType = (type: string): boolean => (IMAGE_TYPES as readonly string[]).includes(type);

/** Why a file cannot be attached, or null when it can. Written for the person. */
export const checkImageFile = (file: { type: string; size: number; name?: string }, alreadyAttached: number): string | null => {
  if (alreadyAttached >= MAX_IMAGES) return `You can attach up to ${MAX_IMAGES} images.`;
  if (!isAllowedImageType(file.type)) return `${file.name ? `"${file.name}"` : "That file"} is not a PNG, JPEG, WebP or GIF image.`;
  if (file.size > MAX_SOURCE_BYTES) return `${file.name ? `"${file.name}"` : "That image"} is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`;
  return null;
};

/** The note that replaces images in the stored conversation: the model knows they existed, nobody stores the pixels. */
export const imageNote = (count: number): string => `[${count} image${count === 1 ? "" : "s"} attached to this message; not kept after the run]`;

/** The conversation without any image data: what is stored for the board and sent with later runs. */
export const stripImages = <T extends { role: string; content: string; images?: string[] }>(messages: readonly T[]): T[] =>
  messages.map((message) => {
    if (message.role !== "user" || !message.images?.length) return message;
    const { images, ...rest } = message;
    return { ...rest, content: `${message.content}\n${imageNote(images.length)}` } as unknown as T;
  });

export const countImages = (messages: ReadonlyArray<{ role: string; images?: string[] }>): number =>
  messages.reduce((sum, message) => sum + (message.role === "user" ? (message.images?.length ?? 0) : 0), 0);
