import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { ArrowShape } from "@/core/shapes/arrow/types";
import { getArrowBounds } from "@/core/shapes/arrow/geometry";
import { getArrowAnchors } from "@/core/shapes/arrow/anchors";
import { renderArrowToCanvas } from "@/core/shapes/arrow/renderer";
import { ArrowRight } from "lucide-react";
import {
  containsPointInArrow,
  getArrowResizeHandles,
  resizeArrow,
} from "@/core/shapes/arrow/interaction";

export const arrowDefinition = createShapeDefinition<ArrowShape>({
  type: "arrow",
  capabilities: [movable<ArrowShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "arrow",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 120, y: 0 }],
    color: props.color ?? "#475569",
    strokeWidth: props.strokeWidth ?? 2,
    dashed: props.dashed,
    arrowHeadStart: props.arrowHeadStart ?? false,
    arrowHeadEnd: props.arrowHeadEnd ?? true,
    routingMode: props.routingMode ?? "orthogonal",
    routePreference: props.routePreference,
    isManuallyRouted: props.isManuallyRouted ?? false,
    startConnection: props.startConnection,
    endConnection: props.endConnection,
  }),
  render: () => null,
  renderToCanvas: renderArrowToCanvas,
  getBounds: (shape) => getArrowBounds(shape),
  getAnchors: (shape) => getArrowAnchors(shape),
  onResize: resizeArrow,
  containsPoint: (shape, point, options) =>
    containsPointInArrow(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape) => getArrowResizeHandles(shape),
  validate: (shape) => shape.points.length >= 2,
  toolbarConfig: {
    icon: ArrowRight,
    label: "Arrow",
    shortcut: "A",
    group: "connectors",
    order: 1,
  },
  propertiesConfig: {
    supportsColor: true,
    supportsFill: false,
    supportsStrokeWidth: true,
    supportsFontSize: false,
  },
  labelConfig: {
    anchor: "none",
    padding: 0,
    verticalAlign: "middle",
  },
});
