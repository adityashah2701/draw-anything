// Bundled for the browser by harness.ts: the real modules, exposed on window.T.
export { renderShapeLabel, measureShapeLabel } from "@/core/shapes/base/shape-label-renderer";
export { renderTextToCanvas } from "@/core/shapes/text/renderer";
export { getTextBounds } from "@/core/shapes/text/geometry";
export { resizeText } from "@/core/shapes/text/interaction";
export { layoutShapeLabel, defaultLabelWeight } from "@/core/text/label-layout";
export { getShapeLabelRegion } from "@/core/text/label-region";
export { estimateLabelBox, estimateTextWidth, createEstimateContext } from "@/core/text/estimate";
export { FONT_FAMILY, makeFontString } from "@/core/text/typography";
export {
  measureLabelEditTopOffset,
  shapeLabelEditorStyle,
} from "@/features/whiteboard/components/overlays/shape-label-editor-style";
export { textBlockEditorStyle } from "@/features/whiteboard/components/canvas/text-block-style";
export {
  markdownToEditableHtml,
  editableHtmlToMarkdown,
  normalizeRichTextInput,
} from "@/features/whiteboard/utils/rich-text-renderer";
export { renderSemanticNodeToCanvas } from "@/core/shapes/semantic-node/renderer";
export { drawElement } from "@/features/whiteboard/utils/canvas-render-utils";
export { getShapeBounds } from "@/core/shapes/shape-runtime";
export { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
export { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
export { measureLayout } from "@/features/ai/server/layout/metrics";
export { drawIconTile } from "@/core/icons/draw";
export { listIcons } from "@/core/icons/registry";
export { drawGuides } from "@/features/whiteboard/utils/draw-guides";
export { computeDrag } from "@/features/whiteboard/hooks/interaction/drag-session";
export { zoomAtPoint, wheelIntent } from "@/features/whiteboard/utils/viewport-math";
export { exportScene, EXPORT_PADDING, EXPORT_LIMITS } from "@/features/whiteboard/export/export-scene";
export { copyPngToClipboard, copySvgToClipboard, exportFilename } from "@/features/whiteboard/export/deliver";
export { ExportError } from "@/features/whiteboard/export/errors";
export { elementsForSelectionExport } from "@/features/whiteboard/export/selection-policy";
export { SvgContext } from "@/features/whiteboard/export/svg-context";
export { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
export * as baseline from "./baseline-fixtures";
export { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
export { shapeContainsPoint } from "@/core/shapes/shape-runtime";
