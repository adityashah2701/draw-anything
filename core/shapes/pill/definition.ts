import { RectangleHorizontal } from "lucide-react";
import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { rotatable } from "@/core/shapes/capabilities/rotatable";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { labelable } from "@/core/shapes/capabilities/labelable";
import { PillShape } from "@/core/shapes/pill/types";
import { getPillAnchors, getPillBounds } from "@/core/shapes/pill/geometry";
import { containsPointInPill, getPillResizeHandles, resizePill } from "@/core/shapes/pill/interaction";
import { renderPillToCanvas } from "@/core/shapes/pill/renderer";

/** Flowchart terminator (start/end): from the toolbar, diagram code and AI diagrams. */
export const pillDefinition = createShapeDefinition<PillShape>({
  type: "pill",
  capabilities: [movable<PillShape>(), resizable<PillShape>(), rotatable<PillShape>(), connectable<PillShape>(getPillAnchors), labelable<PillShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "pill",
    points: props.points ?? [{ x: 0, y: 0 }, { x: 160, y: 60 }],
    color: props.color ?? "#1f2937",
    strokeWidth: props.strokeWidth ?? 2,
    fill: props.fill,
    label: props.label,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
  }),
  render: () => null,
  renderToCanvas: renderPillToCanvas,
  getBounds: (shape) => getPillBounds(shape),
  getAnchors: (shape, bounds) => getPillAnchors(shape, bounds ?? getPillBounds(shape)),
  onResize: resizePill,
  containsPoint: (shape, point, options) => containsPointInPill(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) => getPillResizeHandles(shape, options?.bounds),
  validate: (shape) => shape.points.length >= 2,
  toolbarConfig: { icon: RectangleHorizontal, label: "Terminator", group: "shapes", order: 3.5 },
  propertiesConfig: { supportsColor: true, supportsFill: true, supportsStrokeWidth: true, supportsFontSize: false },
  labelConfig: { anchor: "center", padding: 12, verticalAlign: "middle" },
});
