import { WhiteboardPageController, useWhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { WhiteboardChrome } from "@/features/whiteboard/components/chrome/whiteboard-chrome";
import { WhiteboardCanvasStage } from "@/features/whiteboard/components/canvas/whiteboard-canvas-stage";
import { WhiteboardEditingOverlays } from "@/features/whiteboard/components/overlays/whiteboard-editing-overlays";

interface WhiteboardCanvasRoomProps {
  whiteboardId: string;
}

export const WhiteboardCanvasRoom = ({
  whiteboardId,
}: WhiteboardCanvasRoomProps) => {
  const controller = useWhiteboardPageController(whiteboardId);

  return (
    <WhiteboardCanvasRoomView controller={controller} />
  );
};

const WhiteboardCanvasRoomView = ({
  controller,
}: {
  controller: WhiteboardPageController;
}) => {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background transition-colors duration-300">
      <WhiteboardChrome controller={controller} />
      <WhiteboardCanvasStage controller={controller} />
      <WhiteboardEditingOverlays controller={controller} />
    </div>
  );
};

export default WhiteboardCanvasRoom;
