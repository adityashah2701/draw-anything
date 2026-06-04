import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { LiveObject } from "@liveblocks/client";
import {
  useCanRedo,
  useCanUndo,
  useHistory,
  useMutation as useLiveblocksM,
  useOthers,
  useStorage,
  useUpdateMyPresence,
} from "@/liveblocks.config";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DrawingElementJson } from "@/liveblocks.config";
import {
  ArrowRoutingMode,
  ArrowType,
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";
import { useMagneticSnap } from "@/core/snap/use-magnetic-snap";
import { useArrowConnections } from "@/core/arrow/use-arrow-connections";
import { useWhiteboardAccess } from "@/features/whiteboard/hooks/access/use-whiteboard-access";
import { useCanvasViewport } from "@/features/whiteboard/hooks/canvas/use-canvas-viewport";
import { useWhiteboardUtils } from "@/features/whiteboard/hooks/utils/use-whiteboard-utils";
import { useWhiteboardDrawing } from "@/features/whiteboard/hooks/interaction/use-whiteboard-drawing";
import { useWhiteboardKeyboard } from "@/features/whiteboard/hooks/interaction/use-whiteboard-keyboard";
import { useWhiteboardAutoSave } from "@/features/whiteboard/hooks/data/use-whiteboard-auto-save";
import { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";
import {
  ArrowElement,
  getArrowHeadVisibility,
  isArrowElement,
} from "@/core/shapes/arrow/arrow-utils";
import {
  insertBendPoint,
  removeBendPoint,
} from "@/core/routing/orthogonal-router";

export const useWhiteboardPageController = (whiteboardId: string) => {
  const whiteboard = useQuery(
    api.whiteboard.getById,
    whiteboardId ? { id: whiteboardId as Id<"whiteboards"> } : "skip",
  );
  const updateWhiteboard = useMutation(api.whiteboard.update);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seededRef = useRef(false);
  const viewportLoadedRef = useRef(false);

  const uiState = useWhiteboardUiState();
  const updateMyPresence = useUpdateMyPresence();
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const others = useOthers();
  const liveElements = useStorage((root) => root.elements);
  const elements = useMemo(
    () =>
      (liveElements || [])
        .filter(Boolean)
        .map((el: DrawingElementJson) => el as unknown as DrawingElement),
    [liveElements],
  );

  const addElement = useLiveblocksM(
    ({ storage }, element: DrawingElementJson) => {
      storage.get("elements").push(new LiveObject(element));
    },
    [],
  );

  const deleteElementsLive = useLiveblocksM(({ storage }, ids: string[]) => {
    const list = storage.get("elements");
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (ids.includes(list.get(i)!.get("id") as string)) {
        list.delete(i);
      }
    }
  }, []);

  const updateElement = useLiveblocksM(
    ({ storage }, updatedElement: DrawingElementJson) => {
      const list = storage.get("elements");
      for (let i = 0; i < list.length; i += 1) {
        if (list.get(i)!.get("id") === updatedElement.id) {
          list.get(i)!.update(updatedElement);
          break;
        }
      }
    },
    [],
  );

  const seedElements = useLiveblocksM(
    ({ storage }, initial: DrawingElementJson[]) => {
      const list = storage.get("elements");
      if (list.length === 0 && initial.length > 0) {
        initial.forEach((el) => list.push(new LiveObject(el)));
      }
    },
    [],
  );

  const handleUndo = useCallback(() => {
    history.undo();
  }, [history]);

  const handleRedo = useCallback(() => {
    history.redo();
  }, [history]);

  const handleClear = useLiveblocksM(({ storage }) => {
    const list = storage.get("elements");
    while (list.length > 0) list.delete(0);
  }, []);

  const [currentElement, setCurrentElement] =
    useState<DrawingElement | null>(null);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);

  const whiteboardAccess = useWhiteboardAccess(whiteboard);
  const canvasViewport = useCanvasViewport();
  const {
    generateId,
    getElementsAtPoint,
    getElementsInBounds,
    getResizeHandle,
    moveElements,
    resizeElement,
    getElementBounds,
    getElementsOnPath,
  } = useWhiteboardUtils(canvasViewport.zoom, elements);

  const handleFitToScreen = useCallback(() => {
    if (elements.length === 0) {
      canvasViewport.handleResetZoom();
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    elements.forEach((el) => {
      const bounds = getElementBounds(el);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      canvasViewport.handleResetZoom();
      return;
    }

    canvasViewport.fitToBounds({ minX, minY, maxX, maxY });
  }, [elements, getElementBounds, canvasViewport]);

  const magneticSnap = useMagneticSnap({
    elements,
    getElementBounds,
    snapRadius: 20,
  });

  const {
    bindArrowEndpoint,
    routeArrowByConnections,
    rerouteConnectedArrowsForChanges,
  } = useArrowConnections({
    elements,
    anchorIndex: magneticSnap.anchorIndex,
    getElementBounds,
  });

  const deleteElementsWithConnectedArrows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const selected = new Set(ids);
      const toDelete = new Set(ids);

      elements.forEach((el) => {
        if (!isArrowElement(el)) return;
        const startId = el.startConnection?.elementId;
        const endId = el.endConnection?.elementId;
        if (
          (startId && selected.has(startId)) ||
          (endId && selected.has(endId))
        ) {
          toDelete.add(el.id);
        }
      });

      deleteElementsLive(Array.from(toDelete));
    },
    [deleteElementsLive, elements],
  );

  const completeCurrentElement = useCallback(() => {
    if (currentElement) {
      addElement(currentElement as unknown as DrawingElementJson);
      setCurrentElement(null);
    }
  }, [addElement, currentElement]);

  const whiteboardDrawing = useWhiteboardDrawing({
    currentTool: uiState.currentTool,
    currentColor: uiState.currentColor,
    strokeWidth: uiState.strokeWidth,
    fillColor: uiState.fillColor,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    getMousePosition: canvasViewport.getMousePosition,
    generateId,
    getElementsAtPoint,
    getElementsInBounds,
    getResizeHandle,
    deleteElements: (ids) => deleteElementsWithConnectedArrows(ids),
    moveElements: (ids, dx, dy) => {
      const moved = moveElements(ids, dx, dy);
      const arrows = rerouteConnectedArrowsForChanges(moved);
      arrows.forEach((a) => updateElement(a as unknown as DrawingElementJson));
      return moved;
    },
    resizeElement: (id, handle, pt, bounds) => {
      const resized = resizeElement(id, handle, pt, bounds);
      if (resized) {
        const arrows = rerouteConnectedArrowsForChanges([resized]);
        arrows.forEach((a) =>
          updateElement(a as unknown as DrawingElementJson),
        );
      }
      return resized;
    },
    updateElement: (el) => updateElement(el as unknown as DrawingElementJson),
    getElementBounds,
    getElementsOnPath,
    eraserSize: uiState.eraserSize,
    currentElement,
    setCurrentElement,
    selectedElements,
    setSelectedElements,
    elements,
    completeCurrentElement,
    saveToHistory: () => {},
    findNearestAnchorSnap: magneticSnap.findNearestSnap,
    bindArrowEndpoint: (arrow, endpoint, point, snap) => {
      if (!isArrowElement(arrow)) return arrow;
      return bindArrowEndpoint(arrow, endpoint, point, snap);
    },
    routeConnectedArrow: (arrow) => {
      if (!isArrowElement(arrow)) return arrow;
      return routeArrowByConnections(arrow);
    },
    onArrowSnapPreviewChange: uiState.handleArrowSnapPreviewChange,
    addElementDirect: (el) => addElement(el as unknown as DrawingElementJson),
    startPanning: canvasViewport.startPanning,
    handlePan: canvasViewport.handlePan,
    stopPanning: canvasViewport.stopPanning,
  });

  const whiteboardAutoSave = useWhiteboardAutoSave({
    whiteboardId,
    elements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    isDrawing: whiteboardDrawing.isDrawing,
    currentElement,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    whiteboard,
  });

  useEffect(() => {
    seededRef.current = false;
    viewportLoadedRef.current = false;
  }, [whiteboardId]);

  useEffect(() => {
    if (whiteboard?.content && !seededRef.current && liveElements !== null) {
      seededRef.current = true;
      try {
        const parsed = JSON.parse(whiteboard.content);
        if (parsed?.elements?.length > 0) {
          seedElements(parsed.elements);
        }
      } catch {
        // ignore parse error
      }
    }
  }, [whiteboard, liveElements, seedElements]);

  useEffect(() => {
    if (!whiteboard?.content || viewportLoadedRef.current) return;

    try {
      const parsed = JSON.parse(whiteboard.content);
      if (parsed?.canvasSettings) {
        canvasViewport.loadViewportSettings(parsed.canvasSettings);
      }
      viewportLoadedRef.current = true;
    } catch {
      // ignore
    }
  }, [whiteboard?.content, canvasViewport, canvasViewport.loadViewportSettings]);

  useWhiteboardKeyboard({
    currentTool: uiState.currentTool,
    setCurrentTool: uiState.setCurrentTool,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    handleUndo,
    handleRedo,
    saveWhiteboard: whiteboardAutoSave.saveWhiteboard,
    selectAllElements: () => setSelectedElements(elements.map((el) => el.id)),
    deleteSelectedElements: useCallback(() => {
      if (selectedElements.length > 0) {
        deleteElementsWithConnectedArrows(selectedElements);
        setSelectedElements([]);
      }
    }, [deleteElementsWithConnectedArrows, selectedElements]),
    clearSelection: () => setSelectedElements([]),
    handleZoomIn: canvasViewport.handleZoomIn,
    handleZoomOut: canvasViewport.handleZoomOut,
    handleResetZoom: canvasViewport.handleResetZoom,
    handleFitToScreen,
    toggleGrid: canvasViewport.toggleGrid,
    setShowCommandMenu: uiState.setShowCommandMenu,
  });

  useEffect(() => {
    updateMyPresence({ selection: selectedElements });
  }, [selectedElements, updateMyPresence]);

  useEffect(() => {
    updateMyPresence({
      pencilDraft: currentElement as unknown as DrawingElementJson | null,
    });
  }, [currentElement, updateMyPresence]);

  useEffect(() => {
    if (selectedElements.length === 1) {
      const selected = elements.find((el) => el.id === selectedElements[0]);
      if (selected) {
        if (selected.color && selected.color !== uiState.currentColor)
          uiState.setCurrentColor(selected.color);
        if (selected.strokeWidth && selected.strokeWidth !== uiState.strokeWidth)
          uiState.setStrokeWidth(selected.strokeWidth);
        const fillValue = selected.fill || "#transparent";
        if (fillValue !== uiState.fillColor) uiState.setFillColor(fillValue);
        if (selected.fontSize && selected.fontSize !== uiState.fontSize)
          uiState.setFontSize(selected.fontSize);
      }
    }
  }, [
    selectedElements,
    elements,
    uiState.currentColor,
    uiState.strokeWidth,
    uiState.fillColor,
    uiState.fontSize,
    uiState.setCurrentColor,
    uiState.setStrokeWidth,
    uiState.setFillColor,
    uiState.setFontSize,
  ]);

  const selectedElement = useMemo(
    () =>
      selectedElements.length === 1
        ? elements.find((element) => element.id === selectedElements[0]) ?? null
        : null,
    [elements, selectedElements],
  );

  const selectedArrow = useMemo(() => {
    if (!selectedElement || !isArrowElement(selectedElement)) {
      return null;
    }
    const heads = getArrowHeadVisibility(selectedElement);
    return {
      type: selectedElement.type,
      routingMode: selectedElement.routingMode ?? "orthogonal",
      dashed: Boolean(selectedElement.dashed),
      arrowHeadStart: heads.start,
      arrowHeadEnd: heads.end,
    };
  }, [selectedElement]);

  const updateSelectedArrow = useCallback(
    (
      patch: Partial<
        Pick<
          ArrowElement,
          | "type"
          | "routingMode"
          | "dashed"
          | "arrowHeadStart"
          | "arrowHeadEnd"
          | "isManuallyRouted"
        >
      >,
    ) => {
      if (!whiteboardAccess.hasEditAccess) return;
      if (!selectedElement || !isArrowElement(selectedElement)) return;

      let next: ArrowElement = {
        ...selectedElement,
        ...patch,
      };

      if (patch.type === "arrow-bidirectional") {
        next.arrowHeadStart = patch.arrowHeadStart ?? true;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.type === "arrow") {
        next.arrowHeadStart = patch.arrowHeadStart ?? false;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.routingMode === "straight") {
        const endIndex = Math.max(1, next.points.length - 1);
        next.points = [next.points[0], next.points[endIndex]];
        next.isManuallyRouted = false;
      } else if (patch.routingMode === "orthogonal") {
        next = routeArrowByConnections(next);
      }

      updateElement(next as unknown as DrawingElementJson);
    },
    [
      routeArrowByConnections,
      selectedElement,
      updateElement,
      whiteboardAccess.hasEditAccess,
    ],
  );

  const otherUsersDrafts = others
    .map((o) => o.presence.pencilDraft as unknown as DrawingElement)
    .filter(Boolean);

  const otherUsersSelections = others.reduce(
    (acc: Record<string, string>, o) => {
      if (o.presence.selection) {
        o.presence.selection.forEach((id: string) => {
          acc[id] = o.info?.pictureUrl || "blue";
        });
      }
      return acc;
    },
    {},
  );

  const updateArrowBendsAtPoint = useCallback(
    (arrow: DrawingElement, point: { x: number; y: number }) => {
      if (!whiteboardAccess.hasEditAccess || !isArrowElement(arrow)) {
        return false;
      }

      const removeThreshold = 10 / canvasViewport.zoom;
      const insertThreshold = 12 / canvasViewport.zoom;

      for (let i = 1; i < arrow.points.length - 1; i += 1) {
        const bend = arrow.points[i];
        const distance = Math.hypot(point.x - bend.x, point.y - bend.y);
        if (distance <= removeThreshold) {
          const points = removeBendPoint(arrow.points, i);
          updateElement({
            ...arrow,
            points,
            routingMode: "orthogonal",
            isManuallyRouted: true,
          } as unknown as DrawingElementJson);
          return true;
        }
      }

      let closestSegment = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < arrow.points.length - 1; i += 1) {
        const from = arrow.points[i];
        const to = arrow.points[i + 1];
        const distance =
          from.x === to.x
            ? Math.abs(point.x - from.x) +
              (point.y < Math.min(from.y, to.y) ||
              point.y > Math.max(from.y, to.y)
                ? Math.min(
                    Math.abs(point.y - from.y),
                    Math.abs(point.y - to.y),
                  )
                : 0)
            : Math.abs(point.y - from.y) +
              (point.x < Math.min(from.x, to.x) ||
              point.x > Math.max(from.x, to.x)
                ? Math.min(
                    Math.abs(point.x - from.x),
                    Math.abs(point.x - to.x),
                  )
                : 0);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestSegment = i;
        }
      }

      if (closestSegment >= 0 && closestDistance <= insertThreshold) {
        const points = insertBendPoint(arrow.points, closestSegment);
        updateElement({
          ...arrow,
          points,
          routingMode: "orthogonal",
          isManuallyRouted: true,
        } as unknown as DrawingElementJson);
        return true;
      }

      return false;
    },
    [canvasViewport.zoom, updateElement, whiteboardAccess.hasEditAccess],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      uiState.setCurrentColor(color);
      uiState.setShowOutlineColorPicker(false);

      if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
        selectedElements.forEach((id) => {
          const el = elements.find((e) => e.id === id);
          if (el) {
            updateElement({ ...el, color } as unknown as DrawingElementJson);
          }
        });
      }
    },
    [
      elements,
      selectedElements,
      uiState,
      updateElement,
      whiteboardAccess.hasEditAccess,
    ],
  );

  const handleFillColorChange = useCallback(
    (color: string) => {
      uiState.setFillColor(color);
      uiState.setShowFillColorPicker(false);

      if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
        selectedElements.forEach((id) => {
          const el = elements.find((e) => e.id === id);
          if (el) {
            updateElement({
              ...el,
              fill: color,
            } as unknown as DrawingElementJson);
          }
        });
      }
    },
    [
      elements,
      selectedElements,
      uiState,
      updateElement,
      whiteboardAccess.hasEditAccess,
    ],
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      uiState.setStrokeWidth(width);
      if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
        selectedElements.forEach((id) => {
          const el = elements.find((e) => e.id === id);
          if (el) {
            updateElement({
              ...el,
              strokeWidth: width,
            } as unknown as DrawingElementJson);
          }
        });
      }
    },
    [elements, selectedElements, uiState, updateElement, whiteboardAccess.hasEditAccess],
  );

  const handleFontSizeChange = useCallback(
    (size: number) => {
      uiState.setFontSize(size);
      if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
        selectedElements.forEach((id) => {
          const el = elements.find((e) => e.id === id);
          if (el) {
            updateElement({
              ...el,
              fontSize: size,
            } as unknown as DrawingElementJson);
          }
        });
      }
    },
    [elements, selectedElements, uiState, updateElement, whiteboardAccess.hasEditAccess],
  );

  const handleArrowTypeChange = useCallback(
    (type: ArrowType) => updateSelectedArrow({ type }),
    [updateSelectedArrow],
  );

  const handleArrowRoutingModeChange = useCallback(
    (mode: ArrowRoutingMode) => updateSelectedArrow({ routingMode: mode }),
    [updateSelectedArrow],
  );

  const handleArrowDashedChange = useCallback(
    (value: boolean) => updateSelectedArrow({ dashed: value }),
    [updateSelectedArrow],
  );

  const handleArrowHeadStartChange = useCallback(
    (value: boolean) => updateSelectedArrow({ arrowHeadStart: value }),
    [updateSelectedArrow],
  );

  const handleArrowHeadEndChange = useCallback(
    (value: boolean) => updateSelectedArrow({ arrowHeadEnd: value }),
    [updateSelectedArrow],
  );

  const handleClearSelection = useCallback(() => setSelectedElements([]), []);
  const handleSelectAllElements = useCallback(
    () => setSelectedElements(elements.map((el) => el.id)),
    [elements],
  );
  const deleteSelectedElements = useCallback(() => {
    if (selectedElements.length > 0) {
      deleteElementsWithConnectedArrows(selectedElements);
      setSelectedElements([]);
    }
  }, [deleteElementsWithConnectedArrows, selectedElements]);

  const handleCommandAction = useCallback(
    (action: string) => {
      if (
        !whiteboardAccess.hasEditAccess &&
        ["clear", "save"].includes(action)
      ) {
        toast.error("You don't have permission to perform this action");
        return;
      }

      switch (action) {
        case "undo":
          handleUndo();
          break;
        case "redo":
          handleRedo();
          break;
        case "zoom-in":
          canvasViewport.handleZoomIn();
          break;
        case "zoom-out":
          canvasViewport.handleZoomOut();
          break;
        case "zoom-reset":
          canvasViewport.handleResetZoom();
          break;
        case "fit-screen":
          handleFitToScreen();
          break;
        case "toggle-grid":
          canvasViewport.toggleGrid();
          break;
        case "clear":
          if (confirm("Are you sure you want to clear the entire canvas?")) {
            handleClear();
            toast.success("Canvas cleared");
          }
          break;
        case "save":
          toast.success("Autosave is active. Changes are synced!");
          break;
        case "shortcuts":
          uiState.setShowShortcuts(true);
          break;
        case "export":
          if (canvasRef.current) {
            const dataUrl = canvasRef.current.toDataURL("image/png");
            const link = document.createElement("a");
            link.download = `whiteboard-${whiteboardId}.png`;
            link.href = dataUrl;
            link.click();
            toast.success("Exported as PNG");
          }
          break;
      }
    },
    [
      canvasViewport,
      handleClear,
      handleFitToScreen,
      handleRedo,
      handleUndo,
      whiteboardAccess.hasEditAccess,
      whiteboardId,
      uiState,
    ],
  );

  const loadWhiteboard = useCallback(() => {
    console.log("=== LOAD WHITEBOARD ===");
    console.log("This whiteboard is automatically loaded from the database.");
    console.log("Current whiteboard ID:", whiteboardId);
    console.log("=== END LOAD INFO ===");
    toast.success("This whiteboard is automatically loaded from the database!");
  }, [whiteboardId]);

  const handleRenameWhiteboard = useCallback(
    (title: string) => {
      if (whiteboard?._id) {
        updateWhiteboard({ id: whiteboard._id, title });
        toast.success("Whiteboard renamed");
      }
    },
    [updateWhiteboard, whiteboard?._id],
  );

  const handleGenerateDiagram = useCallback(() => {
    uiState.setShowAIModal(true);
  }, [uiState]);

  const handleGenerateAIDiagram = useCallback(
    (newElements: DrawingElement[]) => {
      const viewWorldMinX = -canvasViewport.panOffset.x / canvasViewport.zoom;
      const viewWorldMinY = -canvasViewport.panOffset.y / canvasViewport.zoom;

      const allX = newElements.flatMap((el) => el.points.map((p) => p.x));
      const allY = newElements.flatMap((el) => el.points.map((p) => p.y));
      const minX = Math.min(...allX);
      const minY = Math.min(...allY);
      const maxX = Math.max(...allX);
      const maxY = Math.max(...allY);

      const shiftX = viewWorldMinX + 80 - minX;
      const shiftY = viewWorldMinY + 80 - minY;

      newElements.forEach((el) => {
        const shifted = {
          ...el,
          points: el.points.map((p) => ({
            x: p.x + shiftX,
            y: p.y + shiftY,
          })),
        };
        addElement(shifted as unknown as DrawingElementJson);
      });
      toast.success(`✨ AI added ${newElements.length} elements to the canvas!`);

      const shiftedBounds = {
        minX: minX + shiftX,
        minY: minY + shiftY,
        maxX: maxX + shiftX,
        maxY: maxY + shiftY,
      };
      setTimeout(() => {
        canvasViewport.fitToBounds(shiftedBounds);
      }, 0);
    },
    [addElement, canvasViewport],
  );

  const handleEditingTextChange = useCallback(
    (text: string, format: { fontSize: number; fontWeight: string | number; fontStyle: string }) => {
      uiState.setEditingTextElement((prev) =>
        prev
          ? {
              ...prev,
              text,
              fontSize: format.fontSize,
              fontWeight: format.fontWeight,
              fontStyle: format.fontStyle,
            }
          : prev,
      );
    },
    [uiState],
  );

  const handleEditingTextCommit = useCallback(
    (
      text: string,
      format: {
        fontSize: number;
        fontWeight: string | number;
        fontStyle: string;
      },
    ) => {
      const editingTextElement = uiState.editingTextElement;
      if (!editingTextElement) return;

      if (uiState.isNewTextElement) {
        if (text.trim()) {
          addElement({
            ...editingTextElement,
            text: text.trim(),
            fontSize: format.fontSize,
            fontWeight: format.fontWeight,
            fontStyle: format.fontStyle,
          } as unknown as DrawingElementJson);
        }
      } else {
        const base =
          elements.find((e) => e.id === editingTextElement.id) ||
          editingTextElement;
        if (text.trim()) {
          updateElement({
            ...base,
            text: text.trim(),
            fontSize: format.fontSize,
            fontWeight: format.fontWeight,
            fontStyle: format.fontStyle,
          } as unknown as DrawingElementJson);
        } else {
          deleteElementsLive([editingTextElement.id]);
        }
      }

      uiState.setEditingTextElement(null);
      uiState.setIsNewTextElement(false);
    },
    [
      addElement,
      deleteElementsLive,
      elements,
      uiState,
      updateElement,
    ],
  );

  const handleEditingTextMove = useCallback(
    (newPoint: { x: number; y: number }) => {
      const editingTextElement = uiState.editingTextElement;
      if (!editingTextElement) return;
      const updated: DrawingElement = {
        ...editingTextElement,
        points: [newPoint, ...editingTextElement.points.slice(1)],
      };
      if (!uiState.isNewTextElement) {
        updateElement(updated as unknown as DrawingElementJson);
      }
      uiState.setEditingTextElement(updated);
    },
    [uiState, updateElement],
  );

  const handleFitToViewport = handleFitToScreen;

  return {
    whiteboardId,
    whiteboard,
    canvasRef,
    elements,
    currentElement,
    setCurrentElement,
    selectedElements,
    setSelectedElements,
    selectedElement,
    selectedArrow,
    whiteboardAccess,
    canvasViewport,
    magneticSnap,
    whiteboardDrawing,
    whiteboardAutoSave,
    updateMyPresence,
    otherUsersDrafts,
    otherUsersSelections,
    canUndo,
    canRedo,
    history,
    handleUndo,
    handleRedo,
    handleClear,
    handleFitToScreen,
    handleFitToViewport,
    loadWhiteboard,
    handleRenameWhiteboard,
    handleGenerateDiagram,
    handleCommandAction,
    deleteSelectedElements,
    handleSelectAllElements,
    handleClearSelection,
    handleColorChange,
    handleFillColorChange,
    handleStrokeWidthChange,
    handleFontSizeChange,
    handleArrowTypeChange,
    handleArrowRoutingModeChange,
    handleArrowDashedChange,
    handleArrowHeadStartChange,
    handleArrowHeadEndChange,
    updateSelectedArrow,
    updateArrowBendsAtPoint,
    handleGenerateAIDiagram,
    handleEditingTextChange,
    handleEditingTextCommit,
    handleEditingTextMove,
    handleToggleOutlineColorPicker: uiState.toggleOutlineColorPicker,
    handleToggleFillColorPicker: uiState.toggleFillColorPicker,
    generateId,
    getElementsAtPoint,
    getElementBounds,
    addElement,
    updateElement,
    deleteElementsLive,
    seededRef,
    viewportLoadedRef,
    ...uiState,
  };
};

export type WhiteboardPageController = ReturnType<
  typeof useWhiteboardPageController
>;
