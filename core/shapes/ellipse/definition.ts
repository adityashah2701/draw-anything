import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { rotatable } from "@/core/shapes/capabilities/rotatable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { EllipseShape } from "@/core/shapes/ellipse/types";
import { getEllipseBounds } from "@/core/shapes/ellipse/geometry";
import { getEllipseAnchors } from "@/core/shapes/ellipse/anchors";
import { renderEllipseToCanvas } from "@/core/shapes/ellipse/renderer";
import { Circle } from "lucide-react";
import {
  containsPointInEllipse,
  getEllipseResizeHandles,
  resizeEllipse,
} from "@/core/shapes/ellipse/interaction";

export const ellipseDefinition = createShapeDefinition<EllipseShape>({
  type: "ellipse",
  capabilities: [
    movable<EllipseShape>(),
    resizable<EllipseShape>(), rotatable<EllipseShape>(),
    connectable<EllipseShape>(getEllipseAnchors),
    labelable<EllipseShape>(),
  ],
  create: (props) => ({
    id: props.id ?? "",
    type: "ellipse",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 140, y: 100 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill,
    label: props.label,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
  }),
  render: () => null,
  renderToCanvas: renderEllipseToCanvas,
  getBounds: (shape) => getEllipseBounds(shape),
  getAnchors: (shape, bounds) => getEllipseAnchors(shape, bounds ?? null),
  onResize: resizeEllipse,
  containsPoint: (shape, point, options) =>
    containsPointInEllipse(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getEllipseResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
  toolbarConfig: {
    icon: Circle,
    label: "Ellipse",
    shortcut: "C",
    group: "shapes",
    order: 2,
  },
  propertiesConfig: {
    supportsColor: true,
    supportsFill: true,
    supportsStrokeWidth: true,
    supportsFontSize: false,
  },
  labelConfig: {
    anchor: "center",
    padding: 12,
    verticalAlign: "middle",
  },
});
