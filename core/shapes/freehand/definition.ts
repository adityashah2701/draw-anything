import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { FreehandShape } from "@/core/shapes/freehand/types";
import { getFreehandBounds } from "@/core/shapes/freehand/geometry";
import { getFreehandAnchors } from "@/core/shapes/freehand/anchors";
import { renderFreehandToCanvas } from "@/core/shapes/freehand/renderer";
import {
  containsPointInFreehand,
  getFreehandResizeHandles,
  resizeFreehand,
} from "@/core/shapes/freehand/interaction";

export const freehandDefinition = createShapeDefinition<FreehandShape>({
  type: "freehand",
  capabilities: [movable<FreehandShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "freehand",
    points: props.points ?? [{ x: 0, y: 0 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
  }),
  render: () => null,
  renderToCanvas: renderFreehandToCanvas,
  getBounds: (shape) => getFreehandBounds(shape),
  getAnchors: (shape) => getFreehandAnchors(shape),
  onResize: resizeFreehand,
  containsPoint: (shape, point, options) =>
    containsPointInFreehand(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape) => getFreehandResizeHandles(shape),
  validate: (shape) => shape.points.length >= 1,
});
