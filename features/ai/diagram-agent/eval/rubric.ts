import { familyOf, GOLDEN_FAMILIES, type GoldenPrompt } from "./golden-prompts";

/**
 * The questions a person (or an optional vision model) answers about a diagram, each on a 1 to 5 scale.
 * Fixed data so ratings stay comparable across phases. A vision judge informs the report and never gates.
 */
export interface RubricQuestion {
  id: string;
  question: string;
  /** What 1, 2, 3, 4 and 5 mean, in order. */
  scale: [string, string, string, string, string];
}

export const RUBRIC: RubricQuestion[] = [
  { id: "finished", question: "Does the diagram look finished, as if a careful person tidied it?", scale: ["a rough sketch", "mostly rough", "acceptable", "tidy", "polished"] },
  { id: "structure", question: "Is the structure clear: related parts grouped, the main path easy to follow?", scale: ["unclear", "hard to follow", "followable", "clear", "obvious at a glance"] },
  { id: "arrows", question: "Are the arrows easy to follow, with room around shapes and no tangles?", scale: ["tangled", "cramped", "mixed", "clean", "effortless"] },
  { id: "shapes", question: "Does each shape suit what it stands for, not a plain box for everything?", scale: ["all boxes", "mostly boxes", "mixed", "mostly fitting", "every shape fits"] },
  { id: "labels", question: "Are labels short, readable and placed where they belong?", scale: ["unreadable", "crowded", "readable", "clear", "ideal"] },
  { id: "complete", question: "Does it show what the request asked for, and nothing padded?", scale: ["missing most", "missing parts", "mostly", "complete", "complete and lean"] },
];

/** The same balanced sample every time: round-robin over the families, in prompt order, up to `count`. */
export const pickSpotCheck = (prompts: GoldenPrompt[], count: number): GoldenPrompt[] => {
  const buckets = GOLDEN_FAMILIES.map((family) => prompts.filter((p) => familyOf(p.type) === family));
  const picked: GoldenPrompt[] = [];
  for (let round = 0; picked.length < count; round += 1) {
    let added = false;
    for (const bucket of buckets) {
      if (round < bucket.length && picked.length < count) {
        picked.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return picked;
};
