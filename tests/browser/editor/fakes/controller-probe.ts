// Swapped in for the controller module by bundle.ts: runs the REAL hook and publishes its result on
// window.__editor so tests can read the viewport, selection and tool without touching React internals.
import { useWhiteboardPageController as useRealController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";

export type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";

export const useWhiteboardPageController = (whiteboardId: string) => {
  const controller = useRealController(whiteboardId);
  window.__editor.controller = controller;
  return controller;
};
