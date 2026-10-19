import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createCanvasAgentHandler } from "@/features/canvas-tools/agent/handler";
import { createCanvasTransport } from "@/features/canvas-tools/agent/transport";
import { createSlidingWindowLimiter, getEnabledProviders } from "@/features/ai/server/request-guard";
import { unifiedAgentServerEnabled } from "@/features/canvas-tools/agent/flags";
import { InvalidRoomError, decideRoomAccess } from "@/lib/authz/room-access";

export const runtime = "nodejs";

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// One agent run is several model turns, so the budget is per turn: 120 per user per 10 minutes by default.
const limiter = createSlidingWindowLimiter({
  windowMs: positiveInt(process.env.AI_AGENT_RATE_LIMIT_WINDOW_MS, 10 * 60_000),
  max: positiveInt(process.env.AI_AGENT_RATE_LIMIT_MAX, 120),
});

const handler = createCanvasAgentHandler({
  getUserId: async () => (await auth()).userId,
  // The same rule as the realtime room: ask Convex, as this user, whether they may use the whiteboard. Fails closed.
  checkBoardAccess: async ({ userId, whiteboardId }) => {
    const decision = await decideRoomAccess({
      userId,
      room: whiteboardId,
      checkAccess: async (roomId) => {
        const token = await (await auth()).getToken({ template: "convex" });
        if (!token) throw new Error("No Convex token for this session");
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        convex.setAuth(token);
        try {
          return await convex.query(api.whiteboard.getAccess, { id: roomId as Id<"whiteboards"> });
        } catch (error) {
          if (/ArgumentValidationError|Invalid argument|Unable to decode/i.test(String(error))) throw new InvalidRoomError();
          throw error;
        }
      },
    });
    return decision.ok ? { ok: true } : { ok: false, status: decision.status, message: decision.message };
  },
  enabledProviders: () => getEnabledProviders(),
  unifiedAgent: () => unifiedAgentServerEnabled(),
  // Board memory is read as the signed-in user, so Convex applies the board's own access rule again.
  loadMemories: async ({ whiteboardId }) => {
    const token = await (await auth()).getToken({ template: "convex" });
    if (!token) return [];
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);
    const notes = await convex.query(api.aiMemory.listForBoard, { whiteboardId });
    return notes.map((note) => ({ kind: note.kind, text: note.text }));
  },
  loadSummary: async ({ whiteboardId }) => {
    const token = await (await auth()).getToken({ template: "convex" });
    if (!token) return null;
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);
    return await convex.query(api.aiConversation.summary, { whiteboardId });
  },
  limiter,
  createTransport: (provider, specs, model) => createCanvasTransport(provider, specs, (reason) => console.warn("[canvas-agent] tool calling unavailable, using the text protocol:", reason), process.env, model),
  log: (event) => console.info(JSON.stringify(event)),
});

export async function POST(req: Request) {
  return handler(req);
}
