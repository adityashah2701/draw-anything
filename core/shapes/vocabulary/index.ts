import { VOCABULARY } from "./entries";
import type { VocabularyEntry, VocabularyFamily } from "./types";

export { VOCABULARY } from "./entries";
export type { Representation, VocabularyEntry, VocabularyFamily, VocabularyTier } from "./types";

/** Entries a person or an agent may pick: only those that passed the conformance checks. */
export const supportedEntries = (family?: VocabularyFamily): VocabularyEntry[] =>
  VOCABULARY.filter((entry) => entry.status === "supported" && (!family || entry.families.includes(family)));

const norm = (word: string) => word.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** The supported entry whose id or alias is `word`, or undefined. */
export const resolveEntry = (word: string): VocabularyEntry | undefined => {
  const w = norm(word);
  return supportedEntries().find((entry) => entry.id === w || entry.aliases.includes(w));
};

/** The outline variant an entry draws as, when it is an outline. */
export const outlineVariantOf = (entry: VocabularyEntry): string | undefined => (entry.representation.kind === "outline" ? entry.representation.variant : undefined);

/** Other words for an outline variant, for the language and the agent. */
export const aliasesForOutline = (variantId: string): string[] =>
  supportedEntries()
    .filter((entry) => outlineVariantOf(entry) === variantId)
    .flatMap((entry) => [...entry.aliases]);

/** The parametric entry that draws exactly an outline with this variant and these parameters, if there is one. */
export const entryForOutline = (variant: string, border?: string, marker?: string, stack?: boolean): VocabularyEntry | undefined =>
  supportedEntries().find((entry) => {
    const r = entry.representation;
    return r.kind === "parametric" && r.base === variant && r.border === border && r.marker === marker && !!r.stack === !!stack;
  });

/** The parameters a parametric entry draws with; undefined for any other entry. */
export const parametersOf = (entry: VocabularyEntry) =>
  entry.representation.kind === "parametric"
    ? { base: entry.representation.base, border: entry.representation.border, marker: entry.representation.marker, stack: entry.representation.stack }
    : undefined;

/** Properties of the outline element an entry is drawn as (what the picker inserts), or undefined when it is not an outline. */
export const outlinePropsOf = (entry: VocabularyEntry): { variant: string; border?: "double" | "thick"; marker?: string; stack?: boolean } | undefined => {
  const r = entry.representation;
  if (r.kind === "outline") return { variant: r.variant };
  if (r.kind === "parametric") return { variant: r.base, ...(r.border ? { border: r.border } : {}), ...(r.marker ? { marker: r.marker } : {}), ...(r.stack ? { stack: true } : {}) };
  return undefined;
};
