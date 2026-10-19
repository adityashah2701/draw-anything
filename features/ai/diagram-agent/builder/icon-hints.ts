import { loadIconLibrary, resolveIconId } from "@/core/icons/registry";

const MAX_HINTS = 24;

/**
 * The icon ids for the words in the request ("redis cache" -> redis), so the model starts with them
 * instead of spending a model call per lookup. Exact ids and aliases only; two-word terms win over
 * their words. Loads the on-demand icon library first, so brands (Stripe, SendGrid) resolve too.
 */
export const iconHints = async (prompt: string): Promise<string> => {
  await loadIconLibrary().catch(() => undefined);
  const words = prompt.toLowerCase().match(/[a-z0-9]+(?:[.+-][a-z0-9]+)*/g) ?? [];
  const hints = new Map<string, string>();
  for (let i = 0; i < words.length && hints.size < MAX_HINTS; i += 1) {
    const pair = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : "";
    const pairId = pair ? resolveIconId(pair) : undefined;
    if (pairId) {
      hints.set(pair, pairId);
      i += 1;
      continue;
    }
    const id = words[i].length >= 3 ? resolveIconId(words[i]) : undefined;
    if (id) hints.set(words[i], id);
  }
  return [...hints].map(([term, id]) => `${term} = ${id}`).join(", ");
};

/** "no icons", "plain boxes", "boxes only": the person asked for boxes, so icons are not the default. */
export const wantsPlainBoxes = (prompt: string): boolean =>
  /\b(?:no|without)\s+(?:any\s+)?(?:icons?|glyphs|pictograms)\b|\bplain\s+(?:boxes|rectangles|nodes|shapes)\b|\b(?:just|only)\s+(?:plain\s+)?(?:boxes|rectangles)\b|\b(?:boxes|rectangles)\s+only\b|\bicon[- ]?free\b/i.test(prompt);

/** "bare icons", "icons only", "no boxes": the person wants glyphs with captions, not boxes. */
export const wantsBareIcons = (prompt: string): boolean =>
  /\b(?:only|just)\s+(?:bare\s+)?icons?\b|\bicons?[- ]only\b|\bbare\s+icons?\b|\b(?:no|without)\s+(?:any\s+)?(?:boxes|rectangles|tiles|shapes)\b/i.test(prompt);
