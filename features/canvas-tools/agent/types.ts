import { z } from "zod";
import { TOOL_GROUPS, type ToolGroup } from "../types";
import type { ToolErrorInfo } from "../errors";

/**
 * The conversation between the editor and the model. There is no `system` role here on purpose: the
 * server writes the system prompt itself, so nothing the browser sends can replace the rules.
 */
export type CanvasMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: CanvasToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export interface CanvasToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** What the server returns for one model turn. */
export interface CanvasTurn {
  text: string;
  calls: Array<CanvasToolCall & { problem?: ToolErrorInfo }>;
  transport: "native" | "text";
}

export const MAX_TURN_MESSAGES = 80;
export const MAX_TURN_CHARS = 150_000;
export const MAX_CALLS_PER_TURN = 12;

const callId = z.string().min(1).max(80);

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(8_000) }).strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.string().max(20_000),
      toolCalls: z.array(z.object({ id: callId, name: z.string().min(1).max(60), args: z.unknown() }).strict()).max(MAX_CALLS_PER_TURN).optional(),
    })
    .strict(),
  z.object({ role: z.literal("tool"), callId, name: z.string().min(1).max(60), content: z.string().max(24_000) }).strict(),
]);

export const turnRequestSchema = z
  .object({
    whiteboardId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    provider: z.enum(["gemini", "groq", "openai", "anthropic", "openrouter", "nvidia", "local"]).optional(),
    /** NVIDIA only: one of the listed models (checked by the handler); omitted means the provider's default. */
    model: z.string().max(80).optional(),
    messages: z.array(messageSchema).min(1).max(MAX_TURN_MESSAGES),
    enabledGroups: z.array(z.enum(TOOL_GROUPS)).max(TOOL_GROUPS.length).optional(),
  })
  .strict();

export type TurnRequest = z.infer<typeof turnRequestSchema>;

export const messageChars = (message: CanvasMessage): number =>
  message.role === "assistant"
    ? message.content.length + JSON.stringify(message.toolCalls ?? []).length
    : message.content.length;

export type { ToolGroup };
