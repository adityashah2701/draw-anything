import { Frame } from "lucide-react";
import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { unionBounds } from "@/core/geometry/box";
import { frameBox, frameRegions, hasValidBox } from "@/core/frames/frame-model";
import { containsPointInFrame, getFrameResizeHandles, resizeFrameShape } from "@/core/shapes/frame/interaction";
import { renderFrameToCanvas } from "@/core/shapes/frame/renderer";
import type { FrameShape } from "@/features/whiteboard/types/whiteboard.types";

/**
 * The frame's shape definition. It is deliberately not `connectable` (no anchors, so connectors
 * neither attach to it nor route around it) and not `rotatable`, and it has no label capability: its
 * title is a field of the frame, edited in place, never a separate text element.
 */
export const frameDefinition = createShapeDefinition<FrameShape>({
  type: "frame",
  capabilities: [movable<FrameShape>(), resizable<FrameShape>()],
  create: (props) => ({
    id: props.id ?? "",
    type: "frame",
    points: props.points ?? [
      { x: 0, y: 0 },
      { x: 320, y: 200 },
    ],
    color: props.color ?? "#64748b",
    strokeWidth: props.strokeWidth ?? 1,
    ...(props.fill !== undefined ? { fill: props.fill } : {}),
    ...(props.title !== undefined ? { title: props.title } : {}),
    ...(props.frameId !== undefined ? { frameId: props.frameId } : {}),
  }),
  render: () => null,
  renderToCanvas: renderFrameToCanvas,
  getBounds: (shape) => frameBox(shape),
  getHitBounds: (shape) => {
    const regions = frameRegions(shape);
    return regions ? unionBounds([regions.box, ...(regions.header ? [regions.header] : [])]) : null;
  },
  getAnchors: () => [],
  onResize: resizeFrameShape,
  containsPoint: (shape, point, options) => containsPointInFrame(shape, point, options?.radius ?? 0),
  getResizeHandles: (shape, options) => getFrameResizeHandles(shape, options?.bounds),
  validate: (shape) => hasValidBox(shape),
  toolbarConfig: { icon: Frame, label: "Frame", shortcut: "O", group: "shapes", order: 6 },
  propertiesConfig: { supportsColor: true, supportsFill: true, supportsStrokeWidth: true, supportsFontSize: false },
});
