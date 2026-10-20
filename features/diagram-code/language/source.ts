/** Half-open range of character offsets into the source text. */
export interface Span {
  start: number;
  end: number;
}

/** 1-based line and column, as editors show them. */
export interface Position {
  line: number;
  column: number;
}

/** Converts offsets to line/column. Built once per source; lookups are a binary search. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(readonly source: string) {
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === "\n") this.starts.push(i + 1);
    }
  }

  get lineCount(): number {
    return this.starts.length;
  }

  /** Offset where a 1-based line begins (clamped to the text). */
  lineStart(line: number): number {
    return this.starts[Math.min(Math.max(line, 1), this.starts.length) - 1];
  }

  positionAt(offset: number): Position {
    const at = Math.min(Math.max(offset, 0), this.source.length);
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid] <= at) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: at - this.starts[low] + 1 };
  }
}

export const spanOf = (start: number, end: number): Span => ({ start, end: Math.max(start, end) });

export const textOf = (source: string, span: Span): string => source.slice(span.start, span.end);

/** The span with leading and trailing whitespace removed. */
export const trimSpan = (source: string, span: Span): Span => {
  let { start, end } = span;
  while (start < end && /\s/.test(source[start])) start += 1;
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  return { start, end };
};

export const contains = (span: Span, offset: number): boolean => offset >= span.start && offset <= span.end;
