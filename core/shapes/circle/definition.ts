import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { CircleShape } from "@/core/shapes/circle/types";
import { getCircleBounds } from "@/core/shapes/circle/geometry";
import { getCircleAnchors } from "@/core/shapes/circle/anchors";
import { renderCircleToCanvas } from "@/core/shapes/circle/renderer";
import {
  containsPointInCircle,
  getCircleResizeHandles,
  resizeCircle,
} from "@/core/shapes/circle/interaction";

export const circleDefinition = createShapeDefinition<CircleShape>({
  type: "circle",
  capabilities: [
    movable<CircleShape>(),
    resizable<CircleShape>(),
    connectable<CircleShape>(getCircleAnchors),
    labelable<CircleShape>(),
  ],
  create: (props) => ({
    id: props.id ?? "",
    type: "circle",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 60, y: 0 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill,
    label: props.label,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
  }),
  render: () => null,
  renderToCanvas: renderCircleToCanvas,
  getBounds: (shape) => getCircleBounds(shape),
  getAnchors: (shape, bounds) => getCircleAnchors(shape, bounds ?? null),
  onResize: resizeCircle,
  containsPoint: (shape, point, options) =>
    containsPointInCircle(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getCircleResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
});
