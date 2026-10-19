import type { ToolGroup } from "../types";

const RULES: Array<[ToolGroup[], RegExp]> = [
  [["create", "connect"], /\b(add|create|make|draw|build|design|generate|insert|new|duplicate|copy|clone|import)\b/i],
  [["edit"], /\b(change|rename|recolou?r|colou?r|fill|stroke|opacity|transparent|rotate|resize|size|bigger|smaller|move|shift|nudge|delete|remove|erase|lock|unlock|hide|show|text|label|icon|font|bold|italic|update|replace|swap|front|back|style)\b/i],
  [["connect"], /\b(connect|connector|arrow|link|edge|reroute|route|disconnect|line between|join)\b/i],
  [["arrange"], /\b(align|distribute|space|spacing|gap|layout|tidy|clean( up)?|arrange|organi[sz]e|grid|row|column|stack|even(ly)?|equal|line up|neat)\b|\blay\b[^.]*\bout\b/i],
  [["organize"], /\b(group|ungroup|frame|section|container|bundle)\b/i],
  [["document"], /\b(undo|redo|clear|empty|export|download|save|load|open|validate|repair|fix)\b/i],
];

/**
 * Groups worth switching on before the first model turn, from the words of the request, so the common case
 * needs no `enable_tools` round trip. A guess only saves a step: the model can enable more, and a tool outside
 * the enabled groups is always refused by the executor.
 */
export const suggestGroups = (prompt: string): ToolGroup[] => {
  const on = new Set<ToolGroup>();
  for (const [groups, pattern] of RULES) if (pattern.test(prompt)) groups.forEach((group) => on.add(group));
  return [...on];
};
