"use client";

import { useEffect, useState } from "react";

import { isGroupRecord } from "@/core/groups/group-index";
import { exportScene } from "@/features/whiteboard/export/export-scene";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

/** A snapshot this large is not worth drawing for a thumbnail. */
const MAX_CONTENT_CHARS = 2_000_000;

const cache = new Map<string, string>();
const failed = new Set<string>();
// One drawing at a time, so a screen of tiles never blocks the page for long.
let queue: Promise<unknown> = Promise.resolve();

const draw = (key: string, content: string): Promise<string | null> => {
  const run = async () => {
    const saved = parseSavedContent(content);
    if (saved.status !== "ok") return null;
    const elements = saved.elements.filter((element): element is DrawingElement => !isGroupRecord(element));
    if (elements.length === 0) return null;
    try {
      const { blob } = await exportScene({
        elements,
        selectedIds: [],
        options: { format: "svg", scale: 1, transparent: false, selectionOnly: false },
      });
      const url = URL.createObjectURL(blob);
      cache.set(key, url);
      return url;
    } catch {
      failed.add(key);
      return null;
    }
  };
  const next = queue.then(run, run);
  queue = next;
  return next;
};

/**
 * A picture of the board's saved content, drawn with the editor's own renderer once the tile
 * scrolls into view. Returns null while loading, for an empty board, or if drawing fails; the
 * caller shows its placeholder then. A preview image the user chose is handled by the caller.
 */
export function useBoardThumbnail(board: { _id: string; content?: string }, enabled: boolean, target: Element | null): string | null {
  const content = board.content;
  const key = `${board._id}:${content?.length ?? 0}`;
  const eligible = enabled && !!content && content.length <= MAX_CONTENT_CHARS && !failed.has(key);
  const [url, setUrl] = useState<string | null>(() => (eligible ? (cache.get(key) ?? null) : null));

  useEffect(() => {
    if (!eligible || !content) return;
    const hit = cache.get(key);
    if (hit) return void setUrl(hit);
    if (!target) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void draw(key, content).then((next) => {
          if (!cancelled) setUrl(next);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [eligible, content, key, target]);

  return eligible ? url : null;
}
