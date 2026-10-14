/**
 * Pull a JSON object out of free-form model text: unwraps a ```json fence and
 * takes the outermost {...}. Returns null when nothing parses.
 */
export const extractJsonFromText = (text: string): Record<string, unknown> | null => {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const raw = codeBlockMatch ? codeBlockMatch[1] : text;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
