import { useCallback, useMemo } from "react";
import type { IconDef } from "@/core/icons/registry";
import type { NodeStylePatch } from "@/core/shapes/semantic-node/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { DrawingElementJson } from "@/liveblocks.config";
import {
  isSemanticNode,
  planLabel,
  planNodeStyle,
  planRemoveIcon,
  planReplaceIcon,
  planRestoreIcon,
  planTypography,
  readSemanticSelection,
} from "@/features/whiteboard/utils/semantic-node-edit";

interface Props {
  elements: DrawingElement[];
  selectedElements: string[];
  hasEditAccess: boolean;
  /** Locked nodes (and nodes in locked groups) are read but never changed. */
  isLocked: (shapeId: string) => boolean;
  /** One storage mutation for the whole batch, so each action is one undo step. */
  updateElements: (batch: DrawingElementJson[]) => void;
  /** Opens the icon picker in "replace" mode. */
  openIconPicker: () => void;
  /** Starts inline editing of a shape's label on the canvas. */
  beginEditing: (element: DrawingElement) => boolean;
}

/**
 * Icon and presentation edits for the selected semantic nodes. It only connects the pure plans in
 * `semantic-node-edit.ts` to the document (selection in, one batched write out); it decides nothing.
 */
export const useSemanticNodeCommands = ({ elements, selectedElements, hasEditAccess, isLocked, updateElements, openIconPicker, beginEditing }: Props) => {
  const model = useMemo(() => readSemanticSelection(elements, selectedElements, isLocked), [elements, isLocked, selectedElements]);

  /** The selected nodes an edit may change. */
  const targets = useCallback(() => {
    if (!hasEditAccess || !model) return [];
    const editable = new Set(model.editable);
    return elements.filter((element) => editable.has(element.id));
  }, [elements, hasEditAccess, model]);

  const write = useCallback(
    (plan: (nodes: DrawingElement[]) => DrawingElement[]) => {
      const changed = plan(targets());
      if (changed.length > 0) updateElements(changed as unknown as DrawingElementJson[]);
    },
    [targets, updateElements],
  );

  const replaceIcon = useCallback((icon: IconDef) => write((nodes) => planReplaceIcon(nodes, icon)), [write]);
  const removeIcon = useCallback(() => write(planRemoveIcon), [write]);
  const restoreIcon = useCallback(() => write(planRestoreIcon), [write]);
  const setStyle = useCallback((patch: NodeStylePatch) => write((nodes) => planNodeStyle(nodes, patch)), [write]);
  const setLabel = useCallback((label: string) => write((nodes) => planLabel(nodes, label)), [write]);
  const setTypography = useCallback(
    (change: { fontWeight?: string; italic?: boolean }) => write((nodes) => planTypography(nodes, change)),
    [write],
  );

  /** Inline-edits the label of the single selected node. */
  const editLabel = useCallback(() => {
    const [only] = targets();
    if (only && targets().length === 1 && isSemanticNode(only)) beginEditing(only);
  }, [beginEditing, targets]);

  return { model, replaceIcon, removeIcon, restoreIcon, setStyle, setLabel, setTypography, editLabel, openIconPicker };
};
