import { resolveOutlineVariant } from "@/core/shapes/outline/variants";
import { createShape } from "@/core/shapes/shape-runtime";
import { outlinePropsOf, supportedEntries, type VocabularyEntry, type VocabularyFamily } from "@/core/shapes/vocabulary";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

/**
 * The shape picker's data: what the vocabulary says a person may pick, searched and filtered. Pure, so the
 * ranking, the filters and what lands on the board are tested without a browser. Planned entries are never
 * here (`supportedEntries`), and the bare icon is left to the icon picker.
 */

export const FAMILY_LABELS: Record<VocabularyFamily, string> = {
  architecture: "Architecture",
  flowchart: "Flowchart",
  er: "ER",
  uml: "UML",
  sequence: "Sequence",
  "mind-map": "Mind map",
  general: "General",
};

/** Families in the order the filter lists them. */
export const FAMILY_ORDER: readonly VocabularyFamily[] = ["architecture", "flowchart", "er", "uml", "sequence", "mind-map", "general"];

export const SHAPE_CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic",
  process: "Process",
  storage: "Storage",
  messaging: "Messaging",
  network: "Network",
  documents: "Documents",
  structure: "Structure",
  actors: "Actors",
  annotation: "Notes",
  states: "States",
  er: "ER",
  bpmn: "BPMN",
  uml: "UML",
  sequence: "Sequence",
  "mind-map": "Mind map",
};

const CATEGORY_ORDER = Object.keys(SHAPE_CATEGORY_LABELS);

export const categoryLabel = (category: string): string => SHAPE_CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);

/** Everything the picker can insert: outlines, parametric pictures and the three plain shapes. */
export const pickerEntries = (): VocabularyEntry[] => supportedEntries().filter((entry) => !(entry.representation.kind === "shape" && entry.representation.shape === "icon"));

/** Categories that have an entry, in a fixed order, with unknown ones last. */
export const shapeCategories = (): string[] => {
  const present = new Set(pickerEntries().map((entry) => entry.category));
  return [...CATEGORY_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort()];
};

/** Families that have an entry, in filter order. */
export const shapeFamilies = (): VocabularyFamily[] => {
  const present = new Set(pickerEntries().flatMap((entry) => entry.families));
  return FAMILY_ORDER.filter((family) => present.has(family));
};

const norm = (text: string) => text.trim().toLowerCase();
/** Words joined by hyphens, so "speech bubble" finds the alias "speech-bubble". */
const slug = (text: string) => norm(text).replace(/[\s_]+/g, "-");

/** 0 = best. Name, id and aliases rank above the category and the guidance line; -1 = no match. */
const rank = (entry: VocabularyEntry, spoken: string): number => {
  const query = slug(spoken);
  const names = [entry.id, slug(entry.name), ...entry.aliases];
  if (names.includes(query)) return 0;
  if (names.some((n) => n.startsWith(query))) return 1;
  if (names.some((n) => n.split(/[\s-]+/).some((word) => word.startsWith(query)))) return 2;
  if (names.some((n) => n.includes(query))) return 3;
  if (norm(categoryLabel(entry.category)).includes(query) || entry.category.includes(query)) return 4;
  return norm(entry.guidance).includes(spoken) ? 5 : -1;
};

/**
 * Entries for the picker. A query ranks them (the original order breaks ties); with none, they come grouped by
 * category in the fixed category order. `category` and `family` narrow the list, and each takes null for "all".
 */
export const pickerShapes = (query: string, category: string | null, family: VocabularyFamily | null): VocabularyEntry[] => {
  const q = norm(query);
  const all = pickerEntries().filter((entry) => (!category || entry.category === category) && (!family || entry.families.includes(family)));
  if (!q) {
    const order = (entry: VocabularyEntry) => {
      const at = CATEGORY_ORDER.indexOf(entry.category);
      return at < 0 ? CATEGORY_ORDER.length : at;
    };
    return all.map((entry, index) => ({ entry, index })).sort((a, b) => order(a.entry) - order(b.entry) || a.index - b.index).map(({ entry }) => entry);
  }
  return all
    .map((entry, index) => ({ entry, index, score: rank(entry, q) }))
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ entry }) => entry);
};

/** The name a screen reader announces for an entry. */
export const shapeLabel = (entry: VocabularyEntry): string => `${entry.name}, ${categoryLabel(entry.category)}. ${entry.guidance}`;

/** Edge lengths of the plain shapes the picker inserts, in world units. */
const PLAIN_SIZES: Record<string, { width: number; height: number }> = {
  rectangle: { width: 160, height: 80 },
  diamond: { width: 120, height: 100 },
  pill: { width: 160, height: 64 },
};

/**
 * The element an entry puts on the board, centred on `center`: an outline with its parameters (stored only when
 * set, like every other path that makes one), or a plain rectangle, diamond or pill. Undefined for an entry the
 * picker does not insert.
 */
/** Starter content for the structured elements the picker inserts, so a new one is not empty. */
const STRUCTURED_DEFAULTS: Record<string, Record<string, unknown>> = {
  "entity-table": { name: "Entity", rows: [{ id: "id", name: "id", type: "int", keys: ["pk"] }, { id: "name", name: "name", type: "text" }] },
  "uml-classifier": { name: "Class", attributes: ["-id: int"], operations: ["+run(): void"] },
  "mindmap-node": { label: "Topic", role: "main" },
  lifeline: { name: "Participant" },
};

export const buildShapeElement = (entry: VocabularyEntry, center: Point, id: string): DrawingElement | undefined => {
  if (entry.representation.kind === "element") {
    const type = entry.representation.type;
    const made = createShape(type as never, { id, ...(STRUCTURED_DEFAULTS[type] ?? {}), color: "#000000" } as never) as unknown as DrawingElement | undefined;
    if (!made) return undefined;
    const [a, b] = made.points;
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    return { ...made, points: [{ x: center.x - w / 2, y: center.y - h / 2 }, { x: center.x + w / 2, y: center.y + h / 2 }] } as DrawingElement;
  }
  const outline = outlinePropsOf(entry);
  const size = outline ? resolveOutlineVariant(outline.variant).defaultSize : entry.representation.kind === "shape" ? PLAIN_SIZES[entry.representation.shape] : undefined;
  if (!size) return undefined;
  const type = outline ? "outline" : entry.representation.kind === "shape" ? entry.representation.shape : undefined;
  if (!type) return undefined;
  return {
    id,
    type,
    ...(outline ?? {}),
    points: [
      { x: center.x - size.width / 2, y: center.y - size.height / 2 },
      { x: center.x + size.width / 2, y: center.y + size.height / 2 },
    ],
    color: "#000000",
    strokeWidth: 2,
  } as unknown as DrawingElement;
};

const RECENT_KEY = "draw-anything:recent-shapes";
export const MAX_RECENT_SHAPES = 8;

/** Ids of the shapes picked most recently, newest first. Unreadable storage, or an id that is no longer supported, gives none. */
export const loadRecentShapeIds = (): string[] => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    const known = new Set(pickerEntries().map((entry) => entry.id));
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && known.has(id)).slice(0, MAX_RECENT_SHAPES) : [];
  } catch {
    return [];
  }
};

export const saveRecentShapeIds = (ids: string[]) => {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_SHAPES)));
  } catch {
    // Private mode or a full quota: recents are a convenience.
  }
};

/** Newest first, one entry per id. */
export const withRecentShape = (ids: string[], id: string): string[] => [id, ...ids.filter((x) => x !== id)].slice(0, MAX_RECENT_SHAPES);

export const recentShapes = (ids: string[]): VocabularyEntry[] => {
  const byId = new Map(pickerEntries().map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => byId.get(id) ?? []);
};
