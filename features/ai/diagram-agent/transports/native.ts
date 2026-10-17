import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { messageText } from "@/features/ai/server/model-providers";
import type { AgentMessage, ModelTurn, ToolCall, ToolName, ToolSpec, ToolTransport } from "../types";
import { TOOL_PARAM, toNativeMessages } from "./messages";
import { parseTextReply } from "./text-protocol";

/** The one-shot diagram agent's tools. */
export const AGENT_TOOL_SPECS: ToolSpec[] = [
  { name: "search_icons", description: "Find icon ids for technologies or concepts. Pass several at once, comma-separated (e.g. `kafka, postgres, load balancer`): one call answers all of them. Returns ranked ids to use as `icon:`." },
  { name: "check_diagram", description: "Validate diagram code and preview its layout: parse errors with line numbers, connector crossings, longest connector, and design advice. Call before finishing." },
  { name: "finish", description: "Submit the final diagram code. Ends the task." },
];

/** OpenAI-style tool definitions; every tool takes one plain string. */
export const nativeToolDefinitions = (specs: readonly ToolSpec[] = AGENT_TOOL_SPECS) =>
  specs.map(({ name, description }) => ({
    type: "function" as const,
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: { [TOOL_PARAM[name]]: { type: "string" } },
        required: [TOOL_PARAM[name]],
      },
    },
  }));

/**
 * A tool call's argument as one string, whatever shape the model produced: a bare string, the
 * expected parameter, another string-valued key, or something we ignore ("" is a valid answer; the
 * tool reports an empty input instead of the run failing).
 */
export const coerceToolArg = (args: unknown, name: ToolName): string => {
  if (typeof args === "string") {
    try {
      return coerceToolArg(JSON.parse(args), name);
    } catch {
      return args;
    }
  }
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const preferred = record[TOOL_PARAM[name]];
  if (typeof preferred === "string") return preferred;
  const other = Object.values(record).find((v): v is string => typeof v === "string");
  return other ?? "";
};

/** Real function calling through LangChain `bindTools` (OpenAI-compatible providers, Anthropic). */
export const createNativeTransport = (model: BaseChatModel, specs: readonly ToolSpec[] = AGENT_TOOL_SPECS): ToolTransport => {
  const knownNames = new Set<string>(specs.map((s) => s.name));
  const bound = (model as unknown as { bindTools?: (tools: unknown[]) => Pick<BaseChatModel, "invoke"> }).bindTools?.(
    nativeToolDefinitions(specs),
  );
  if (!bound) throw new Error("This model does not support tool calling.");
  return {
    kind: "native",
    async complete(messages: readonly AgentMessage[], options): Promise<ModelTurn> {
      const reply = await bound.invoke(toNativeMessages(messages), options?.signal ? { signal: options.signal } : undefined);
      const shape = reply as {
        tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
        // LangChain parks calls whose arguments were not valid JSON here; the raw text is still a usable argument.
        invalid_tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
      };
      const raw = [...(shape.tool_calls ?? []), ...(shape.invalid_tool_calls ?? [])];
      const toolCalls: ToolCall[] = raw
        .filter((c): c is { id?: string; name: string; args?: unknown } => typeof c.name === "string" && knownNames.has(c.name))
        .map((c) => ({ id: c.id, name: c.name as ToolName, arg: coerceToolArg(c.args, c.name as ToolName) }));
      const text = messageText(reply);
      // Some models answer with a diagram in a fence instead of calling a tool: still usable.
      const parsed = parseTextReply(text);
      return { text: parsed.text, toolCalls, code: parsed.code, truncated: parsed.truncated };
    },
  };
};
