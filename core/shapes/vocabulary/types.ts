/**
 * The semantic shape vocabulary: what a shape means, and which drawing stands for it. The engines
 * (the element-type registry, `OUTLINE_VARIANTS`, the semantic kinds, the icons, the frame presets) draw;
 * this layer names, groups and recommends. The language, the picker and the agent read it, so a shape
 * that is not `supported` here is listed nowhere a person or a model can pick it.
 */
export type VocabularyFamily = "architecture" | "flowchart" | "er" | "uml" | "sequence" | "mind-map" | "general";

/** 1 simple outline, 2 parametric outline, 3 structured element, 4 semantic node, 5 container, 6 connector meaning. */
export type VocabularyTier = 1 | 2 | 3 | 4 | 5 | 6;

export type Representation =
  | { kind: "outline"; variant: string }
  /** An outline that takes parameters: `base` is a box, rhombus or ring (or any outline), `border`, `marker` and `stack` make the picture. */
  | { kind: "parametric"; base: string; border?: "double" | "thick"; marker?: string; stack?: boolean }
  | { kind: "shape"; shape: "rectangle" | "diamond" | "pill" | "ellipse" | "icon" }
  | { kind: "element"; type: string };

export interface VocabularyEntry {
  /** Unique, lower-case, no spaces. For an outline this is its variant id. */
  id: string;
  category: string;
  name: string;
  /** Other words that mean the same; never another entry's id or alias. */
  aliases: readonly string[];
  families: readonly VocabularyFamily[];
  tier: VocabularyTier;
  representation: Representation;
  /** One line telling an agent when to choose it. */
  guidance: string;
  /** `planned` entries are listed nowhere user-facing until they pass the conformance checks. */
  status: "planned" | "supported";
}
