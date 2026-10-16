import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentMessage, ToolCall, ToolName } from "../types";
import { formatToolResult } from "./text-protocol";

/** The single string argument each tool takes, as the name of its native parameter. */
export const TOOL_PARAM: Record<ToolName, string> = {
  search_icons: "query",
  check_diagram: "code",
  finish: "code",
};

let counter = 0;
export const newCallId = () => `call_${(counter += 1).toString(36)}`;

/** Messages for the text protocol: tool traffic becomes ordinary text, which every model accepts. */
export const toTextMessages = (messages: readonly AgentMessage[]): BaseMessage[] =>
  messages.map((m) => {
    switch (m.role) {
      case "system":
        return new SystemMessage(m.content);
      case "user":
        return new HumanMessage(m.content);
      case "assistant": {
        const calls = (m.toolCalls ?? []).map((c) => `<tool name="${c.name}">${c.arg}</tool>`).join("\n");
        return new AIMessage([m.content, calls].filter(Boolean).join("\n"));
      }
      case "tool":
        return new HumanMessage(formatToolResult(m.name, m.content));
    }
  });

/** Messages for native tool calling: assistant calls and tool results keep their ids. */
export const toNativeMessages = (messages: readonly AgentMessage[]): BaseMessage[] => {
  const out: BaseMessage[] = [];
  // Ids assigned to assistant calls that had none, in order, so each tool result can be paired.
  const pending: Array<{ id: string; name: ToolName }> = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "user") {
      out.push(m.role === "system" ? new SystemMessage(m.content) : new HumanMessage(m.content));
    } else if (m.role === "assistant") {
      pending.length = 0;
      const calls = (m.toolCalls ?? []).map((c) => {
        const id = c.id ?? newCallId();
        pending.push({ id, name: c.name });
        return { id, name: c.name, args: { [TOOL_PARAM[c.name]]: c.arg }, type: "tool_call" as const };
      });
      out.push(new AIMessage({ content: m.content, tool_calls: calls }));
    } else {
      const { callId, name, content } = m;
      const index = pending.findIndex((p) => p.id === callId || (callId === undefined && p.name === name));
      const id = index >= 0 ? pending.splice(index, 1)[0].id : (callId ?? newCallId());
      out.push(new ToolMessage({ content, tool_call_id: id, name }));
    }
  }
  return out;
};

export type { ToolCall };
