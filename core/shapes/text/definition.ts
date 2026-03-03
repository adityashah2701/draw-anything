import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { TextShape } from "@/core/shapes/text/types";
import { getTextBounds } from "@/core/shapes/text/geometry";
import { getTextAnchors } from "@/core/shapes/text/anchors";
import { renderTextToCanvas } from "@/core/shapes/text/renderer";
import {
  containsPointInText,
  getTextResizeHandles,
  resizeText,
} from "@/core/shapes/text/interaction";

export const textDefinition = createShapeDefinition<TextShape>({
  type: "text",
  capabilities: [movable<TextShape>(), labelable<TextShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "text",
    points: props.points ?? [{ x: 0, y: 0 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 1,
    text: props.text ?? "",
    fontSize: props.fontSize ?? 20,
    fontWeight: props.fontWeight ?? "400",
    fontStyle: props.fontStyle ?? "normal",
  }),
  render: () => null,
  renderToCanvas: renderTextToCanvas,
  getBounds: (shape, context) => getTextBounds(shape, context),
  getAnchors: (shape) => getTextAnchors(shape),
  onResize: resizeText,
  containsPoint: (shape, point, options) =>
    containsPointInText(shape, point, options?.bounds),
  getResizeHandles: (shape, options) =>
    getTextResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 1,
});
