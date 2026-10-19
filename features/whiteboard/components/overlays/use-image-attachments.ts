"use client";

import * as React from "react";
import { toast } from "sonner";
import { MAX_IMAGES, checkImageFile } from "@/features/canvas-tools/agent/images";
import { prepareImage } from "@/features/canvas-tools/editor/image-attachments";

export interface Attachment {
  id: string;
  name: string;
  /** The shrunken image as a `data:` URL: what is sent, and what the thumbnail shows. */
  url: string;
}

/**
 * The pictures attached to the message being written: added from the file button, a paste or a drop, checked
 * (type, size, count) before they are read, and shrunk before they are kept. They live only in this panel's
 * state until the message is sent.
 */
export const useImageAttachments = (enabled: boolean) => {
  const [items, setItems] = React.useState<Attachment[]>([]);
  const [busy, setBusy] = React.useState(false);
  const counter = React.useRef(0);
  const countRef = React.useRef(0);
  countRef.current = items.length;

  const add = React.useCallback(
    async (files: Iterable<File>) => {
      if (!enabled) return;
      const picked = [...files];
      if (picked.length === 0) return;
      setBusy(true);
      try {
        let planned = countRef.current;
        for (const file of picked) {
          const problem = checkImageFile(file, planned);
          if (problem) {
            toast.error(problem);
            if (planned >= MAX_IMAGES) break;
            continue;
          }
          try {
            const url = await prepareImage(file);
            planned += 1;
            counter.current += 1;
            setItems((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, { id: `img-${counter.current}`, name: file.name || "image", url }]));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "The image could not be attached.");
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [enabled],
  );

  const remove = React.useCallback((id: string) => setItems((prev) => prev.filter((item) => item.id !== id)), []);
  const clear = React.useCallback(() => setItems([]), []);
  return { items, busy, add, remove, clear };
};

/** The image files in a paste or drop; anything else is left to the browser (text still pastes as text). */
export const imageFilesOf = (data: DataTransfer | null): File[] => [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
