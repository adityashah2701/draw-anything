import { NextRequest } from "next/server";
import { AIGenerateDiagramRequest } from "@/features/ai/types";
import { encodeSse, toV1CompatibilityEvents } from "@/features/ai/server/sse";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";

export const runtime = "nodejs";

const encoder = new TextEncoder();

const writeEvent = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: unknown,
) => {
  controller.enqueue(encoder.encode(encodeSse(event)));
};

const toSafeErrorMessage = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Failed to generate diagram.";

  if (
    message.includes("tool call validation failed") ||
    message.includes("parameters for tool") ||
    message.includes("failed_generation")
  ) {
    return "The AI provider returned a malformed diagram graph. I adjusted the schema to tolerate missing edge style fields; please try again.";
  }

  if (message.includes("Missing ") && message.includes("AI provider")) {
    return message;
  }

  return message.length > 240 ? "Failed to generate diagram." : message;
};

export async function POST(req: NextRequest) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let request: AIGenerateDiagramRequest | null = null;
      let activeFrameId = `ai_frame_error_${Date.now()}`;

      try {
        const body = await req.json();
        const prompt = body?.prompt;
        if (!prompt || typeof prompt !== "string") {
          writeEvent(controller, {
            type: "frame.error",
            frameId: activeFrameId,
            message: "Prompt is required.",
          });
          writeEvent(controller, { type: "error", message: "Prompt is required." });
          controller.close();
          return;
        }

        request = {
          prompt: prompt.trim(),
          provider: body?.provider ?? body?.model ?? "gemini",
          model: body?.model,
          whiteboardId: body?.whiteboardId,
          canvasContext: body?.canvasContext,
        };

        for await (const event of streamAIDiagramWorkflowEvents({ request })) {
          if ("frameId" in event) {
            activeFrameId = event.frameId;
          } else if (event.type === "frame.created") {
            activeFrameId = event.frame.frameId;
          }
          writeEvent(controller, event);
          for (const compat of toV1CompatibilityEvents(event)) {
            writeEvent(controller, compat);
          }
          if (event.type === "element.batch") {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
      } catch (error) {
        const message = toSafeErrorMessage(error);
        const event = {
          type: "frame.error",
          frameId: activeFrameId,
          message,
        };
        writeEvent(controller, event);
        writeEvent(controller, { type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
