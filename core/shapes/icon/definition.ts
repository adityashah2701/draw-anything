import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { rotatable } from "@/core/shapes/capabilities/rotatable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { IconShape } from "@/core/shapes/icon/types";
import { getIconBounds } from "@/core/shapes/icon/geometry";
import { getIconAnchors } from "@/core/shapes/icon/anchors";
import { renderIconToCanvas } from "@/core/shapes/icon/renderer";
import { containsPointInIcon, getIconResizeHandles, resizeIcon } from "@/core/shapes/icon/interaction";

/**
 * A standalone icon: a glyph from the icon registry (`ai.icon`) or a user's own (`ai.customIcon`) on the
 * board, with no node box. It has no label of its own (an AI diagram can give it a caption under the glyph). It moves, resizes, takes a colour and connects like any shape. It is
 * inserted from the icon picker, so it has no drawing tool.
 */
export const iconDefinition = createShapeDefinition<IconShape>({
  type: "icon",
  capabilities: [movable<IconShape>(), resizable<IconShape>(), rotatable<IconShape>(), connectable<IconShape>(getIconAnchors)],
  create: (props) => ({
    id: props.id ?? "",
    type: "icon",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 64, y: 64 }],
    color: props.color ?? "#475569",
    strokeWidth: props.strokeWidth ?? 2,
    ...(props.label ? { label: props.label, fontSize: props.fontSize, fontWeight: props.fontWeight, fontStyle: props.fontStyle } : {}),
    ai: props.ai,
  }),
  render: () => null,
  renderToCanvas: renderIconToCanvas,
  getBounds: (shape) => getIconBounds(shape),
  getAnchors: (shape, bounds) => getIconAnchors(shape, bounds ?? null),
  onResize: resizeIcon,
  containsPoint: (shape, point, options) => containsPointInIcon(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) => getIconResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
  propertiesConfig: { supportsColor: true, supportsFill: false, supportsStrokeWidth: true, supportsFontSize: false },
});

