import type { Token, TokenKind } from "../ast";
import type { Diagnostic, Severity } from "../diagnostics";

export interface Segment {
  text: string;
  kind?: TokenKind;
  /** The worst diagnostic covering this text. */
  severity?: Severity;
}

/**
 * The source cut into runs that share one token class and one diagnostic severity, covering every
 * character exactly once (so the pieces concatenate to the source). The editor paints these.
 */
export const toSegments = (source: string, tokens: readonly Token[], diagnostics: readonly Diagnostic[]): Segment[] => {
  const cuts = new Set<number>([0, source.length]);
  for (const token of tokens) {
    cuts.add(Math.min(token.span.start, source.length));
    cuts.add(Math.min(token.span.end, source.length));
  }
  for (const d of diagnostics) {
    cuts.add(Math.min(d.span.start, source.length));
    cuts.add(Math.min(Math.max(d.span.end, d.span.start), source.length));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let t = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    while (t < tokens.length && tokens[t].span.end <= start) t += 1;
    const token = t < tokens.length && tokens[t].span.start <= start && tokens[t].span.end >= end ? tokens[t] : undefined;
    let severity: Severity | undefined;
    for (const d of diagnostics) {
      const dEnd = Math.max(d.span.end, d.span.start + 1);
      if (d.span.start <= start && dEnd >= end && severity !== "error") severity = d.severity;
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === token?.kind && last.severity === severity) last.text += source.slice(start, end);
    else segments.push({ text: source.slice(start, end), kind: token?.kind, severity });
  }
  return segments;
};
