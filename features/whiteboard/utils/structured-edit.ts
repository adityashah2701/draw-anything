import { entityTableSize } from "@/core/shapes/entity-table/layout";
import { parseRows, writeRows } from "@/core/shapes/entity-table/rows";
import { mindmapSize } from "@/core/shapes/mindmap-node/definition";
import { classifierSize } from "@/core/shapes/uml-classifier/layout";
import type { DrawingElement, EntityTableShape, LifelineShape, MindmapNodeShape, UmlClassifierShape } from "@/features/whiteboard/types/whiteboard.types";

/** The shapes whose content (rows, members, names) is edited as text from the inspector. */
export type StructuredElement = EntityTableShape | UmlClassifierShape | MindmapNodeShape | LifelineShape;

export const isStructured = (element: DrawingElement | undefined): element is StructuredElement =>
  !!element && (element.type === "entity-table" || element.type === "uml-classifier" || element.type === "mindmap-node" || element.type === "lifeline");

/** The text fields of a structured element, one entry per box in the inspector. */
export interface StructuredFields {
  title: string;
  name: string;
  /** Entity rows, one `name type pk|fk|uq|nullable -> table.col` per line. */
  rows?: string;
  attributes?: string;
  operations?: string;
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export const readStructured = (element: StructuredElement): StructuredFields => {
  switch (element.type) {
    case "entity-table":
      return { title: "Entity table", name: element.name ?? "", rows: element.rows?.length ? writeRows(element.rows).split("; ").join("\n") : "" };
    case "uml-classifier":
      return { title: "Class", name: element.name ?? "", attributes: (element.attributes ?? []).join("\n"), operations: (element.operations ?? []).join("\n") };
    case "mindmap-node":
      return { title: "Topic", name: element.label ?? "" };
    case "lifeline":
      return { title: "Lifeline", name: element.name ?? "" };
  }
};

const corners = (element: DrawingElement) => {
  const [a, b] = element.points;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

/** Grows the box to fit new content, keeping its top-left corner and never shrinking what the person sized. */
const fitted = <T extends DrawingElement>(element: T, min: { width: number; height: number }): T => {
  const c = corners(element);
  const w = Math.max(c.w, min.width);
  const h = Math.max(c.h, min.height);
  return { ...element, points: [{ x: c.x, y: c.y }, { x: c.x + w, y: c.y + h }] };
};

/** One edit: the new text of one field. Returns the changed element (resized to fit), or the same one when nothing applies. */
export const planStructured = (element: StructuredElement, field: keyof Omit<StructuredFields, "title">, text: string): StructuredElement => {
  switch (element.type) {
    case "entity-table": {
      const next: EntityTableShape = field === "rows" ? { ...element, rows: parseRows(lines(text).join(";")) } : field === "name" ? { ...element, name: text.trim() || undefined } : element;
      return fitted(next, entityTableSize(next));
    }
    case "uml-classifier": {
      const next: UmlClassifierShape =
        field === "attributes" ? { ...element, attributes: lines(text) } : field === "operations" ? { ...element, operations: lines(text) } : field === "name" ? { ...element, name: text.trim() || undefined } : element;
      return fitted(next, classifierSize(next));
    }
    case "mindmap-node": {
      if (field !== "name") return element;
      const next: MindmapNodeShape = { ...element, label: text.trim() };
      return fitted(next, mindmapSize(next));
    }
    case "lifeline":
      return field === "name" ? { ...element, name: text.trim() || undefined } : element;
  }
};
