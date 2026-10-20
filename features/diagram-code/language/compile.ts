import type { DocumentNode, Token } from "./ast";
import type { Diagnostic } from "./diagnostics";
import type { DiagramIR, SymbolReference } from "./ir";
import { parseDocument } from "./parser";
import { resolveDocument } from "./resolve";

export interface CompiledCode {
  /** The syntax tree with source ranges; formatter and editor tooling read this. */
  document: DocumentNode;
  /** The validated diagram. Always present, even for broken code: it holds what was understood. */
  ir: DiagramIR;
  /** Syntax and semantic diagnostics together, in source order. */
  diagnostics: Diagnostic[];
  references: SymbolReference[];
  tokens: Token[];
  /** False when any diagnostic is an error: such code must never be applied to the canvas. */
  valid: boolean;
}

/** Source text to a validated diagram: lex and parse, then resolve. Never throws. */
export const compileDiagramCode = (source: string): CompiledCode => {
  const document = parseDocument(source);
  const { ir, diagnostics: semantic, references } = resolveDocument(document);
  const diagnostics = [...document.diagnostics, ...semantic].sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  return { document, ir, diagnostics, references, tokens: document.tokens, valid: !diagnostics.some((d) => d.severity === "error") };
};
