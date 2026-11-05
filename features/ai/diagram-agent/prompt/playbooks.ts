import type { AIDiagramType } from "@/features/ai/types";
import { PROFILES } from "../profiles";

/** How a good diagram of each type is composed. Read from the diagram profiles; judgement guidance, not limits. */
export const PLAYBOOKS: Record<string, string> = Object.fromEntries(
  (Object.keys(PROFILES) as AIDiagramType[]).map((type) => [type, PROFILES[type].guidance]),
);

export const playbookFor = (diagramType: string | undefined): string | undefined => PLAYBOOKS[(diagramType ?? "").toLowerCase()];
