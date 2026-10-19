import { useCallback, useMemo, useState } from "react";
import type { GroupIndex } from "@/core/groups/group-index";
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
          targets: targets(),
          frame: model.frame,
          frameIsLocal: model.frameIsLocal,
          edit,
          keepRatio,
          getBounds: getElementBounds,
          reroute: rerouteConnectedArrows,
        }),
      );
    },
    [getElementBounds, hasEditAccess, keepRatio, model, rerouteConnectedArrows, targets, write],
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
