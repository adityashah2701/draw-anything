import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { LineShape } from "@/core/shapes/line/types";
import { getLineBounds } from "@/core/shapes/line/geometry";
import { getLineAnchors } from "@/core/shapes/line/anchors";
import { renderLineToCanvas } from "@/core/shapes/line/renderer";
import {
  containsPointInLine,
  getLineResizeHandles,
  resizeLine,
} from "@/core/shapes/line/interaction";

export const lineDefinition = createShapeDefinition<LineShape>({
  type: "line",
  capabilities: [movable<LineShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "line",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 120, y: 0 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
  }),
  render: () => null,
  renderToCanvas: renderLineToCanvas,
  getBounds: (shape) => getLineBounds(shape),
  getAnchors: (shape) => getLineAnchors(shape),
  onResize: resizeLine,
  containsPoint: (shape, point, options) =>
    containsPointInLine(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape) => getLineResizeHandles(shape),
  validate: (shape) => shape.points.length >= 2,
});
