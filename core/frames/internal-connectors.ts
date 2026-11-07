import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { DrawingElement } from "@/core/model";

/** The key an arrow's label is linked by: diagram arrows use their `semanticId`, hand-made ones their id. */
export const labelKeyOf = (arrow: DrawingElement): string =>
  `${arrow.ai?.semanticId ?? arrow.id}-label`;

/**
 * `origin` plus the connectors (and their labels) that sit entirely inside it: both ends attached to
 * shapes in `origin`. Such a connector belongs to the moving body even when the user did not select it
 * (a grouped diagram, a marquee that missed a thin line), so it travels with the shapes and keeps its
 * exact path instead of being handed to the router on every frame. Call it once when the gesture
 * starts, on the shapes as they were then.
 */
export const withInternalConnectors = (
  origin: readonly DrawingElement[],
  shapes: readonly DrawingElement[],
): DrawingElement[] => {
  const ids = new Set(origin.map((shape) => shape.id));
  const extra: DrawingElement[] = [];
  const carried = new Set<string>();
  for (const shape of shapes) {
    if (ids.has(shape.id) || !isArrowElement(shape)) continue;
    const start = shape.startConnection?.elementId;
    const end = shape.endConnection?.elementId;
    if (!start || !end || !ids.has(start) || !ids.has(end)) continue;
    extra.push(shape);
    carried.add(labelKeyOf(shape));
  }
  if (extra.length === 0) return [...origin];
  for (const shape of shapes) {
    if (
      !ids.has(shape.id) &&
      shape.ai?.role === "edge-label" &&
      shape.ai.semanticId &&
      carried.has(shape.ai.semanticId)
    ) {
      extra.push(shape);
    }
  }
  return [...origin, ...extra];
};

