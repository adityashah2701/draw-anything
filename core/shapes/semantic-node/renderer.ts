import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { screenCornerRadius } from "@/core/shapes/base/geometry-tokens";
import { drawIconTile } from "@/core/icons/draw";
import { iconForNode } from "@/core/icons/registry";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { getSemanticNodeBounds } from "@/core/shapes/semantic-node/geometry";
import { resolveIconTint } from "@/core/shapes/semantic-node/icon-tone";
import { layoutSemanticNode } from "@/core/shapes/semantic-node/layout";
import { normalizeNodeStyle } from "@/core/shapes/semantic-node/style";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";
import { isDarkRender } from "@/core/theme/render-theme";
import { readableOnDark } from "@/core/color/adaptive-color";

/** A `#rrggbb` fill: the only kind whose brightness we can judge, so the only one that counts as a surface. */
const hasReadableFill = (fill: string | undefined) => !!fill && /^#[0-9a-f]{6}$/i.test(fill);

/**
 * Draws the node from `layoutSemanticNode`: the box, then the icon tile and the label exactly where the
 * layout put them. Nothing here decides a position, so the inline editor and the AI sizing (which read
 * the same layout) always agree with what is on screen.
 */
export const renderSemanticNodeToCanvas = (
  shape: SemanticNodeShape,
  context: ShapeRenderCanvasContext,
) => {
  const bounds = getSemanticNodeBounds(shape);
  if (!bounds) return;
  const { ctx, zoom, panOffset } = context;
  const layout = layoutSemanticNode(bounds, shape.nodeStyle);
  const left = bounds.minX * zoom + panOffset.x;
  const top = bounds.minY * zoom + panOffset.y;
  const width = bounds.width * zoom;
  const height = bounds.height * zoom;

  const dark = isDarkRender();
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, screenCornerRadius(layout.radius, zoom, width, height));
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  // A node with no fill is just a border on the dark canvas: lighten a border that would not read there.
  if (dark && !hasReadableFill(shape.fill)) ctx.strokeStyle = readableOnDark(String(ctx.strokeStyle));
  ctx.stroke();

  if (layout.icon) {
    const icon = iconForNode(shape.ai);
    const tint = resolveIconTint({ icon, override: normalizeNodeStyle(shape.nodeStyle).iconColor, fill: shape.fill, dark });
    drawIconTile(
      ctx,
      icon,
      layout.icon.cx * zoom + panOffset.x,
      layout.icon.cy * zoom + panOffset.y,
      layout.icon.size * zoom,
      tint,
    );
  }

  if (shape.label) {
    const { region } = layout;
    const regionWidth = region.width * zoom;
    const regionHeight = region.height * zoom;
    const centerX = region.centerX * zoom + panOffset.x;
    const centerY = region.centerY * zoom + panOffset.y;
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX,
      centerY,
      maxWidth: regionWidth,
      maxHeight: regionHeight,
      zoom,
      align: region.align,
      // The region, never past the node: a label that cannot be made to fit is cut, not drawn over the border.
      clipPath: (canvasContext) => {
        const x = Math.max(left, centerX - regionWidth / 2);
        const y = Math.max(top, centerY - regionHeight / 2);
        const right = Math.min(left + width, centerX + regionWidth / 2);
        const bottom = Math.min(top + height, centerY + regionHeight / 2);
        canvasContext.beginPath();
        canvasContext.rect(x, y, Math.max(0, right - x), Math.max(0, bottom - y));
        canvasContext.closePath();
      },
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
      maxLines: region.maxLines,
    });
  }
};
