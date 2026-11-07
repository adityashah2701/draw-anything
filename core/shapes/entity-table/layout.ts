import { estimateTextWidth } from "@/core/text/estimate";
import type { EntityRow, EntityTableShape } from "@/core/model";

/**
 * Where everything sits in an entity table, in world units. Pure: the canvas, the export and the AI sizing all
 * read it, so they cannot disagree. A table is a header, then one row per column of the entity; columns for the
 * name, the type and the key markers are as wide as their widest text.
 */
export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 26;
export const PAD_X = 10;
export const COLUMN_GAP = 14;
const FONT = 13;
const FONT_MARGIN = 1.15;
const MARKER_MIN = 30;
const MARKER_GAP = 8;

export const rowsOf = (shape: Pick<EntityTableShape, "rows">): EntityRow[] => (Array.isArray(shape.rows) ? shape.rows.filter((r) => r && typeof r.id === "string") : []);

export const markerText = (row: EntityRow): string => (row.keys ?? []).map((k) => k.toUpperCase()).join(",");

export interface EntityLayout {
  headerHeight: number;
  rowHeight: number;
  /** Left edges of the marker, name and type columns, from the box's left. */
  columns: { marker: number; name: number; type: number };
  /** The smallest width and height that show everything. */
  minWidth: number;
  minHeight: number;
}

export const layoutEntityTable = (shape: Pick<EntityTableShape, "rows" | "name" | "kind">): EntityLayout => {
  const rows = rowsOf(shape);
  const visible = shape.kind === "junction" ? rows.filter((r) => r.keys?.includes("fk")) : rows;
  // The estimate is for Inter, and the app shows the viewer's own font, which can be wider: keep a margin so no row spills out of its table.
  const nameW = Math.max(40, ...visible.map((r) => estimateTextWidth(r.name + (r.nullable ? "?" : ""), FONT, "500") * FONT_MARGIN));
  const typeW = Math.max(0, ...visible.map((r) => estimateTextWidth(r.type ?? "", FONT, "400") * FONT_MARGIN));
  // The key column is as wide as its widest marker (`PK,FK`), so a composite key never runs into the name.
  const markerW = Math.max(MARKER_MIN, ...visible.map((r) => estimateTextWidth(markerText(r), 11, "600") + MARKER_GAP));
  const marker = PAD_X;
  const name = marker + markerW;
  const type = name + nameW + COLUMN_GAP;
  const titleW = estimateTextWidth(shape.name ?? "Entity", 14, "700") + PAD_X * 2 + (shape.kind === "associative" ? 14 : 0);
  return {
    headerHeight: HEADER_HEIGHT,
    rowHeight: ROW_HEIGHT,
    columns: { marker, name, type },
    minWidth: Math.max(120, titleW, type + typeW + PAD_X),
    minHeight: HEADER_HEIGHT + visible.length * ROW_HEIGHT + (visible.length > 0 ? 6 : 0),
  };
};

/** The size a new table of these rows would be given. */
export const entityTableSize = (shape: Pick<EntityTableShape, "rows" | "name" | "kind">) => {
  const l = layoutEntityTable(shape);
  return { width: Math.ceil(l.minWidth), height: Math.ceil(l.minHeight) };
};

/** The row under a world y inside the box, by its id; null over the header or past the last row. */
export const rowAt = (shape: Pick<EntityTableShape, "rows" | "kind">, top: number, y: number): string | null => {
  const rows = shape.kind === "junction" ? rowsOf(shape).filter((r) => r.keys?.includes("fk")) : rowsOf(shape);
  const i = Math.floor((y - top - HEADER_HEIGHT) / ROW_HEIGHT);
  return i >= 0 && i < rows.length ? rows[i].id : null;
};
