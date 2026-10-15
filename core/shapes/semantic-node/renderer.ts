import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { getShapeLabelRegion, semanticIconSize, SEMANTIC_ICON_LEFT } from "@/core/text/label-region";
import { makeFontString } from "@/core/text/typography";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";

const ICON_LABELS: Record<string, string> = {
  database: "DB",
  cache: "CA",
  queue: "Q",
  dns: "DNS",
  firewall: "FW",
  waf: "WAF",
  "message-broker": "MQ",
  "event-bus": "EV",
  gateway: "GW",
  api: "API",
  "load-balancer": "LB",
  kubernetes: "K8S",
  pod: "POD",
  cluster: "CLU",
  container: "CTR",
  worker: "WK",
  "service-mesh": "SM",
  deployment: "DEP",
  namespace: "NS",
  region: "REG",
  "availability-zone": "AZ",
  authentication: "ID",
  user: "U",
  browser: "WEB",
  mobile: "APP",
  agent: "AG",
  tool: "TL",
  memory: "MEM",
  "vector-store": "VS",
  "ai-model": "AI",
  dashboard: "DASH",
  alerting: "AL",
  config: "CFG",
  cicd: "CI",
  decision: "?",
};

export const renderSemanticNodeToCanvas = (
  shape: SemanticNodeShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  const endX = shape.points[1].x * zoom + panOffset.x;
  const endY = shape.points[1].y * zoom + panOffset.y;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const radius = Math.min(8 * zoom, width / 2, height / 2);
  const kind = shape.ai?.semanticKind ?? "generic";
  const icon = ICON_LABELS[kind] ?? kind.slice(0, 2).toUpperCase();

  ctx.beginPath();
  ctx.roundRect(left, top, width, height, radius);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

  const iconSize = semanticIconSize(height / zoom) * zoom;
  const iconX = left + SEMANTIC_ICON_LEFT * zoom + iconSize / 2;
  const iconY = top + height / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    iconX - iconSize / 2,
    iconY - iconSize / 2,
    iconSize,
    iconSize,
    Math.min(6 * zoom, iconSize / 2),
  );
  ctx.fillStyle = "rgba(15, 23, 42, 0.08)";
  ctx.fill();
  ctx.fillStyle = shape.color;
  ctx.font = makeFontString(Math.max(8, 9 * zoom), 600, "normal");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, iconX, iconY);
  ctx.restore();

  if (shape.label) {
    const worldMinX = Math.min(shape.points[0].x, shape.points[1].x);
    const worldMinY = Math.min(shape.points[0].y, shape.points[1].y);
    const worldWidth = width / zoom;
    const worldHeight = height / zoom;
    const region = getShapeLabelRegion("semantic-node", {
      minX: worldMinX,
      minY: worldMinY,
      maxX: worldMinX + worldWidth,
      maxY: worldMinY + worldHeight,
      width: worldWidth,
      height: worldHeight,
    });
    const regionWidth = region.width * zoom;
    const centerX = region.centerX * zoom + panOffset.x;
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX,
      centerY: region.centerY * zoom + panOffset.y,
      maxWidth: regionWidth,
      maxHeight: region.height * zoom,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.rect(centerX - regionWidth / 2, top, regionWidth, height);
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
