import { useCallback } from "react";
import { toast } from "sonner";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import { DEFAULT_LABEL_FONT_SIZE, defaultLabelWeight } from "@/core/text/label-layout";
import { normalizeRichTextInput } from "@/features/whiteboard/utils/rich-text-renderer";
import type { IconDef } from "@/core/icons/registry";
import { buildIconElement } from "@/features/whiteboard/utils/icon-picker";
import { buildShapeElement } from "@/features/whiteboard/utils/shape-picker";
import type { VocabularyEntry } from "@/core/shapes/vocabulary";
import { frameRegions } from "@/core/frames/frame-model";
import { isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";
import { isStructured } from "@/features/whiteboard/utils/structured-edit";
import { resolveDoubleClick } from "@/features/whiteboard/hooks/interaction/group-selection";
import { planEngineLayout, type EngineLayoutInput, type EngineLayoutPlan } from "@/features/whiteboard/commands/layout-engine";
import { semanticZoneAt } from "@/core/shapes/semantic-node/layout";
import { getShapeLocalBounds, getShapeRotation } from "@/core/shapes/shape-runtime";
import { centerOf, rotatePoint } from "@/core/geometry/box";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import type { DocPatch } from "@/core/groups/patch";
import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";

export interface UseElementInsertionProps {
  viewportBounds: { minX: number; minY: number; maxX: number; maxY: number };
  generateId: () => string;
  addElement: (element: DrawingElementJson) => void;
  setSelectedElements: (elements: string[] | ((prev: string[]) => string[])) => void;
  uiState: ReturnType<typeof useWhiteboardUiState>;
  hasEditAccess: boolean;
  groupIndex: GroupIndex;
  enteredGroupId: string | null;
  setEnteredGroupId: (id: string | null) => void;
  commandContextRef: React.RefObject<CommandContext | null>;
  gestureHistory: { begin: () => void; end: () => void };
  applyDocPatch: (patch: DocPatch) => void;
}

export function useElementInsertion({
  viewportBounds,
  generateId,
  addElement,
  setSelectedElements,
  uiState,
  hasEditAccess,
  groupIndex,
  enteredGroupId,
  setEnteredGroupId,
  commandContextRef,
  gestureHistory,
  applyDocPatch,
}: UseElementInsertionProps) {
  // The icon lands in the middle of what the user is looking at, selected, ready to drag or label.
  const insertIcon = useCallback(
    (icon: IconDef) => {
      const { minX, minY, maxX, maxY } = viewportBounds;
      const node = buildIconElement(icon, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, generateId());
      addElement(node as unknown as DrawingElementJson);
      setSelectedElements([node.id]);
      uiState.setCurrentTool("select");
      // A table, class, topic or lifeline is empty until it is filled in: open its editor straight away.
      if (isStructured(node)) uiState.setEditingShapeLabelId(node.id);
    },
    [addElement, generateId, setSelectedElements, uiState, viewportBounds],
  );

  // A shape from the picker lands the same way an icon does: in the middle of the view, selected, ready to label.
  const insertShape = useCallback(
    (entry: VocabularyEntry) => {
      const { minX, minY, maxX, maxY } = viewportBounds;
      const node = buildShapeElement(entry, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, generateId());
      if (!node) return;
      addElement(node as unknown as DrawingElementJson);
      setSelectedElements([node.id]);
      uiState.setCurrentTool("select");
    },
    [addElement, generateId, setSelectedElements, uiState, viewportBounds],
  );

  /** Opens the right editor for `element` (standalone text or a shape's label); false when it has no text. */
  const beginEditing = useCallback(
    (element: DrawingElement): boolean => {
      if (!hasEditAccess) return false;
      // Locked shapes can be selected but not changed, and typing into one is a change.
      if (isEffectivelyLocked(groupIndex, element.id)) return false;
      if (element.type === "text") {
        uiState.setEditingTextElement(element);
        uiState.setCurrentTool("select");
        return true;
      }
      if (element.type === "frame") {
        // The title is a field of the frame, edited in place; a frame with its header hidden has none to edit.
        if (!frameRegions(element)?.header) return false;
        uiState.setEditingShapeLabelId(element.id);
        setSelectedElements([element.id]);
        uiState.setCurrentTool("select");
        return true;
      }
      if (isStructured(element)) {
        // Entity tables, classes, topics and lifelines edit their content in a card over the shape.
        uiState.setEditingShapeLabelId(element.id);
        setSelectedElements([element.id]);
        uiState.setCurrentTool("select");
        return true;
      }
      if (shapeRegistry.get(element.type)?.labelConfig?.anchor !== "center") return false;
      uiState.setEditingShapeLabelId(element.id);
      uiState.setEditingShapeLabelDraft(normalizeRichTextInput(element.label ?? ""));
      // Same fallbacks the canvas renderer uses, so opening the editor changes nothing.
      const labelSize = element.fontSize || DEFAULT_LABEL_FONT_SIZE;
      uiState.setEditingShapeLabelFontSize(labelSize);
      uiState.setEditingShapeLabelFontWeight(element.fontWeight || defaultLabelWeight(labelSize));
      uiState.setEditingShapeLabelFontStyle(element.fontStyle || "normal");
      setSelectedElements([element.id]);
      uiState.setCurrentTool("select");
      return true;
    },
    [groupIndex, hasEditAccess, setSelectedElements, uiState],
  );

  // Layout through the engines: a plan is computed against the board as it is now and nothing is written until it is applied (one undo step).
  const planLayout = useCallback((input: EngineLayoutInput) => planEngineLayout(commandContextRef.current!, input), [commandContextRef]);
  const applyLayoutPlan = useCallback(
    (plan: EngineLayoutPlan) => {
      if (!hasEditAccess || !plan.patch) return false;
      gestureHistory.begin();
      try {
        applyDocPatch(plan.patch);
      } finally {
        gestureHistory.end();
      }
      toast.success(plan.preview.moves.length === 0 ? "Layout saved." : `Laid out: ${plan.preview.moves.length} element${plan.preview.moves.length === 1 ? "" : "s"} moved.`);
      return true;
    },
    [applyDocPatch, gestureHistory, hasEditAccess],
  );

  /**
   * Double-click on a shape. In a group it steps into the group (selecting the child under the
   * pointer); on an ordinary shape, or inside the group that holds it, it edits the text.
   */
  const handleShapeDoubleClick = useCallback(
    (element: DrawingElement, point?: Point) => {
      const action = resolveDoubleClick(groupIndex, element.id, enteredGroupId);
      if (action.kind === "enter") {
        setEnteredGroupId(action.group);
        setSelectedElements(action.select);
        return true;
      }
      // Double-clicking a semantic node's icon replaces the icon; anywhere else edits the label.
      if (point && element.type === "semantic-node" && hasEditAccess && !isEffectivelyLocked(groupIndex, element.id)) {
        const local = getShapeLocalBounds(element);
        if (local) {
          const inFrame = rotatePoint(point, centerOf(local), -getShapeRotation(element));
          if (semanticZoneAt(local, element.nodeStyle, inFrame) === "icon") {
            setSelectedElements([element.id]);
            uiState.openReplaceIconPicker();
            return true;
          }
        }
      }
      return beginEditing(element);
    },
    [beginEditing, enteredGroupId, groupIndex, hasEditAccess, setEnteredGroupId, setSelectedElements, uiState],
  );

  return {
    insertIcon,
    insertShape,
    beginEditing,
    planLayout,
    applyLayoutPlan,
    handleShapeDoubleClick,
  };
}
