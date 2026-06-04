import { WhiteboardPageController, useWhiteboardPageController } from "@/features/whiteboard/hooks/use-whiteboard-page-controller";
import { WhiteboardChrome } from "@/features/whiteboard/components/whiteboard-chrome";
import { WhiteboardCanvasStage } from "@/features/whiteboard/components/whiteboard-canvas-stage";
import { WhiteboardEditingOverlays } from "@/features/whiteboard/components/whiteboard-editing-overlays";

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
    <div className="relative h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,#f7f8fa_0%,#f2f4f7_45%,#eceff3_100%)]">
      <WhiteboardChrome controller={controller} />
      <WhiteboardCanvasStage controller={controller} />
      <WhiteboardEditingOverlays controller={controller} />
    </div>
  );
};

export default WhiteboardCanvasRoom;
