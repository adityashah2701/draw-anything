import type { AgentMessage, ModelTurn, ToolTransport } from "../types";

export type BuilderToolName = "add" | "adjust" | "view" | "finish" | "search_icons";

export const call = (name: BuilderToolName, arg = ""): ModelTurn["toolCalls"][number] => ({ name, arg });
export const turn = (...toolCalls: ModelTurn["toolCalls"]): ModelTurn => ({ text: "", toolCalls });

/** A model that plays `script` in order (the last entry repeats) and records what it was shown each turn. */
export const scripted = (script: Array<ModelTurn | ((shown: string) => ModelTurn)>) => {
  const shown: string[] = [];
  const images: Array<string[] | undefined> = [];
  let i = 0;
  const transport: ToolTransport = {
    kind: "native",
    async complete(messages: readonly AgentMessage[]) {
      const user = messages[1] as Extract<AgentMessage, { role: "user" }>;
      shown.push(user.content);
      images.push(user.images);
      const next = script[Math.min(i, script.length - 1)];
      i += 1;
      return typeof next === "function" ? next(user.content) : next;
    },
  };
  return { transport, shown, images, turns: () => i };
};
