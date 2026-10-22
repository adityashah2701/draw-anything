import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { rotatable } from "@/core/shapes/capabilities/rotatable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { getOutlineBounds } from "@/core/shapes/outline/geometry";
import { getOutlineAnchors } from "@/core/shapes/outline/anchors";
import { renderOutlineToCanvas } from "@/core/shapes/outline/renderer";
import { containsPointInOutline, getOutlineResizeHandles, resizeOutline } from "@/core/shapes/outline/interaction";
import { OUTLINE_VARIANTS, resolveOutlineVariant } from "@/core/shapes/outline/variants";

/**
 * Every outline variant is this one definition; the variant only changes the path, anchors and text region.
 * Draw tools are not listed here: `getToolDefinitions` derives one per variant from the registry.
 */
export const outlineDefinition = createShapeDefinition<OutlineShape>({
  type: "outline",
  capabilities: [
    movable<OutlineShape>(),
    resizable<OutlineShape>(),
    rotatable<OutlineShape>(),
    connectable<OutlineShape>(getOutlineAnchors),
    labelable<OutlineShape>(),
  ],
  create: (props) => {
    const variant = resolveOutlineVariant((props as { variant?: unknown }).variant);
    return {
      id: props.id ?? "",
      type: "outline",
      variant: typeof (props as { variant?: unknown }).variant === "string" ? (props as { variant: string }).variant : OUTLINE_VARIANTS[0].id,
      points: props.points ?? [{ x: 0, y: 0 }, { x: variant.defaultSize.width, y: variant.defaultSize.height }],
      color: props.color ?? "#1f2937",
      strokeWidth: props.strokeWidth ?? 2,
      fill: props.fill,
      label: props.label,
      fontSize: props.fontSize,
      fontWeight: props.fontWeight,
      fontStyle: props.fontStyle,
    };
  },
  render: () => null,
  renderToCanvas: renderOutlineToCanvas,
  getBounds: (shape) => getOutlineBounds(shape),
  getAnchors: (shape, bounds) => getOutlineAnchors(shape, bounds ?? null),
  onResize: resizeOutline,
  containsPoint: (shape, point, options) => containsPointInOutline(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) => getOutlineResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
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
