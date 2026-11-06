/**
 * The diagram code a reply has written so far, for the live preview while the model is still writing: the fenced
 * block's complete lines, with any block still open closed, so every prefix of a good diagram is itself drawable.
 * Null before the block starts. Pure.
 */
export const codeSoFar = (text: string): { code: string; lines: number; closed: boolean } | null => {
  const open = /```[^\n]*\n/.exec(text);
  if (!open) return null;
  const rest = text.slice(open.index + open[0].length);
  const end = rest.indexOf("```");
  const body = end === -1 ? rest.slice(0, rest.lastIndexOf("\n") + 1) : rest.slice(0, end);
  const lines = body.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//"));
  let depth = 0;
  for (const line of lines) depth = Math.max(0, depth + (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0));
  return { code: [...lines, ...Array(depth).fill("}")].join("\n"), lines: lines.length, closed: end !== -1 };
};
