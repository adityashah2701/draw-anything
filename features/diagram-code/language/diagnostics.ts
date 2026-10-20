import type { LineIndex, Span } from "./source";

export type Severity = "error" | "warning";

/**
 * Stable machine-readable codes. Editors, the agent tools and the tests match on these, never on
 * message text.
 */
export type DiagnosticCode =
  | "limit/size"
  | "syntax/missing-name"
  | "syntax/unterminated-string"
  | "syntax/unclosed-properties"
  | "syntax/invalid-name"
  | "syntax/unmatched-close"
  | "syntax/unclosed-block"
  | "syntax/unknown-connector"
  | "syntax/edge-properties"
  | "header/unknown-type"
  | "header/unknown-direction"
  | "property/missing-value"
  | "property/unknown"
  | "property/unsupported"
  | "property/duplicate"
  | "property/invalid-value"
  | "property/out-of-range"
  | "property/not-for-element"
  | "shape/unsupported"
  | "shape/needs-icon"
  | "reference/unknown-kind"
  | "reference/unknown-icon"
  | "node/redeclared"
  | "node/other-parent"
  | "edge/self-loop"
  | "nesting/frame-in-group";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** Offsets into the source. */
  span: Span;
  /** 1-based, where the span starts and ends. */
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  /** A replacement a quick fix could apply to `span`, or a pointer such as "did you mean x". */
  suggestion?: string;
}

export class DiagnosticSink {
  readonly items: Diagnostic[] = [];

  constructor(private readonly index: LineIndex) {}

  add(code: DiagnosticCode, severity: Severity, span: Span, message: string, suggestion?: string): void {
    const start = this.index.positionAt(span.start);
    const end = this.index.positionAt(Math.max(span.end, span.start));
    this.items.push({
      code,
      severity,
      message,
      span: { start: span.start, end: Math.max(span.end, span.start) },
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      ...(suggestion !== undefined ? { suggestion } : {}),
    });
  }

  error(code: DiagnosticCode, span: Span, message: string, suggestion?: string): void {
    this.add(code, "error", span, message, suggestion);
  }

  warn(code: DiagnosticCode, span: Span, message: string, suggestion?: string): void {
    this.add(code, "warning", span, message, suggestion);
  }
}
