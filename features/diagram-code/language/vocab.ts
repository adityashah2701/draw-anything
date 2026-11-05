import { resolveIconId } from "@/core/icons/registry";
import { RELATION_KINDS } from "@/core/shapes/arrow/relations";
import { MARKER_IDS } from "@/core/shapes/outline/markers";
import { BPMN_SHAPES } from "./bpmn";
import { STRUCTURED_SHAPES } from "./structured";
import { listOutlineVariants } from "@/core/shapes/outline/variants";
import { aliasesForOutline, parametersOf, supportedEntries } from "@/core/shapes/vocabulary";
import CATALOG from "@/core/icons/catalog.json";
import { DIAGRAM_TYPE_ALIASES, KIND_ALIASES, aiDiagramTypeSchema, aiSemanticNodeKindSchema, normalizeSemanticKind } from "@/features/ai/schemas";

/**
 * Everything the language knows by name, in one place. Validation, completion, hover and the
 * reference docs all read these tables, so they cannot disagree.
 */

/** "rectangle (default), diamond, pill, icon, cylinder, ..." for the `shape` property doc; read from the registry. */
function shapeListText() {
  return ["rectangle (default)", "diamond", "pill", "icon", ...listOutlineVariants().map((variant) => variant.id)].join(", ");
}

export type ElementKind = "node" | "group" | "frame" | "edge";
export type ValueType = "text" | "kind" | "icon" | "shape" | "border" | "marker" | "bpmn" | "data" | "status" | "relation" | "notation" | "end" | "role" | "color" | "boolean" | "number" | "side";

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
  { key: "shape", value: "shape", summary: `How the node is drawn: ${shapeListText()}.`, example: "shape: diamond", appliesTo: ["node"] },
  { key: "border", value: "border", summary: "A second line inside the outline (double) or a heavier one (thick). A plain rectangle, diamond or pill is then drawn as a box, rhombus or ring.", example: "border: double", appliesTo: ["node"] },
  { key: "marker", value: "marker", summary: `A small glyph inside the shape: ${MARKER_IDS.join(", ")}.`, example: "marker: clock", appliesTo: ["node"] },
  { key: "rows", value: "data", summary: "The rows of an entity: `name type pk|fk|uq|nullable`, separated by `;`, a foreign key as `fk -> table.column`.", example: 'rows: "id int pk; team_id int fk -> teams.id"', appliesTo: ["node"] },
  { key: "attributes", value: "data", summary: "The attributes of a class (or the literals of an enum), separated by `;`: `-total: Money`.", example: 'attributes: "-total: Money; +id: int"', appliesTo: ["node"] },
  { key: "operations", value: "data", summary: "The operations of a class, separated by `;`: `+pay(method: Method): Receipt`.", example: 'operations: "+pay(): Receipt"', appliesTo: ["node"] },
  { key: "variant", value: "data", summary: "A structured shape's variant: weak, associative or junction (entity); abstract, template, object, datatype or record (class).", example: "variant: weak", appliesTo: ["node"] },
  { key: "stereotype", value: "data", summary: "The stereotype written above a class's name.", example: "stereotype: service", appliesTo: ["node"] },
  { key: "template", value: "data", summary: "The template parameters of a class, in a dashed box on its corner.", example: "template: T", appliesTo: ["node"] },
  { key: "position", value: "bpmn", summary: "Where a BPMN event sits in the process: start, intermediate or end.", example: "position: end", appliesTo: ["node"] },
  { key: "trigger", value: "bpmn", summary: "What triggers a BPMN event: message, timer, error, signal, conditional, escalation, terminate or link.", example: "trigger: message", appliesTo: ["node"] },
  { key: "gateway", value: "bpmn", summary: "The kind of a BPMN gateway: exclusive, parallel, inclusive, event-based or complex.", example: "gateway: parallel", appliesTo: ["node"] },
  { key: "task", value: "bpmn", summary: "The type of a BPMN task: user, service, script, manual, send, receive or rule.", example: "task: service", appliesTo: ["node"] },
  { key: "throwing", value: "boolean", summary: "A BPMN event that throws its trigger (true) instead of catching it: the symbol is filled.", example: "throwing: true", appliesTo: ["node"] },
  { key: "stack", value: "boolean", summary: "Draw the shape as a stack of three (true or false).", example: "stack: true", appliesTo: ["node"] },
  { key: "status", value: "status", summary: "A meaning in colour: error (red), warning (orange), success (green) or info (blue). Same as color, for what the node is telling.", example: "status: error", appliesTo: ["node"] },
  { key: "color", aliases: ["colour"], value: "color", summary: "Outline colour (a name such as blue, or #rrggbb). The fill is a tint of it.", example: "color: blue", appliesTo: ["node", "frame", "edge"] },
  { key: "dashed", value: "boolean", summary: "Draw the outline dashed (true or false).", example: "dashed: true", appliesTo: ["node"] },
  { key: "x", value: "number", summary: "Left edge in canvas units. With y, pins the element exactly there.", example: "x: 120", appliesTo: ["node", "frame"] },
  { key: "y", value: "number", summary: "Top edge in canvas units.", example: "y: 80", appliesTo: ["node", "frame"] },
  { key: "w", aliases: ["width"], value: "number", summary: "Width in canvas units (24 to 4000).", example: "w: 200", appliesTo: ["node", "frame"] },
  { key: "h", aliases: ["height"], value: "number", summary: "Height in canvas units (24 to 4000).", example: "h: 90", appliesTo: ["node", "frame"] },
  { key: "padding", value: "number", summary: "Space between a frame's border and its contents (0 to 400).", example: "padding: 24", appliesTo: ["frame"] },
  { key: "from", value: "end", summary: "At the source end: the side the connection leaves by (top, right, bottom or left), or what it says about that end (a multiplicity such as 0..*, or a cardinality such as many).", example: "from: right", appliesTo: ["edge"] },
  { key: "to", value: "end", summary: "At the target end: the side the connection enters by, or what it says about that end (1, 0..1, one-or-many, ...).", example: "to: 0..*", appliesTo: ["edge"] },
  { key: "relation", value: "relation", summary: `What the connection means: ${RELATION_KINDS.join(", ")}. It decides the line style, the heads and the end glyphs.`, example: "relation: composition", appliesTo: ["edge"] },
  { key: "notation", value: "notation", summary: "How an ER relationship is drawn: crows-foot (default) or chen. The meaning does not change.", example: "notation: chen", appliesTo: ["edge"] },
  { key: "from-end", value: "end", summary: "The same as from: when it is a multiplicity or cardinality; used where from: already names a side.", example: "from-end: 1", appliesTo: ["edge"] },
  { key: "to-end", value: "end", summary: "The same as to: when it is a multiplicity or cardinality.", example: "to-end: 0..*", appliesTo: ["edge"] },
  { key: "from-role", value: "role", summary: "The role the source plays in the relation, written under the line at that end.", example: 'from-role: "owner"', appliesTo: ["edge"] },
  { key: "to-role", value: "role", summary: "The role the target plays, written under the line at that end.", example: 'to-role: "items"', appliesTo: ["edge"] },
];

/** Properties that earlier versions of the language named and ignored; still accepted with a warning. */
export const UNSUPPORTED_PROPERTIES = new Set(["colormode", "stylemode", "typeface", "icon-color"]);

export const EDGE_PROPERTY_KEYS = new Set(["color", "colour", "from", "to", "relation", "notation", "from-role", "to-role", "from-end", "to-end"]);

/** Properties only a connection has. A bracket after the last name of a connection that holds nothing else is the connection's own: `A > B [relation: composition]`. */
export const EDGE_ONLY_KEYS = new Set([...EDGE_PROPERTY_KEYS].filter((key) => key !== "color" && key !== "colour"));

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

/** A shape name the language accepts, with the spellings that mean the same. */
export interface ShapeEntry {
  name: string;
  aliases: string[];
  summary: string;
}

/**
 * Shapes the canvas draws, with the spellings that mean the same. The outline shapes are not listed by
 * hand: they come from the outline variant registry (core/shapes/outline/variants.ts), so a new variant
 * is accepted, completed, documented and hinted here without a change to this file.
 */
export const SHAPES: ShapeEntry[] = [
  { name: "rectangle", aliases: [], summary: "The default node: a rounded box with its icon and label." },
  { name: "diamond", aliases: [], summary: "A decision. Also what `kind: decision` draws." },
  { name: "pill", aliases: ["oval", "ellipse"], summary: "A terminator with fully rounded ends. Also what `kind: start` and `kind: end` draw." },
  { name: "icon", aliases: [], summary: "A bare icon with its label underneath; needs `icon:` or a kind." },
  ...listOutlineVariants().map((variant) => ({ name: variant.id, aliases: aliasesForOutline(variant.id), summary: `${variant.description} Resizable like any node.` })),
  // Outlines with a border, a marker or a stack: each is one name here, drawn as its base outline with those parameters.
  ...STRUCTURED_SHAPES.map((s) => ({ name: s.name, aliases: [...s.aliases], summary: s.summary })),
  ...BPMN_SHAPES.map((s) => ({ name: s.name, aliases: [...s.aliases], summary: s.summary })),
  ...supportedEntries()
    .filter((entry) => entry.representation.kind === "parametric")
    .map((entry) => ({ name: entry.id, aliases: [...entry.aliases], summary: entry.guidance })),
];

/** What a parametric shape name draws: the base outline and its parameters. Undefined for any other shape. */
export const parametricShape = (name: string) => {
  const entry = supportedEntries().find((e) => e.id === name);
  return entry ? parametersOf(entry) : undefined;
};

/**
 * Shapes people ask for that the renderer cannot draw. They are reported, never silently dropped,
 * and the hint says what to use instead. Adding a shape to the canvas moves it into `SHAPES`.
 */
export const UNSUPPORTED_SHAPES: Record<string, string> = {
  database: "For a database use `kind: database` or `shape: cylinder`.",
  circle: "Use `shape: pill` for a rounded outline.",
  triangle: "Use `shape: diamond` for a pointed outline.",
};

export const shapeNames = (): string[] => SHAPES.flatMap((s) => [s.name, ...s.aliases]);

export const resolveShape = (value: string): string | undefined => {
  const v = value.trim().toLowerCase();
  return SHAPES.find((s) => s.name === v || s.aliases.includes(v))?.name;
};

export const KINDS: string[] = [...aiSemanticNodeKindSchema.options];
export const KIND_ALIAS_NAMES: string[] = Object.keys(KIND_ALIASES);

export const DIAGRAM_TYPES: string[] = [...aiDiagramTypeSchema.options];
export const DIAGRAM_TYPE_ALIAS_NAMES: string[] = Object.keys(DIAGRAM_TYPE_ALIASES);

export type CodeDirection = "down" | "right" | "up" | "left";

export const DIRECTIONS: Array<{ name: CodeDirection; aliases: string[] }> = [
  { name: "down", aliases: ["tb", "top-to-bottom", "vertical"] },
  { name: "right", aliases: ["lr", "left-to-right", "horizontal"] },
  { name: "up", aliases: ["bt", "bottom-to-top"] },
  { name: "left", aliases: ["rl", "right-to-left"] },
];

export const resolveDirection = (value: string): CodeDirection | undefined => {
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
