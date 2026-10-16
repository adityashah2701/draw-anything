export const TOOL_NAMES = ["search_icons", "check_diagram", "finish"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolCall {
  /** Provider call id (native tool calling); absent in the text protocol. */
  id?: string;
  name: ToolName;
  /** Every tool takes one plain string: a search query or diagram code. */
  arg: string;
}

/** What one model reply means, whatever transport produced it. */
export interface ModelTurn {
  /** Prose and anything else the model said. */
  text: string;
  toolCalls: ToolCall[];
  /** A diagram in a code fence, outside of any tool call. */
  code?: string;
  /** The reply was cut off mid-block (unterminated fence or tool tag). */
  truncated?: boolean;
}

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  /** An earlier model reply; `toolCalls` keeps native calls so their results can reference them. */
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  /** A tool's answer. `callId` ties it to a native tool call when there was one. */
  | { role: "tool"; name: ToolName; content: string; callId?: string };

/** One model round trip. Implementations: native tool calling, and the text protocol. */
export interface ToolTransport {
  readonly kind: "native" | "text";
  complete(messages: readonly AgentMessage[], options?: { signal?: AbortSignal }): Promise<ModelTurn>;
}
