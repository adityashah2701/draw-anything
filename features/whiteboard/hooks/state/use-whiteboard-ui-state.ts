import { useCallback, useEffect, useRef, useState } from "react";
import { Anchor, DrawingElement, Point, Tool } from "@/features/whiteboard/types/whiteboard.types";
import {
  DEFAULT_SNAP_SETTINGS,
  loadSnapSettings,
  normalizeSnapSettings,
  saveSnapSettings,
  type SnapSettings,
} from "@/features/whiteboard/utils/snap-settings";

export interface ArrowSnapPreviewState {
  endpoint: "start" | "end";
  pointer: Point;
  anchor: Anchor;
}

export const useWhiteboardUiState = () => {
  const [currentTool, setCurrentTool] = useState<Tool>("select");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#transparent");
  const [fontSize, setFontSize] = useState(20);
  const eraserSize = 20;

  // How dragging snaps. A per-viewer preference, read after mount so the first render matches the server.
  const [snapSettings, setSnapSettingsState] = useState<SnapSettings>(DEFAULT_SNAP_SETTINGS);
  useEffect(() => setSnapSettingsState(loadSnapSettings()), []);
  const setSnapSettings = useCallback((next: Partial<SnapSettings>) => {
    setSnapSettingsState((current) => {
      const merged = normalizeSnapSettings({ ...current, ...next });
      saveSnapSettings(merged);
      return merged;
    });
  }, []);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showIconPicker, setShowIconPickerOpen] = useState(false);
  // "insert" adds an icon to the board; "replace" changes the icon of the selected semantic nodes.
  const [iconPickerMode, setIconPickerMode] = useState<"insert" | "replace">("insert");
  const setShowIconPicker = useCallback((open: boolean) => {
    setShowIconPickerOpen(open);
    if (!open) setIconPickerMode("insert");
  }, []);
  const openReplaceIconPicker = useCallback(() => {
    setIconPickerMode("replace");
    setShowIconPickerOpen(true);
  }, []);
  // Where the comment tool was clicked; the comment layer opens a composer there.
  const [commentDraft, setCommentDraft] = useState<Point | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  // The diagram code editor is a panel of its own, so it can be open with or without the agent.
  const [showCodePanel, setShowCodePanel] = useState(false);
  // Counts requests to (re)load the editor from the canvas, e.g. "Open as code" after a generation.
  const [codeLoadToken, setCodeLoadToken] = useState(0);
  const [hideCanvasUi, setHideCanvasUi] = useState(false);

  const [arrowSnapPreview, setArrowSnapPreview] =
    useState<ArrowSnapPreviewState | null>(null);
  const arrowSnapPreviewRef = useRef<ArrowSnapPreviewState | null>(null);

  const [editingTextElement, setEditingTextElement] =
    useState<DrawingElement | null>(null);
  const [isNewTextElement, setIsNewTextElement] = useState(false);
  const [editingShapeLabelId, setEditingShapeLabelId] = useState<string | null>(
    null,
  );
  const [editingShapeLabelDraft, setEditingShapeLabelDraft] = useState("");
  const [editingShapeLabelFontSize, setEditingShapeLabelFontSize] =
    useState(20);
  const [editingShapeLabelFontWeight, setEditingShapeLabelFontWeight] =
    useState<string | number>("600");
  const [editingShapeLabelFontStyle, setEditingShapeLabelFontStyle] =
    useState("normal");
  const shapeLabelEditorRef = useRef<HTMLDivElement | null>(null);

  const currentColorRef = useRef(currentColor);
  const strokeWidthRef = useRef(strokeWidth);
  const fontSizeRef = useRef(fontSize);

  useEffect(() => {
    currentColorRef.current = currentColor;
  }, [currentColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  const handleArrowSnapPreviewChange = useCallback(
    (
      preview: {
        endpoint: "start" | "end";
        pointer: Point;
        match: { anchor: Anchor };
      } | null,
    ) => {
      const next = preview
        ? {
            endpoint: preview.endpoint,
            pointer: preview.pointer,
            anchor: preview.match.anchor,
          }
        : null;
      const current = arrowSnapPreviewRef.current;
      const isSame =
        !!current &&
        !!next &&
        current.endpoint === next.endpoint &&
        current.anchor.id === next.anchor.id &&
        Math.abs(current.pointer.x - next.pointer.x) < 1 &&
        Math.abs(current.pointer.y - next.pointer.y) < 1;

      if (isSame) {
        return;
      }

      if (!current && !next) return;
      arrowSnapPreviewRef.current = next;
      setArrowSnapPreview(next);
    },
    [],
  );

  return {
    currentTool,
    setCurrentTool,
    currentColor,
    setCurrentColor,
    strokeWidth,
    setStrokeWidth,
    fillColor,
    setFillColor,
    fontSize,
    setFontSize,
    eraserSize,
    snapSettings,
    setSnapSettings,
    showShortcuts,
    setShowShortcuts,
    showCommandMenu,
    setShowCommandMenu,
    showExport,
    setShowExport,
    showIconPicker,
    setShowIconPicker,
    iconPickerMode,
    openReplaceIconPicker,
    commentDraft,
    setCommentDraft,
    showAIModal,
    setShowAIModal,
    showCodePanel,
    setShowCodePanel,
    codeLoadToken,
    /** Open the code editor; `fromCanvas` also fills it with the diagram on the canvas. */
    openCodePanel: (fromCanvas = false) => {
      setShowCodePanel(true);
      if (fromCanvas) setCodeLoadToken((token) => token + 1);
    },
    hideCanvasUi,
    setHideCanvasUi,
    arrowSnapPreview,
    arrowSnapPreviewRef,
    handleArrowSnapPreviewChange,
    editingTextElement,
    setEditingTextElement,
    isNewTextElement,
    setIsNewTextElement,
    editingShapeLabelId,
    setEditingShapeLabelId,
    editingShapeLabelDraft,
    setEditingShapeLabelDraft,
    editingShapeLabelFontSize,
    setEditingShapeLabelFontSize,
    editingShapeLabelFontWeight,
    setEditingShapeLabelFontWeight,
    editingShapeLabelFontStyle,
    setEditingShapeLabelFontStyle,
    shapeLabelEditorRef,
    currentColorRef,
    strokeWidthRef,
    fontSizeRef,
  };
};
