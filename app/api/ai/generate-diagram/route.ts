import { auth } from "@clerk/nextjs/server";
import {
  createGenerateDiagramHandler,
  createProvidersHandler,
} from "@/features/ai/server/generate-diagram-handler";
import {
  createSlidingWindowLimiter,
  getEnabledProviders,
} from "@/features/ai/server/request-guard";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";

export const runtime = "nodejs";

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Per server instance. Defaults: 10 generations per user per 10 minutes.
const limiter = createSlidingWindowLimiter({
  windowMs: positiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10 * 60_000),
  max: positiveInt(process.env.AI_RATE_LIMIT_MAX, 10),
});

const getUserId = async () => (await auth()).userId;

const handler = createGenerateDiagramHandler({
  getUserId,
  enabledProviders: () => getEnabledProviders(),
  limiter,
  runWorkflow: (request) => streamAIDiagramWorkflowEvents({ request }),
});
const providers = createProvidersHandler({
  getUserId,
  enabledProviders: () => getEnabledProviders(),
});

export async function POST(req: Request) {
  return handler(req);
}

export async function GET() {
  return providers();
}
