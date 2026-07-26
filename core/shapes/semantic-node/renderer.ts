import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
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

  const iconSize = Math.min(28 * zoom, height * 0.42);
  const iconX = left + 14 * zoom + iconSize / 2;
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
  ctx.font = `600 ${Math.max(8, 9 * zoom)}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, iconX, iconY);
  ctx.restore();

  if (shape.label) {
    const labelLeft = left + iconSize + 26 * zoom;
    const labelWidth = Math.max(32, width - iconSize - 38 * zoom);
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: labelLeft + labelWidth / 2,
      centerY: top + height / 2,
      maxWidth: labelWidth,
      maxHeight: height * 0.72,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.rect(labelLeft, top, labelWidth, height);
        canvasContext.closePath();
      },
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
      maxLines: 2,
    });
  }
};
