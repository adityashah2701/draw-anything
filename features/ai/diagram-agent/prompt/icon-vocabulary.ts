import { listIcons, type IconCategory } from "@/core/icons/registry";

const ORDER: IconCategory[] = ["client", "network", "compute", "data", "security", "devops", "observability", "ai", "hardware", "flow"];

/** Registry ids grouped by category, one line each: the vocabulary `icon:` and `kind:` accept. */
export const iconVocabulary = (only?: IconCategory[]): string => {
  const byCategory = new Map<IconCategory, string[]>();
  for (const icon of listIcons()) {
    if (icon.id === "generic") continue;
    byCategory.set(icon.category, [...(byCategory.get(icon.category) ?? []), icon.id]);
  }
  return ORDER.filter((c) => byCategory.has(c) && (!only || only.includes(c)))
    .map((c) => `${c}: ${byCategory.get(c)!.join(", ")}`)
    .join("\n");
};
