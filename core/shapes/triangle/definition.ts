import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { TriangleShape } from "@/core/shapes/triangle/types";
import { getTriangleBounds } from "@/core/shapes/triangle/geometry";
import { getTriangleAnchors } from "@/core/shapes/triangle/anchors";
import { renderTriangleToCanvas } from "@/core/shapes/triangle/renderer";
import { Triangle } from "lucide-react";
import {
  containsPointInTriangle,
  getTriangleResizeHandles,
  resizeTriangle,
} from "@/core/shapes/triangle/interaction";

export const triangleDefinition = createShapeDefinition<TriangleShape>({
  type: "triangle",
  capabilities: [
    movable<TriangleShape>(),
    resizable<TriangleShape>(),
    connectable<TriangleShape>(getTriangleAnchors),
    labelable<TriangleShape>(),
  ],
  create: (props) => ({
    id: props.id ?? "",
    type: "triangle",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill,
    label: props.label,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
  }),
  render: () => null,
  renderToCanvas: renderTriangleToCanvas,
  getBounds: (shape) => getTriangleBounds(shape),
  getAnchors: (shape, bounds) => getTriangleAnchors(shape, bounds ?? null),
  onResize: resizeTriangle,
  containsPoint: (shape, point, options) =>
    containsPointInTriangle(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getTriangleResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
  toolbarConfig: {
    icon: Triangle,
    label: "Triangle",
    shortcut: "G", // Or 'Y' or any other shortcut. Let's make it 'G' or empty. Let's use 'X' or no shortcut or 'G'. Let's say 'G'.
    group: "shapes",
    order: 4,
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
