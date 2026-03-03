import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import { movable } from "@/core/shapes/capabilities/movable";
import { BidirectionalArrowShape } from "@/core/shapes/bidirectional-arrow/types";
import { getBidirectionalArrowBounds } from "@/core/shapes/bidirectional-arrow/geometry";
import { getBidirectionalArrowAnchors } from "@/core/shapes/bidirectional-arrow/anchors";
import { renderBidirectionalArrowToCanvas } from "@/core/shapes/bidirectional-arrow/renderer";
import { resizeBidirectionalArrow } from "@/core/shapes/bidirectional-arrow/interaction";
import {
  containsPointInArrow,
  getArrowResizeHandles,
} from "@/core/shapes/arrow/interaction";

export const bidirectionalArrowDefinition =
  createShapeDefinition<BidirectionalArrowShape>({
    type: "arrow-bidirectional",
    capabilities: [movable<BidirectionalArrowShape>()],
    create: (props) => ({
      id: props.id ?? "",
      type: "arrow-bidirectional",
      points: props.points ?? [{ x: 0, y: 0 }, { x: 120, y: 0 }],
      color: props.color ?? "#475569",
      strokeWidth: props.strokeWidth ?? 2,
      dashed: props.dashed,
      arrowHeadStart: props.arrowHeadStart ?? true,
      arrowHeadEnd: props.arrowHeadEnd ?? true,
      routingMode: props.routingMode ?? "orthogonal",
      routePreference: props.routePreference,
      isManuallyRouted: props.isManuallyRouted ?? false,
      startConnection: props.startConnection,
      endConnection: props.endConnection,
    }),
    render: () => null,
    renderToCanvas: renderBidirectionalArrowToCanvas,
    getBounds: (shape) => getBidirectionalArrowBounds(shape),
    getAnchors: (shape) => getBidirectionalArrowAnchors(shape),
    onResize: resizeBidirectionalArrow,
    containsPoint: (shape, point, options) =>
      containsPointInArrow(shape, point, options?.radius ?? 0),
    getResizeHandles: (shape) => getArrowResizeHandles(shape),
    validate: (shape) => shape.points.length >= 2,
  });
