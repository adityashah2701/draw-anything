import type { Diagnostic } from "./diagnostics";
import type { Span } from "./source";

/** A node, group or frame name: bare words or a quoted string. */
export interface NameNode {
  /** Unquoted text. */
  text: string;
  quoted: boolean;
  span: Span;
}

export interface PropEntry {
  /** Lower-cased key; `keyText` keeps the spelling. */
  key: string;
  keyText: string;
  keySpan: Span;
  /** Unquoted value; empty when none was written. */
  value: string;
  /** Span of the value as written (including quotes); empty span right after the colon when missing. */
  valueSpan: Span;
  quoted: boolean;
  hasColon: boolean;
  /** The whole `key: value` entry, without the separating comma. */
  span: Span;
}

export interface PropList {
  entries: PropEntry[];
  /** From `[` to `]` (or the end of the line when the bracket is never closed). */
  span: Span;
  /** False when the closing `]` is missing; the entries read so far are still here. */
  closed: boolean;
}

/** `Name [props]` */
export interface Ref {
  name: NameNode;
  props?: PropList;
  span: Span;
}

export type ConnectorSymbol = "<-->" | "-->" | "<>" | "--" | ">" | "<" | "-";

export interface ConnectorToken {
  symbol: ConnectorSymbol;
  span: Span;
}

interface StatementBase {
  /** 1-based line the statement starts on. */
  line: number;
  span: Span;
  /** A `//` comment after the statement on the same line. */
  comment?: Span;
}

export interface DirectiveStatement extends StatementBase {
  kind: "directive";
  key: "title" | "type" | "direction";
  keySpan: Span;
  value: string;
  valueSpan: Span;
}

export interface DeclareStatement extends StatementBase {
  kind: "declare";
  refs: Ref[];
}

export interface ConnectStatement extends StatementBase {
  kind: "connect";
  /** One list of endpoints between each pair of connectors: `A, B > C` is [[A, B], [C]]. */
  endpoints: Ref[][];
  connectors: ConnectorToken[];
  label?: { text: string; span: Span };
  /** The `[color: ..., from: ..., to: ...]` after the label. */
  props?: PropList;
}

export interface OpenStatement extends StatementBase {
  kind: "open";
  block: "group" | "frame";
  /** Span of the `group` / `frame` keyword when it was written. */
  keyword?: Span;
  ref: Ref;
}

export interface CloseStatement extends StatementBase {
  kind: "close";
}

export type Statement = DirectiveStatement | DeclareStatement | ConnectStatement | OpenStatement | CloseStatement;

export type TokenKind =
  | "keyword"
  | "name"
  | "string"
  | "property"
  | "value"
  | "number"
  | "connector"
  | "label"
  | "punctuation"
  | "comment"
  | "error";

export interface Token {
  kind: TokenKind;
  span: Span;
}

export interface CommentNode {
  span: Span;
  line: number;
  /** True when nothing but the comment is on the line. */
  standalone: boolean;
}

export interface DocumentNode {
  source: string;
  statements: Statement[];
  comments: CommentNode[];
  /** Highlighting classes for the parts of every line the parser recognised, in source order. */
  tokens: Token[];
  /** Syntax diagnostics only; the resolver adds the semantic ones. */
  diagnostics: Diagnostic[];
  /** True when the input was refused as too large and nothing was parsed. */
  refused: boolean;
}
