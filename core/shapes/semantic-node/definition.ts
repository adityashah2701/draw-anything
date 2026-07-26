import { Network } from "lucide-react";
import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { getSemanticNodeAnchors } from "@/core/shapes/semantic-node/anchors";
import { getSemanticNodeBounds } from "@/core/shapes/semantic-node/geometry";
import {
  containsPointInSemanticNode,
  getSemanticNodeResizeHandles,
  resizeSemanticNode,
} from "@/core/shapes/semantic-node/interaction";
import { renderSemanticNodeToCanvas } from "@/core/shapes/semantic-node/renderer";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";

export const semanticNodeDefinition = createShapeDefinition<SemanticNodeShape>({
  type: "semantic-node",
  capabilities: [
    movable<SemanticNodeShape>(),
    resizable<SemanticNodeShape>(),
    connectable<SemanticNodeShape>(getSemanticNodeAnchors),
    labelable<SemanticNodeShape>(),
  ],
  create: (props) => ({
    id: props.id ?? crypto.randomUUID(),
    type: "semantic-node",
    points: props.points ?? [],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill ?? "#eef2ff",
    label: props.label ?? "Node",
    fontSize: props.fontSize ?? 17,
    fontWeight: props.fontWeight ?? "600",
    fontStyle: props.fontStyle ?? "normal",
    ai: props.ai,
  }),
  render: () => null,
  renderToCanvas: renderSemanticNodeToCanvas,
  getBounds: (shape) => getSemanticNodeBounds(shape),
  getAnchors: (shape, bounds) => getSemanticNodeAnchors(shape, bounds ?? null),
  onResize: resizeSemanticNode,
  containsPoint: (shape, point, options) =>
    containsPointInSemanticNode(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getSemanticNodeResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
  toolbarConfig: {
    icon: Network,
    label: "Semantic Node",
    group: "shapes",
    order: 9,
  },
  propertiesConfig: {
    supportsColor: true,
    supportsFill: true,
    supportsStrokeWidth: true,
    supportsFontSize: true,
  },
  labelConfig: {
    anchor: "center",
    padding: 16,
    verticalAlign: "middle",
  },
});
