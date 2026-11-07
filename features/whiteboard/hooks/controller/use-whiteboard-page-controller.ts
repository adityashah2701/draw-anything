import { applyPatch as applyStoredPatch } from "@/core/groups/patch";
import { pushElement, writeElement } from "./storage-writes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IconDef } from "@/core/icons/registry";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { LiveList, LiveObject } from "@liveblocks/client";
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
  DrawingElement,
  Point,
  StoredElement,
} from "@/features/whiteboard/types/whiteboard.types";
import { buildGroupIndex, expandUnits, isEffectivelyLocked, splitStored } from "@/core/groups/group-index";
import { groupsEmptiedBy } from "@/core/groups/group-commands";
import type { DocPatch } from "@/core/groups/patch";
import { movesToOrder } from "@/core/groups/order";
import { visibleShapes } from "@/core/groups/visibility";
import { createBaselineResolver } from "@/features/whiteboard/utils/text-baseline";
import { planFrameScale, planShapeMoves, uniformOffsets, withInternalConnectors } from "@/features/whiteboard/utils/move-plan";
import { buildSelectionOverlay } from "@/features/whiteboard/utils/selection-overlay";
import { useSelectionInspector } from "./use-selection-inspector";
import { isStructured, planStructured, readStructured } from "@/features/whiteboard/utils/structured-edit";
import { useGroupCommands } from "@/features/whiteboard/hooks/interaction/use-group-commands";
import { effectiveContext, resolveGroupClick, resolveMarquee } from "@/features/whiteboard/hooks/interaction/group-selection";
import { useMagneticSnap } from "@/features/whiteboard/hooks/interaction/use-magnetic-snap";
import { useArrowConnections } from "@/features/whiteboard/hooks/interaction/use-arrow-connections";
import { useBoardExport } from "@/features/whiteboard/hooks/export/use-board-export";
import { useWhiteboardAccess } from "@/features/whiteboard/hooks/access/use-whiteboard-access";
import { useCanvasViewport } from "@/features/whiteboard/hooks/canvas/use-canvas-viewport";
import { useWhiteboardUtils } from "@/features/whiteboard/hooks/utils/use-whiteboard-utils";
import { useWhiteboardDrawing } from "@/features/whiteboard/hooks/interaction/use-whiteboard-drawing";
import { useFrameCommands } from "@/features/whiteboard/hooks/interaction/use-frame-commands";
import { useOrganizeCommands } from "@/features/whiteboard/hooks/interaction/use-organize-commands";
import { useElementCommands } from "@/features/whiteboard/hooks/interaction/use-element-commands";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { rerouteWithLabels } from "@/features/whiteboard/commands/connectors";
import { planRemove } from "@/features/whiteboard/commands/remove";
import { useWhiteboardAutoSave } from "@/features/whiteboard/hooks/data/use-whiteboard-auto-save";
import { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { useEditingText } from "./use-editing-text";
import { coveredByPanels } from "@/features/whiteboard/components/overlays/panel-layout";
import { useSelectedArrow } from "./use-selected-arrow";
import { useSelectionStyle } from "./use-selection-style";
import { useConnectorStyle } from "./use-connector-style";
import { readPropertiesBar } from "@/features/whiteboard/utils/properties-bar-model";
import { useSemanticNodeCommands } from "@/features/whiteboard/hooks/interaction/use-semantic-node-commands";
import { createGestureHistory } from "@/features/whiteboard/hooks/interaction/gesture-history";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import { useFrameOperations } from "./use-frame-operations";
import { useElementInsertion } from "./use-element-insertion";
import { useDiagramCodeSync } from "./use-diagram-code-sync";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

/** Moves list items into `orderedIds`; does nothing unless that is exactly a permutation of the list (a stale view must not scramble it). */
const restackList = (list: LiveList<LiveObject<DrawingElementJson>>, orderedIds: readonly string[]) => {
  const current: string[] = [];
  for (let i = 0; i < list.length; i += 1) current.push(list.get(i)!.get("id") as string);
  for (const move of movesToOrder(current, orderedIds) ?? []) list.move(move.from, move.to);
};

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
  // The stored list holds drawable shapes and composite-group records. Everything that draws, routes,
  // exports or hit-tests keeps receiving shapes only (`elements`); the records only describe nesting.
  const stored = useMemo(() => (liveElements || []).filter(Boolean) as unknown as StoredElement[], [liveElements]);
  const allShapes = useMemo(() => splitStored(stored).shapes, [stored]);
  const groupIndex = useMemo(() => buildGroupIndex(stored), [stored]);
  // What is drawn, hit-tested, snapped to, routed around and exported: hidden shapes (and connectors with a
  // hidden end) stay in the document and in `allShapes`, which the commands and the AI tools see.
  const elements = useMemo(() => visibleShapes(allShapes, groupIndex), [allShapes, groupIndex]);

  const addElement = useLiveblocksM(
    ({ storage }, element: DrawingElementJson) => {
      pushElement(storage.get("elements"), element);
    },
    [],
  );

  // Every removal path (delete key, eraser, AI edits) goes through here, so a group that loses its
  // last shape is removed in the same step instead of lingering as an invisible record.
  const deleteElementsLive = useLiveblocksM(({ storage }, ids: string[]) => {
    const list = storage.get("elements");
    const removed = new Set(ids);
    for (const id of groupsEmptiedBy(list.toImmutable() as unknown as StoredElement[], removed)) removed.add(id);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (removed.has(list.get(i)!.get("id") as string)) {
        list.delete(i);
      }
    }
  }, []);

  const updateElement = useLiveblocksM(
    ({ storage }, updatedElement: DrawingElementJson) => {
      const list = storage.get("elements");
      for (let i = 0; i < list.length; i += 1) {
        if (list.get(i)!.get("id") === updatedElement.id) {
          writeElement(list.get(i)!, updatedElement);
          break;
        }
      }
    },
    [],
  );

  // Batched writes: one storage mutation (hence one undo step) and one list scan for any number of
  // elements, instead of one mutation and one scan per element. (Adds go through `applyDocPatch`.)
  const updateElements = useLiveblocksM(({ storage }, batch: DrawingElementJson[]) => {
    const list = storage.get("elements");
    const indexById = new Map<string, number>();
    for (let i = 0; i < list.length; i += 1) indexById.set(list.get(i)!.get("id") as string, i);
    for (const element of batch) {
      const index = indexById.get(element.id);
      if (index !== undefined) writeElement(list.get(index)!, element);
    }
  }, []);

  /** A command's whole change (adds, merges, removals) as ONE mutation, hence one undo step. */
  const applyDocPatch = useLiveblocksM(({ storage }, patch: DocPatch) => {
    const list = storage.get("elements");
    const indexById = new Map<string, number>();
    for (let i = 0; i < list.length; i += 1) indexById.set(list.get(i)!.get("id") as string, i);
    const origin = patch.origin ?? "user";
    for (const element of patch.update) {
      const index = indexById.get(element.id);
      if (index !== undefined) writeElement(list.get(index)!, element as unknown as DrawingElementJson, origin, patch.placements?.[element.id]);
    }
    const doomed = new Set(patch.remove);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (doomed.has(list.get(i)!.get("id") as string)) list.delete(i);
    }
    for (const element of patch.add) {
      if (!doomed.has(element.id)) pushElement(list, element as unknown as DrawingElementJson, origin, patch.placements?.[element.id]);
    }
    if (patch.order) restackList(list, patch.order);
  }, []);

  /**
   * The board right now, read straight from shared storage (not from React state, which lags a render
   * behind): the AI tools read the board between their own writes and need to see them. No write happens,
   * so it is not an undo step.
   */
  const readLiveStored = useLiveblocksM(({ storage }) => storage.get("elements").toImmutable() as unknown as StoredElement[], []);

  const seedElements = useLiveblocksM(
    ({ storage }, initial: DrawingElementJson[]) => {
      const list = storage.get("elements");
      if (list.length === 0 && initial.length > 0) {
        initial.forEach((el) => list.push(new LiveObject(el)));
      }
    },
    [],
  );

  // One undo step per drag / resize / erase stroke instead of one per mouse-move.
  const gestureHistory = useMemo(() => createGestureHistory(history), [history]);
  useEffect(() => () => gestureHistory.end(), [gestureHistory]);

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

  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  // The group the user has stepped into to edit its children; null = top level (see group-selection.ts).
  const [enteredGroupId, setEnteredGroupId] = useState<string | null>(null);
  // A group that no longer exists (deleted, dissolved, undone away) is not "entered" any more: forget it,
  // so redoing the change does not silently put the user back inside.
  useEffect(() => {
    if (enteredGroupId !== null && !groupIndex.groups.has(enteredGroupId)) setEnteredGroupId(null);
  }, [enteredGroupId, groupIndex]);
  const boardExport = useBoardExport({ elements, selectedIds: selectedElements, title: whiteboard?.title });

  const whiteboardAccess = useWhiteboardAccess(whiteboard);
  const canvasViewport = useCanvasViewport();
  const {
    generateId,
    getElementsAtPoint,
    getElementsInBounds,
    getResizeHandle,
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

    canvasViewport.fitToBounds({ minX, minY, maxX, maxY }, { rightInset: coveredByPanels(uiState.showAIModal, uiState.showCodePanel) });
  }, [elements, getElementBounds, canvasViewport, uiState.showAIModal, uiState.showCodePanel]);

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

  // Connectors that must follow changed shapes, with the labels linked to them: one function for dragging,
  // resizing, nudging and for the AI tools (the command context below hands out this same function).
  const commandContextRef = useRef<CommandContext | null>(null);
  const rerouteConnectedArrows = useMemo(
    () =>
      rerouteWithLabels(
        () => commandContextRef.current!,
        (changed) => rerouteConnectedArrowsForChanges(changed) as unknown as DrawingElement[],
      ),
    [rerouteConnectedArrowsForChanges],
  );

  /**
   * Delete shapes, the connectors attached to them and any group left empty, as one step. Locked
   * shapes are never deleted (`planRemove`), so the eraser and the Delete key respect locks alike.
   */
  const deleteElementsWithConnectedArrows = useCallback(
    (ids: string[]) => {
      const ctx = commandContextRef.current;
      const patch = ctx ? planRemove(ctx, ids) : null;
      if (patch) deleteElementsLive(patch.remove);
    },
    [deleteElementsLive],
  );

  // The selection chrome as data: unit boxes, the resize frame, the entered group's outline.
  const selectionOverlay = useMemo(
    () =>
      buildSelectionOverlay(groupIndex, selectedElements, effectiveContext(groupIndex, enteredGroupId), (id) => {
        const shape = groupIndex.shapes.get(id);
        return shape ? getElementBounds(shape) : null;
      }),
    [enteredGroupId, getElementBounds, groupIndex, selectedElements],
  );

  const baselineOf = useMemo(() => createBaselineResolver(), []);

  // What the pointer code needs to know about groups, without knowing how they are stored.
  const groupSelection = useMemo(
    () => ({
      index: groupIndex,
      context: effectiveContext(groupIndex, enteredGroupId),
      resolveClick: (input: { selected: string[]; hitId: string | null; additive: boolean }) =>
        resolveGroupClick(groupIndex, { ...input, entered: enteredGroupId }),
      resolveMarquee: (hitIds: string[]) => resolveMarquee(groupIndex, hitIds, enteredGroupId),
      isLocked: (shapeId: string) => isEffectivelyLocked(groupIndex, shapeId),
      setContext: setEnteredGroupId,
      frame: () => {
        const frame = selectionOverlay?.frame;
        if (!frame || frame.locked) return null;
        const elements = expandUnits(groupIndex, frame.unitIds).flatMap((id) => groupIndex.shapes.get(id) ?? []);
        return elements.length > 0 ? { bounds: frame.bounds, elements: withInternalConnectors(elements, allShapes) } : null;
      },
    }),
    [allShapes, groupIndex, enteredGroupId, selectionOverlay],
  );

  const {
    commitFrameOwnership,
    commitDrawnFrame,
    updateFrameProps,
    fitFramesToContent,
  } = useFrameOperations({
    readLiveStored,
    applyDocPatch,
    setSelectedElements,
    setCurrentTool: uiState.setCurrentTool,
    hasEditAccess: whiteboardAccess.hasEditAccess,
  });

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
    moveElements: (origin, dx, dy) => {
      const changed = planShapeMoves(origin, uniformOffsets(origin, dx, dy), rerouteConnectedArrows);
      updateElements(changed as unknown as DrawingElementJson[]);
    },
    selection: groupSelection,
    snapSettings: uiState.snapSettings,
    baselineOf,
    resizeFrameElements: (origin, from, to) => {
      const changed = planFrameScale(origin, from, to, rerouteConnectedArrows);
      updateElements(changed as unknown as DrawingElementJson[]);
    },
    zoom: canvasViewport.zoom,
    resizeElement: (id, handle, pt, bounds, base) => {
      const resized = resizeElement(id, handle, pt, bounds, base);
      if (resized) {
        const arrows = rerouteConnectedArrows([resized]);
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
    beginGesture: gestureHistory.begin,
    endGesture: gestureHistory.end,
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
    onDragCommit: commitFrameOwnership,
    onFrameDrawn: commitDrawnFrame,
    onElementCreated: (id) => {
      setSelectedElements([id]);
      uiState.setCurrentTool("select");
    },
    startPanning: canvasViewport.startPanning,
    handlePan: canvasViewport.handlePan,
    stopPanning: canvasViewport.stopPanning,
  });

  // The stored snapshot is merged into an empty live room exactly once. Until
  // that has happened (or failed) the live board can look empty without being
  // empty, so autosave must not run: it would overwrite the stored content.
  const [seedState, setSeedState] = useState<"pending" | "settled" | "failed">(
    "pending",
  );

  const whiteboardAutoSave = useWhiteboardAutoSave({
    whiteboardId,
    elements: stored,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    ready: liveElements !== null && seedState === "settled",
    canSave: !whiteboardDrawing.hasActiveDrawing && !currentElement,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    whiteboard,
  });

  useEffect(() => {
    seededRef.current = false;
    viewportLoadedRef.current = false;
    setSeedState("pending");
  }, [whiteboardId]);

  useEffect(() => {
    if (seededRef.current || liveElements === null || !whiteboard) return;
    seededRef.current = true;

    const saved = parseSavedContent(whiteboard.content);
    if (saved.status === "corrupt") {
      // Keep autosave off so the unreadable snapshot is not overwritten.
      setSeedState("failed");
      toast.error(
        "This whiteboard's saved data could not be read. Autosave is paused to protect it.",
      );
      return;
    }
    if (saved.status === "ok" && saved.elements.length > 0) {
      seedElements(saved.elements as unknown as DrawingElementJson[]);
    }
    setSeedState("settled");
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

  // The board as editor commands see it. The AI tools build the same object over their own copy of the
  // list, so a command means the same thing whoever runs it.
  const commandContext = useMemo<CommandContext>(
    () => ({
      stored,
      shapes: allShapes,
      index: groupIndex,
      getBounds: getElementBounds,
      reroute: rerouteConnectedArrows,
      routeArrow: routeArrowByConnections,
      newId: generateId,
    }),
    [allShapes, generateId, getElementBounds, groupIndex, rerouteConnectedArrows, routeArrowByConnections, stored],
  );

  commandContextRef.current = commandContext;

  const elementCommands = useElementCommands({
    ctx: commandContext,
    selectedElements,
    setSelectedElements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    applyPatch: applyDocPatch,
    deleteElements: deleteElementsWithConnectedArrows,
  });

  const organizeCommands = useOrganizeCommands({
    ctx: commandContext,
    selectedElements,
    setSelectedElements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    applyPatch: applyDocPatch,
  });

  const frameCommands = useFrameCommands({
    stored,
    readLive: readLiveStored,
    selectedElements,
    setSelectedElements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    generateId,
    applyPatch: applyDocPatch,
  });

  const groupCommands = useGroupCommands({
    stored,
    groupIndex,
    selectedElements,
    setSelectedElements,
    enteredGroupId,
    setEnteredGroupId,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    generateId,
    applyPatch: applyDocPatch,
  });

  const {
    insertIcon,
    insertShape,
    beginEditing,
    planLayout,
    applyLayoutPlan,
    handleShapeDoubleClick,
  } = useElementInsertion({
    viewportBounds: canvasViewport.viewportBounds,
    generateId,
    addElement,
    setSelectedElements,
    uiState,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    groupIndex,
    enteredGroupId,
    setEnteredGroupId,
    commandContextRef,
    gestureHistory,
    applyDocPatch,
  });

  const deleteSelectedElements = useCallback(() => {
    if (selectedElements.length > 0) {
      deleteElementsWithConnectedArrows(selectedElements);
      // Locked shapes survive a delete and stay selected, so the user can see why and unlock them.
      setSelectedElements(selectedElements.filter((id) => groupSelection.isLocked(id)));
    }
  }, [deleteElementsWithConnectedArrows, groupSelection, selectedElements]);

  useKeyboardShortcuts({
    currentTool: uiState.currentTool,
    setCurrentTool: uiState.setCurrentTool,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    selectedElements,
    setSelectedElements,
    elements,
    handleUndo,
    handleRedo,
    saveWhiteboard: whiteboardAutoSave.saveWhiteboard,
    elementCommands,
    groupCommands,
    organizeCommands,
    frameCommands,
    deleteSelectedElements,
    cancelDrawing: whiteboardDrawing.cancelDrawing,
    handleZoomIn: canvasViewport.handleZoomIn,
    handleZoomOut: canvasViewport.handleZoomOut,
    handleResetZoom: canvasViewport.handleResetZoom,
    toggleGrid: canvasViewport.toggleGrid,
    handleFitToScreen,
    setShowCommandMenu: uiState.setShowCommandMenu,
    setShowExport: uiState.setShowExport,
    setShowIconPicker: uiState.setShowIconPicker,
    beginEditing,
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

  const { updateArrowBendsAtPoint } = useSelectedArrow({
    // A locked arrow keeps its bends.
    hasEditAccess: whiteboardAccess.hasEditAccess && !(selectedElement && isEffectivelyLocked(groupIndex, selectedElement.id)),
    zoom: canvasViewport.zoom,
    updateElement,
  });

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

  const { handleStyleChange, handleStrokeWidthChange, handleFontSizeChange, applyStyle } =
    useSelectionStyle({
      uiState,
      ctx: commandContext,
      selectedElements,
      hasEditAccess: whiteboardAccess.hasEditAccess,
      applyPatch: applyDocPatch,
    });

  const updateConnectors = useConnectorStyle({
    elements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    routeArrowByConnections,
    updateElements,
  });
  const propertiesBar = useMemo(() => readPropertiesBar(groupIndex, selectedElements), [groupIndex, selectedElements]);

  const semanticNodes = useSemanticNodeCommands({
    elements,
    selectedElements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    isLocked: groupSelection.isLocked,
    updateElements,
    openIconPicker: uiState.openReplaceIconPicker,
    beginEditing,
  });

  // Rows, members and names of the one selected structured shape (entity table, class, topic, lifeline), edited as text.
  const structured = useMemo(() => {
    const only = selectedElements.length === 1 ? elements.find((el) => el.id === selectedElements[0]) : undefined;
    if (!isStructured(only)) return null;
    const editable = whiteboardAccess.hasEditAccess && !groupSelection.isLocked(only.id);
    return {
      fields: readStructured(only),
      editable,
      set: (field: Parameters<typeof planStructured>[1], text: string) => {
        if (editable) updateElements([planStructured(only, field, text)] as unknown as DrawingElementJson[]);
      },
    };
  }, [elements, groupSelection, selectedElements, updateElements, whiteboardAccess.hasEditAccess]);

  // One picker serves both jobs: a pick adds an icon to the board, or (replace mode) retargets the selected nodes.
  const pickIcon = useCallback(
    (icon: IconDef) => (uiState.iconPickerMode === "replace" ? semanticNodes.replaceIcon(icon) : insertIcon(icon)),
    [insertIcon, semanticNodes, uiState.iconPickerMode],
  );

  const inspector = useSelectionInspector({
    groupIndex,
    selectedElements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    getElementBounds,
    updateElements: (batch) => updateElements(batch),
    rerouteConnectedArrows,
  });

  const handleClearSelection = useCallback(() => setSelectedElements([]), []);
  const handleSelectAllElements = useCallback(
    () => setSelectedElements(elements.map((el) => el.id)),
    [elements],
  );

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
          handleClear();
          toast.success("Canvas cleared");
          break;
        case "save":
          toast.success("Autosave is active. Changes are synced!");
          break;
        case "shortcuts":
          uiState.setShowShortcuts(true);
          break;
        case "export":
          uiState.setShowExport(true);
          break;
        case "insert-icon":
          uiState.setShowIconPicker(true);
          break;
        case "insert-shape":
          uiState.setShowShapePicker(true);
          break;
        case "layout":
          uiState.setShowLayoutPanel(true);
          break;
        case "open-agent":
          uiState.setShowAIModal(true);
          break;
        case "open-code":
          uiState.setShowCodePanel(true);
          break;
        case "group":
          groupCommands.group();
          break;
        case "ungroup":
          groupCommands.ungroup();
          break;
        case "toggle-lock":
          groupCommands.toggleLock();
          break;
        case "hide":
          organizeCommands.hide();
          break;
        case "show-all":
          if (!organizeCommands.showAll().changed) toast("Nothing is hidden.");
          break;
        case "frame":
          frameCommands.frameSelection();
          break;
        case "frame-fit":
          frameCommands.fitFrames();
          break;
        case "frame-remove-from":
          frameCommands.removeFromFrame();
          break;
        case "frame-release":
          frameCommands.releaseFrames();
          break;
        case "auto-layout":
        case "tidy": {
          const outcome = action === "tidy" ? organizeCommands.tidy() : organizeCommands.autoLayout({ algorithm: "layered" });
          if (!outcome.changed) toast(outcome.notes[0] ?? "Nothing needed to move.");
          else outcome.notes.forEach((note) => toast(note));
          break;
        }
        case "align-left":
        case "align-center":
        case "align-right":
        case "align-top":
        case "align-middle":
        case "align-bottom":
          elementCommands.align(action.slice("align-".length) as "left" | "center" | "right" | "top" | "middle" | "bottom");
          break;
        case "distribute-horizontal":
        case "distribute-vertical":
          elementCommands.distribute(action.slice("distribute-".length) as "horizontal" | "vertical");
          break;
        case "copy-image":
          void boardExport.copyImage(selectedElements.length > 0).then((message) => message && toast.error(message));
          break;
        case "copy-svg":
          void boardExport.copySvg(selectedElements.length > 0).then((message) => message && toast.error(message));
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
      boardExport,
      elementCommands,
      frameCommands,
      groupCommands,
      organizeCommands,
      selectedElements.length,
      uiState,
    ],
  );

  const loadWhiteboard = useCallback(() => {
    toast.success("This whiteboard is automatically loaded from the database!");
  }, []);

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

  const { applyDiagramCode } = useDiagramCodeSync({
    elements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    gestureHistory,
    applyDocPatch,
    deleteElementsLive,
    setSelectedElements,
    canvasViewport,
    showAIModal: uiState.showAIModal,
    showCodePanel: uiState.showCodePanel,
  });

  const { handleEditingTextChange, handleEditingTextCommit, handleEditingTextMove } = useEditingText({
    uiState,
    elements,
    addElement,
    updateElement,
    deleteElementsLive,
  });

  const handleFitToViewport = handleFitToScreen;

  return {
    whiteboardId,
    whiteboard,
    canvasRef,
    elements,
    stored,
    groupIndex,
    groupCommands,
    organizeCommands,
    frameCommands,
    groupSelection,
    selectionOverlay,
    inspector,
    baselineOf,
    enteredGroupId: effectiveContext(groupIndex, enteredGroupId),
    handleShapeDoubleClick,
    currentElement,
    setCurrentElement,
    selectedElements,
    setSelectedElements,
    selectedElement,
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
    beginEditing,
    insertIcon,
    insertShape,
    planLayout,
    applyLayoutPlan,
    pickIcon,
    semanticNodes,
    structured,
    boardExport,
    deleteSelectedElements,
    elementCommands,
    isBoardReady: liveElements !== null && seedState === "settled",
    handleSelectAllElements,
    handleClearSelection,
    handleStrokeWidthChange,
    handleFontSizeChange,
    applyStyle,
    handleStyleChange,
    updateFrameProps,
    fitFramesToContent,
    updateConnectors,
    propertiesBar,
    updateArrowBendsAtPoint,
    applyDiagramCode,
    handleEditingTextChange,
    handleEditingTextCommit,
    handleEditingTextMove,
    generateId,
    getElementsAtPoint,
    getElementBounds,
    addElement,
    updateElement,
    deleteElementsLive,
    applyDocPatch,
    readLiveStored,
    seededRef,
    viewportLoadedRef,
    ...uiState,
  };
};

export type WhiteboardPageController = ReturnType<
  typeof useWhiteboardPageController
>;
