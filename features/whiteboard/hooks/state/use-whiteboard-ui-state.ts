import { useCallback, useEffect, useRef, useState } from "react";
import { Anchor, DrawingElement, Point, Tool } from "@/features/whiteboard/types/whiteboard.types";

export interface ArrowSnapPreviewState {
  endpoint: "start" | "end";
  pointer: Point;
  anchor: Anchor;
}

export const useWhiteboardUiState = () => {
  const [currentTool, setCurrentTool] = useState<Tool>("pen");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#transparent");
  const [fontSize, setFontSize] = useState(20);
  const eraserSize = 20;

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showOutlineColorPicker, setShowOutlineColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
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

  const toggleOutlineColorPicker = useCallback(() => {
    setShowFillColorPicker(false);
    setShowOutlineColorPicker((prev) => !prev);
  }, []);

  const toggleFillColorPicker = useCallback(() => {
    setShowOutlineColorPicker(false);
    setShowFillColorPicker((prev) => !prev);
  }, []);

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
    showShortcuts,
    setShowShortcuts,
    showCommandMenu,
    setShowCommandMenu,
    showOutlineColorPicker,
    setShowOutlineColorPicker,
    showFillColorPicker,
    setShowFillColorPicker,
    showAIModal,
    setShowAIModal,
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
    toggleOutlineColorPicker,
    toggleFillColorPicker,
  };
};
