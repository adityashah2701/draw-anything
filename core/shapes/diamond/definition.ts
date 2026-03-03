import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { DiamondShape } from "@/core/shapes/diamond/types";
import { getDiamondBounds } from "@/core/shapes/diamond/geometry";
import { getDiamondAnchors } from "@/core/shapes/diamond/anchors";
import { renderDiamondToCanvas } from "@/core/shapes/diamond/renderer";
import {
  containsPointInDiamond,
  getDiamondResizeHandles,
  resizeDiamond,
} from "@/core/shapes/diamond/interaction";

export const diamondDefinition = createShapeDefinition<DiamondShape>({
  type: "diamond",
  capabilities: [
    movable<DiamondShape>(),
    resizable<DiamondShape>(),
    connectable<DiamondShape>(getDiamondAnchors),
    labelable<DiamondShape>(),
  ],
  create: (props) => ({
    id: props.id ?? "",
    type: "diamond",
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
  renderToCanvas: renderDiamondToCanvas,
  getBounds: (shape) => getDiamondBounds(shape),
  getAnchors: (shape, bounds) => getDiamondAnchors(shape, bounds ?? null),
  onResize: resizeDiamond,
  containsPoint: (shape, point, options) =>
    containsPointInDiamond(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) =>
    getDiamondResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
});
