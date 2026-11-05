import type { IconCategory } from "@/core/icons/registry";
import { parseDiagramType } from "@/features/ai/schemas";
import type { AIDiagramType } from "@/features/ai/types";

/** What is known about the request when the system prompt is built, used to leave out what cannot help. */
export interface PromptContext {
  diagramType?: AIDiagramType;
  /** The user's request; only used to decide whether the hardware icons are worth their tokens. */
  prompt?: string;
}

/** Families drawn with their own shapes (table, class, lifeline, topic), not with icons. */
export const STRUCTURED_DIAGRAM_TYPES: ReadonlySet<string> = new Set(["entity-relationship", "class", "sequence", "mind-map"]);

const TYPE_KEYWORDS: Array<[RegExp, AIDiagramType]> = [
  [/\bsequence (diagram|chart)\b/i, "sequence"],
  [/\b(erd|er (diagram|model)|entity[- ]relationship|database schema|schema design|data model|tables? and (relationships|keys))\b/i, "entity-relationship"],
  [/\bmind[- ]?map\b/i, "mind-map"],
  [/\b(class diagram|uml|low[- ]level design|lld)\b/i, "class"],
  [/\b(org(anization(al)?)? chart|reporting structure)\b/i, "organization"],
  [/\bdependency (graph|diagram)|\bpackage dependencies\b/i, "dependency"],
  [/\bconcept (map|diagram)\b/i, "concept"],
  [/\b(flow ?chart|flow diagram|decision tree|login flow|user flow|process flow)\b/i, "flowchart"],
  [/\bworkflow\b/i, "workflow"],
  [/\bnetwork (diagram|topology)\b|\b(vlan|subnet|dmz)\b/i, "network"],
  [/\b(architecture|system design|high[- ]level design|hld|system design|infrastructure|aws|azure|gcp|kubernetes|microservices?|ci\/cd|backend|cloud)\b/i, "architecture"],
];

/**
 * A request to design a product or a system ("design WhatsApp", "how would you build Uber", "scalable video
 * platform"): it gets the system-design checklist and the chat-system example, which a plain architecture does not need.
 */
const SYSTEM_DESIGN = /\b(system design|design (a |an |the )?[\w-]+( app| system| platform| service| backend| clone)?|how (would|do|to) (you )?(build|design)|scal(e|able|ing)|clone of|like (whatsapp|uber|netflix|youtube|instagram|twitter|slack|zoom|airbnb|spotify|tiktok|amazon|google drive|dropbox))\b/i;
const FLOW_OR_DATA = /\b(flow ?chart|flow|erd|er (diagram|model)|schema|sequence|class diagram|mind[- ]?map|org chart)\b/i;
export const isSystemDesign = (prompt: string | undefined): boolean => !!prompt && SYSTEM_DESIGN.test(prompt) && !FLOW_OR_DATA.test(prompt);

/** The diagram type the request or the existing diagram's `type` line names, if any. A guess; unknown is fine. */
export const inferDiagramType = (prompt: string, existingDiagram?: string): AIDiagramType | undefined => {
  const header = existingDiagram ? /^\s*type\s+([\w -]+?)\s*$/im.exec(existingDiagram)?.[1] : undefined;
  const fromHeader = header ? parseDiagramType(header) : null;
  if (fromHeader) return fromHeader;
  return TYPE_KEYWORDS.find(([regex]) => regex.test(prompt))?.[1] ?? (isSystemDesign(prompt) ? "architecture" : undefined);
};

const ALL: IconCategory[] = ["client", "network", "compute", "data", "security", "devops", "observability", "ai"];

const CATEGORIES: Partial<Record<AIDiagramType, IconCategory[]>> = {
  architecture: ALL,
  network: ["network", "security", "compute", "client", "data"],
  sequence: ["client", "compute", "data", "network", "security", "flow"],
  flowchart: ["flow", "client", "data", "security"],
  workflow: ["flow", "client", "data", "security", "devops"],
  "entity-relationship": ["data", "client"],
  "mind-map": ["client", "flow", "ai"],
  concept: ["client", "flow", "ai", "data"],
  organization: ["client", "flow"],
  class: ["compute", "data", "devops", "flow"],
  dependency: ["compute", "data", "devops", "flow"],
};

const HARDWARE = /\b(iot|sensor|esp32|arduino|stm32|microcontroller|raspberry|firmware|embedded|circuit|pcb|bluetooth|lora|zigbee)\b/i;

/** Icon categories worth listing: the type's own, plus hardware only when the request is about hardware. */
export const iconCategoriesFor = ({ diagramType, prompt }: PromptContext): IconCategory[] => {
  const base = (diagramType && CATEGORIES[diagramType]) || ALL;
  return prompt && HARDWARE.test(prompt) && !base.includes("hardware") ? [...base, "hardware"] : base;
};
