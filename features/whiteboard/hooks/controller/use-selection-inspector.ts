import { useCallback, useMemo, useState } from "react";
import { withFrameContents } from "@/core/frames/payload";
import { isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { DrawingElementJson } from "@/liveblocks.config";
import { planFrameEdit, planRotateBy, planSetRotation, type FrameEdit } from "@/features/whiteboard/utils/inspector-edit";
import { readInspector } from "@/features/whiteboard/utils/inspector-model";

interface Props {
  groupIndex: GroupIndex;
  selectedElements: string[];
  hasEditAccess: boolean;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  /** One storage mutation for the whole batch, so every edit is one undo step. */
  updateElements: (batch: DrawingElementJson[]) => void;
  /** Connectors that must follow the changed shapes (the editor's incremental router). */
  rerouteConnectedArrows: (changed: DrawingElement[]) => DrawingElement[];
}

/**
 * Precise numeric editing of the selection: X, Y, width, height and rotation. Reading is
 * `readInspector` and every edit is a pure plan (`inspector-edit.ts`), so this hook only connects
 * them to the document; it never decides geometry itself.
 */
export const useSelectionInspector = ({
  groupIndex,
  selectedElements,
  hasEditAccess,
  getElementBounds,
  updateElements,
  rerouteConnectedArrows,
}: Props) => {
  const [keepRatio, setKeepRatio] = useState(false);

  const boundsOfShape = useCallback(
    (id: string) => {
      const shape = groupIndex.shapes.get(id);
      return shape ? getElementBounds(shape) : null;
    },
    [getElementBounds, groupIndex],
  );

  const model = useMemo(() => readInspector(groupIndex, selectedElements, boundsOfShape), [boundsOfShape, groupIndex, selectedElements]);

  const targets = useCallback(
    () => (model?.targetIds ?? []).flatMap((id) => groupIndex.shapes.get(id) ?? []),
    [groupIndex, model],
  );

  /**
   * What an X/Y edit moves: a frame travels with everything it owns. A width or height edit stays on the
   * frame alone, as it does when dragging a frame's handle, so typing a size never rescales the contents.
   */
  const targetsFor = useCallback(
    (edit: FrameEdit) => {
      const own = targets();
      if (edit.width !== undefined || edit.height !== undefined) return own;
      const ids = withFrameContents([...groupIndex.shapes.values()], own.map((shape) => shape.id));
      return ids.flatMap((id) => (isEffectivelyLocked(groupIndex, id) ? [] : (groupIndex.shapes.get(id) ?? [])));
    },
    [groupIndex, targets],
  );

  const write = useCallback(
    (changed: DrawingElement[]) => {
      if (changed.length > 0) updateElements(changed as unknown as DrawingElementJson[]);
    },
    [updateElements],
  );

  const setFrame = useCallback(
    (edit: FrameEdit) => {
      if (!hasEditAccess || !model || model.locked || !model.frame) return;
      write(
        planFrameEdit({
          targets: targetsFor(edit),
          frame: model.frame,
          frameIsLocal: model.frameIsLocal,
          edit,
          keepRatio,
          getBounds: getElementBounds,
          reroute: rerouteConnectedArrows,
        }),
      );
    },
    [getElementBounds, hasEditAccess, keepRatio, model, rerouteConnectedArrows, targetsFor, write],
  );

  /** One shape's own angle. */
  const setRotation = useCallback(
    (degrees: number) => {
      if (!hasEditAccess || !model || model.rotation.mode !== "absolute") return;
      const [shape] = targets();
      if (shape) write(planSetRotation(shape, degrees, rerouteConnectedArrows));
    },
    [hasEditAccess, model, rerouteConnectedArrows, targets, write],
  );

  /** Turn the selection about the centre of its frame. */
  const rotateBy = useCallback(
    (degrees: number) => {
      if (!hasEditAccess || !model || model.locked || !model.frame) return;
      if (model.rotation.mode === "absolute") {
        setRotation(model.rotation.value + degrees);
        return;
      }
      if (model.rotation.mode === "relative") {
        write(planRotateBy(targets(), model.frame, degrees, getElementBounds, rerouteConnectedArrows));
      }
    },
    [getElementBounds, hasEditAccess, model, rerouteConnectedArrows, setRotation, targets, write],
  );

  return { model, keepRatio, setKeepRatio, setFrame, setRotation, rotateBy };
};
