import { TOOL_NAMES, type ModelTurn, type ToolCall, type ToolName } from "../types";

const TOOL_BY_LOWER = new Map<string, ToolName>(TOOL_NAMES.map((n) => [n.toLowerCase(), n]));

const normalizeToolName = (raw: string): ToolName | undefined => TOOL_BY_LOWER.get(raw.trim().toLowerCase().replace(/[\s-]+/g, "_"));

/** A fenced block's contents, without the fence lines. */
const unfence = (text: string): string => {
  const m = text.match(/^\s*```[^\n`]*\n([\s\S]*?)(?:\n?```)?\s*$/);
  return (m ? m[1] : text).trim();
};

const FENCE = /```[^\n`]*\n([\s\S]*?)```/g;
const TOOL_TAG = /<tool\b([^>]*)>([\s\S]*?)<\/tool\s*>/gi;
const TOOL_OPEN_UNTERMINATED = /<tool\b([^>]*)>([\s\S]*)$/i;

const nameFromAttributes = (attrs: string): ToolName | undefined => {
  const m = attrs.match(/name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return m ? normalizeToolName(m[1] ?? m[2] ?? m[3] ?? "") : undefined;
};

/**
 * Reads a model reply written for the text protocol:
 *   <tool name="search_icons">kafka</tool>      a tool call (argument = inner text, fence optional)
 *   ```diagram ... ```                           a diagram (the last fence outside tool tags wins)
 * Tolerant by design: wrong case, extra attributes, prose around, unterminated blocks (a reply cut
 * off by the token limit) and unknown tool names are all handled. It never throws.
 */
export const parseTextReply = (reply: string): ModelTurn => {
  const toolCalls: ToolCall[] = [];
  let truncated = false;

  let rest = reply.replace(TOOL_TAG, (_whole, attrs: string, inner: string) => {
    const name = nameFromAttributes(attrs);
    if (name) toolCalls.push({ name, arg: unfence(inner) });
    return "\n";
  });

  const open = rest.match(TOOL_OPEN_UNTERMINATED);
  if (open) {
    const name = nameFromAttributes(open[1]);
    if (name) {
      toolCalls.push({ name, arg: unfence(open[2]) });
      truncated = true;
    }
    rest = rest.slice(0, open.index);
  }

  let code: string | undefined;
  for (const m of rest.matchAll(FENCE)) code = m[1].trim();
  if (code === undefined) {
    // An opening fence that never closed: the reply was cut off inside the diagram.
    const lastOpen = rest.lastIndexOf("```");
    if (lastOpen !== -1 && (rest.slice(0, lastOpen).match(/```/g)?.length ?? 0) % 2 === 0) {
      const body = rest.slice(lastOpen).replace(/^```[^\n`]*\n?/, "").trim();
      if (body) {
        code = body;
        truncated = true;
      }
    }
  }
  return { text: rest.replace(FENCE, "").trim(), toolCalls, code: code || undefined, truncated: truncated || undefined };
};

/** How a tool result is shown to the model in the text protocol. */
export const formatToolResult = (name: ToolName, content: string) => `Result of ${name}:\n${content}`;

export const TEXT_PROTOCOL_INSTRUCTIONS = [
  "You can call tools. To call one, write it on its own like this (one or more per reply):",
  '<tool name="search_icons">kafka</tool>',
  '<tool name="check_diagram">',
  "```diagram",
  "...your diagram code...",
  "```",
  "</tool>",
  '<tool name="finish">',
  "```diagram",
  "...final diagram code...",
  "```",
  "</tool>",
  "Wait for the tool results before continuing. Always end by calling finish with the complete diagram.",
].join("\n");
