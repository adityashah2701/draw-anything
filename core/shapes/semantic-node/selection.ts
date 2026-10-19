import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { SELECTION_ACCENT } from "@/core/shapes/base/selection-style";
import { getSemanticNodeBounds } from "@/core/shapes/semantic-node/geometry";
import { layoutSemanticNode } from "@/core/shapes/semantic-node/layout";
import { getSemanticNodeResizeHandles } from "@/core/shapes/semantic-node/interaction";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";

/*
 * Selection chrome for a semantic node, in screen pixels. The generic chrome (a dashed box 5px out and
 * eight large white dots sitting on the border) competes with a node's content; this one stays out of
 * the way:
 *   - a thin solid outline hugging the border from outside, so the node's own border stays visible;
 *   - square corner handles, white with an accent edge, centred on the border, which is where they are
 *     hit-tested (so a visible handle is exactly a working one);
 *   - the edges are grab zones along their length (see getSemanticNodeResizeHandles), so no handle sits
 *     on an edge's midpoint where the connector dot is.
 */

const OUTLINE_WIDTH = 1.5;
const CORNER_SIZE = 8;

export const renderSemanticNodeSelection = (shape: SemanticNodeShape, context: ShapeRenderCanvasContext) => {
  const bounds = getSemanticNodeBounds(shape);
  if (!bounds) return;
  const { ctx, zoom, panOffset } = context;
  const layout = layoutSemanticNode(bounds, shape.nodeStyle);
  const rotation = typeof shape.rotation === "number" && Number.isFinite(shape.rotation) ? shape.rotation : 0;

  // Drawn in the node's own frame, turned about its centre like the node itself.
  const centerX = ((bounds.minX + bounds.maxX) / 2) * zoom + panOffset.x;
  const centerY = ((bounds.minY + bounds.maxY) / 2) * zoom + panOffset.y;
  const width = bounds.width * zoom;
  const height = bounds.height * zoom;

  ctx.save();
  ctx.translate(centerX, centerY);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.setLineDash([]);
  ctx.lineJoin = "round";

  // Sits just outside the stroke, so the border and the outline never merge into one thick line.
  const outset = (shape.strokeWidth || 2) / 2 + OUTLINE_WIDTH / 2 + 1;
  ctx.beginPath();
  ctx.roundRect(
    -width / 2 - outset,
    -height / 2 - outset,
    width + outset * 2,
    height + outset * 2,
    Math.min(layout.radius * zoom, width / 2, height / 2) + outset,
  );
  ctx.strokeStyle = SELECTION_ACCENT;
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = SELECTION_ACCENT;
  ctx.lineWidth = 1.25;
  for (const handle of getSemanticNodeResizeHandles(shape, bounds)) {
    if (handle.visible === false) continue;
    const hx = (handle.x - (bounds.minX + bounds.maxX) / 2) * zoom;
    const hy = (handle.y - (bounds.minY + bounds.maxY) / 2) * zoom;
    ctx.beginPath();
    ctx.roundRect(hx - CORNER_SIZE / 2, hy - CORNER_SIZE / 2, CORNER_SIZE, CORNER_SIZE, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};
