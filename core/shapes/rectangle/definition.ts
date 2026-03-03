import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { RectangleShape } from "@/core/shapes/rectangle/types";
import { getRectangleBounds } from "@/core/shapes/rectangle/geometry";
import { getRectangleAnchors } from "@/core/shapes/rectangle/anchors";
import { renderRectangleToCanvas } from "@/core/shapes/rectangle/renderer";
import {
  containsPointInRectangle,
  getRectangleResizeHandles,
  resizeRectangle,
} from "@/core/shapes/rectangle/interaction";

export const rectangleDefinition = createShapeDefinition<RectangleShape>({
  type: "rectangle",
  capabilities: [
    movable<RectangleShape>(),
    resizable<RectangleShape>(),
    connectable<RectangleShape>(getRectangleAnchors),
    labelable<RectangleShape>(),
  ],
  create: (props) => ({
    id: props.id ?? "",
    type: "rectangle",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 160, y: 100 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill,
    label: props.label,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
  }),
  render: () => null,
  renderToCanvas: renderRectangleToCanvas,
  getBounds: (shape) => getRectangleBounds(shape),
  getAnchors: (shape, bounds) => getRectangleAnchors(shape, bounds ?? null),
  onResize: resizeRectangle,
  containsPoint: (shape, point, options) =>
    containsPointInRectangle(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getRectangleResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
});
