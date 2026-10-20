import { resolveIconId } from "@/core/icons/registry";
import CATALOG from "@/core/icons/catalog.json";
import { DIAGRAM_TYPE_ALIASES, KIND_ALIASES, aiDiagramTypeSchema, aiSemanticNodeKindSchema, normalizeSemanticKind } from "@/features/ai/schemas";

/**
 * Everything the language knows by name, in one place. Validation, completion, hover and the
 * reference docs all read these tables, so they cannot disagree.
 */

export type ElementKind = "node" | "group" | "frame" | "edge";
export type ValueType = "text" | "kind" | "icon" | "shape" | "color" | "boolean" | "number" | "side";

export interface PropertyDoc {
  /** Canonical key; `aliases` are accepted spellings. */
  key: string;
  aliases?: string[];
  value: ValueType;
  summary: string;
  example: string;
  appliesTo: ElementKind[];
}

export const PROPERTIES: PropertyDoc[] = [
  { key: "kind", value: "kind", summary: "What the element is (service, database, queue, user, decision, ...). Picks its icon and colours.", example: "kind: database", appliesTo: ["node"] },
  { key: "icon", value: "icon", summary: "An icon id or alias from the icon registry.", example: "icon: postgres", appliesTo: ["node"] },
  { key: "label", value: "text", summary: "The text shown on the canvas when it should differ from the name.", example: 'label: "Public API"', appliesTo: ["node", "group", "frame"] },
  { key: "shape", value: "shape", summary: "How the node is drawn: rectangle (default), diamond, pill or icon.", example: "shape: diamond", appliesTo: ["node"] },
  { key: "color", aliases: ["colour"], value: "color", summary: "Outline colour (a name such as blue, or #rrggbb). The fill is a tint of it.", example: "color: blue", appliesTo: ["node", "frame", "edge"] },
  { key: "dashed", value: "boolean", summary: "Draw the outline dashed (true or false).", example: "dashed: true", appliesTo: ["node"] },
  { key: "x", value: "number", summary: "Left edge in canvas units. With y, pins the element exactly there.", example: "x: 120", appliesTo: ["node", "frame"] },
  { key: "y", value: "number", summary: "Top edge in canvas units.", example: "y: 80", appliesTo: ["node", "frame"] },
  { key: "w", aliases: ["width"], value: "number", summary: "Width in canvas units (24 to 4000).", example: "w: 200", appliesTo: ["node", "frame"] },
  { key: "h", aliases: ["height"], value: "number", summary: "Height in canvas units (24 to 4000).", example: "h: 90", appliesTo: ["node", "frame"] },
  { key: "padding", value: "number", summary: "Space between a frame's border and its contents (0 to 400).", example: "padding: 24", appliesTo: ["frame"] },
  { key: "from", value: "side", summary: "Side of the source node the connection leaves by: top, right, bottom or left.", example: "from: right", appliesTo: ["edge"] },
  { key: "to", value: "side", summary: "Side of the target node the connection enters by.", example: "to: left", appliesTo: ["edge"] },
];

/** Properties that earlier versions of the language named and ignored; still accepted with a warning. */
export const UNSUPPORTED_PROPERTIES = new Set(["colormode", "stylemode", "typeface", "icon-color"]);

export const EDGE_PROPERTY_KEYS = new Set(["color", "colour", "from", "to"]);

export const propertyDoc = (key: string, element: ElementKind): PropertyDoc | undefined =>
  PROPERTIES.find((p) => p.appliesTo.includes(element) && (p.key === key || p.aliases?.includes(key)));

export const propertyNames = (element: ElementKind): string[] =>
  PROPERTIES.filter((p) => p.appliesTo.includes(element)).flatMap((p) => [p.key, ...(p.aliases ?? [])]);

export const SIDES = ["top", "right", "bottom", "left"] as const;

export const NUMBER_LIMITS = {
  coordinate: 100_000,
  minSize: 24,
  maxSize: 4_000,
  maxPadding: 400,
} as const;

/** Shapes the canvas draws, with the spellings that mean the same. */
export const SHAPES: Array<{ name: "rectangle" | "diamond" | "pill" | "icon"; aliases: string[]; summary: string }> = [
  { name: "rectangle", aliases: [], summary: "The default node: a rounded box with its icon and label." },
  { name: "diamond", aliases: [], summary: "A decision. Also what `kind: decision` draws." },
  { name: "pill", aliases: ["oval", "ellipse"], summary: "A terminator with fully rounded ends. Also what `kind: start` and `kind: end` draw." },
  { name: "icon", aliases: [], summary: "A bare icon with its label underneath; needs `icon:` or a kind." },
];

/**
 * Shapes people ask for that the renderer cannot draw. They are reported, never silently dropped,
 * and the hint says what to use instead. Adding a shape to the canvas moves it into `SHAPES`.
 */
export const UNSUPPORTED_SHAPES: Record<string, string> = {
  cylinder: "For a database use `kind: database`.",
  database: "For a database use `kind: database`.",
  document: "For a document use `icon: file-text, shape: icon`.",
  cloud: "For a cloud service use `icon: cloud, shape: icon`.",
  hexagon: "Use `shape: pill` or `shape: diamond` for a different outline.",
  parallelogram: "Use `shape: pill` or `shape: diamond` for a different outline.",
  circle: "Use `shape: pill` for a rounded outline.",
  triangle: "Use `shape: diamond` for a pointed outline.",
};

export const shapeNames = (): string[] => SHAPES.flatMap((s) => [s.name, ...s.aliases]);

export const resolveShape = (value: string): "rectangle" | "diamond" | "pill" | "icon" | undefined => {
  const v = value.trim().toLowerCase();
  return SHAPES.find((s) => s.name === v || s.aliases.includes(v))?.name;
};

export const KINDS: string[] = [...aiSemanticNodeKindSchema.options];
export const KIND_ALIAS_NAMES: string[] = Object.keys(KIND_ALIASES);

export const DIAGRAM_TYPES: string[] = [...aiDiagramTypeSchema.options];
export const DIAGRAM_TYPE_ALIAS_NAMES: string[] = Object.keys(DIAGRAM_TYPE_ALIASES);

export const DIRECTIONS: Array<{ name: "down" | "right"; aliases: string[] }> = [
  { name: "down", aliases: ["tb", "top-to-bottom", "vertical"] },
  { name: "right", aliases: ["lr", "left-to-right", "horizontal"] },
];

export const resolveDirection = (value: string): "down" | "right" | undefined => {
  const v = value.trim().toLowerCase();
  return DIRECTIONS.find((d) => d.name === v || d.aliases.includes(v))?.name;
};

export const HEADER_KEYS = ["title", "type", "direction"] as const;

export const CONNECTORS: Array<{ symbol: string; summary: string }> = [
  { symbol: ">", summary: "Arrow from the left to the right." },
  { symbol: "<", summary: "Arrow from the right to the left." },
  { symbol: "<>", summary: "Arrow with a head at both ends." },
  { symbol: "-", summary: "Plain line, no arrowhead." },
  { symbol: "--", summary: "Dashed plain line." },
  { symbol: "-->", summary: "Dashed arrow." },
  { symbol: "<-->", summary: "Dashed arrow with a head at both ends." },
];

export const BLOCK_KEYWORDS: Array<{ keyword: "group" | "frame"; summary: string }> = [
  { keyword: "group", summary: "A labelled cluster of nodes. Can nest in groups and frames. (A block with no keyword is a group.)" },
  { keyword: "frame", summary: "A titled container with its own position, size and padding. Can hold nodes, groups and other frames." },
];

// ── kinds and icons ─────────────────────────────────────────────────────────

const iconKey = (value: string) => value.trim().toLowerCase().replace(/[\s_./]+/g, "-");

let libraryNames: Set<string> | null = null;
/** Every id and alias the on-demand icon library holds, read from its catalog without loading any glyph. */
const catalogNames = (): Set<string> => {
  if (libraryNames) return libraryNames;
  const names = new Set<string>();
  for (const entries of Object.values(CATALOG as Record<string, string[]>)) {
    for (const entry of entries) {
      const [glyph, list = ""] = entry.split("|");
      names.add(iconKey(glyph));
      for (const alias of list.split(",").filter(Boolean)) names.add(iconKey(alias));
    }
  }
  return (libraryNames = names);
};

/** All icon names the language can complete: registry (what is loaded) plus the library catalog. */
export const iconCandidates = (registered: Iterable<string>): string[] => [...new Set([...registered, ...catalogNames()])].sort();

export type NameStatus = "known" | "unknown" | "unverifiable";

/**
 * Whether an icon reference exists. Library icons are checked by name against the catalog, so the
 * answer does not depend on whether the library chunk has been loaded. Brand logos (`logo-*`) live
 * in a chunk with no cheap name index, so they are reported as unverifiable rather than wrong.
 */
export const iconStatus = (reference: string): NameStatus => {
  const k = iconKey(reference);
  if (k === "") return "unknown";
  if (resolveIconId(k) !== undefined || catalogNames().has(k)) return "known";
  return k.startsWith("logo-") ? "unverifiable" : "unknown";
};

/** Whether a `kind:` value means something: a kind, an alias of one, or a word the icon registry maps onto a kind. */
export const kindStatus = (value: string): NameStatus => {
  const k = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (k === "") return "unknown";
  if (normalizeSemanticKind(k) !== "generic" || k === "generic") return "known";
  // `kind: postgres` still works: the value is also tried as an icon.
  return iconStatus(k);
};
