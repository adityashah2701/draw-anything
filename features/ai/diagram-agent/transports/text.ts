import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { messageText } from "@/features/ai/server/model-providers";
import type { AgentMessage, ModelTurn, ToolTransport } from "../types";
import { toTextMessages } from "./messages";
import { parseTextReply } from "./text-protocol";

/** What the text transport needs from a model: `invoke`. Gemini's adapter satisfies it too. */
export type InvokableModel = Pick<BaseChatModel, "invoke">;

/** Tools and diagrams travel as plain text, so any chat model works, with or without tool calling. */
export const createTextTransport = (model: InvokableModel): ToolTransport => ({
  kind: "text",
  async complete(messages: readonly AgentMessage[], options): Promise<ModelTurn> {
    const reply = await model.invoke(toTextMessages(messages), options?.signal ? { signal: options.signal } : undefined);
    return parseTextReply(messageText(reply));
  },
});
