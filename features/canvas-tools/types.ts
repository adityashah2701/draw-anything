import type { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import type { ToolErrorInfo } from "./errors";

/**
 * Tools are grouped so a request only carries the schemas it needs. `inspect` is always on; the model
 * (or the server, from the request) enables the rest. A call to a tool outside the enabled groups is
 * refused by the executor, whatever the model wrote.
 */
export const TOOL_GROUPS = ["inspect", "create", "edit", "connect", "arrange", "organize", "document", "generate", "memory"] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

/** What the editor behind a host can do. A tool that needs a capability the host lacks is refused with `unavailable`. */
export interface HostCapabilities {
  history: boolean;
  selection: boolean;
  viewport: boolean;
  save: boolean;
  load: boolean;
  export: boolean;
  confirm: boolean;
  /** Can draw a whole new diagram from a description (the `generate` group). */
  generate: boolean;
  /** Can save and read the board's agent memory (the `memory` group). */
  memory: boolean;
}

export type MemoryKind = "preference" | "correction" | "decision" | "fact";

export interface GenerateRequest {
  description: string;
  diagramType?: string;
}

export interface GenerateOutcome {
  /** The new elements, absolute positions, ids chosen by the generator. */
  elements: DrawingElement[];
  warnings?: string[];
}

export interface ViewportInfo {
  zoom: number;
  pan: { x: number; y: number };
  /** Size of the visible canvas in screen pixels. */
  width: number;
  height: number;
}

export interface DocumentInfo {
  id: string;
  title?: string;
  /** False for a viewer: only inspection works. */
  canEdit: boolean;
}

export interface ExportRequest {
  format: "png" | "svg" | "pdf";
  scale: 1 | 2 | 3;
  transparent: boolean;
  /** Element ids to export; omitted = the whole board. */
  ids?: string[];
}

export interface ExportOutcome {
  filename: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}

export type LoadSource = { kind: "whiteboard"; id: string } | { kind: "content"; content: string };

export interface LoadOutcome {
  /** The elements to bring in, already validated and normalised by the existing saved-content reader. */
  elements: StoredElement[];
  title?: string;
}

/**
 * The only door from a tool to a board. The editor implements it over the live room and controller; tests
 * implement it over a plain list. A tool never reaches state any other way, which is what makes the same
 * tool run against a person's board, a collaborator's edits and a unit test.
 */
export interface CanvasHost {
  readonly capabilities: HostCapabilities;
  /** The board right now (shapes and group records in stacking order), including edits made by anyone else. */
  getStored(): readonly StoredElement[];
  getSelection(): readonly string[];
  getViewport(): ViewportInfo | null;
  getDocument(): DocumentInfo;
  newId(): string;
  /** Measures a shape the way the editor does (text needs a canvas); omitted = the shared estimate. */
  getBounds?: (shape: DrawingElement) => Bounds | null;
  /** One atomic write = one undo step. Resolves once the board reflects it. */
  applyPatch(patch: DocPatch): void | Promise<void>;
  setSelection(ids: string[]): void;
  undo?(): Promise<{ changed: boolean }>;
  redo?(): Promise<{ changed: boolean }>;
  fitView?(bounds: Bounds | null): void;
  save?(): Promise<{ saved: boolean; message?: string }>;
  /** Fetches a document the signed-in user may read, or throws. The host enforces authorisation. */
  load?(source: LoadSource): Promise<LoadOutcome>;
  exportDiagram?(request: ExportRequest): Promise<ExportOutcome>;
  /** Draws a new diagram from a description (a model call on the server) and returns the elements without touching the board. */
  generateDiagram?(request: GenerateRequest): Promise<GenerateOutcome>;
  /** Saves a note to the board's shared agent memory. */
  remember?(entry: { kind: MemoryKind; text: string }): Promise<{ duplicate: boolean }>;
  /** Asks the person at the keyboard; false = declined. Without it, destructive tools fail closed. */
  requestConfirmation?(request: { tool: string; message: string }): Promise<boolean>;
}

export interface ToolLogEvent {
  tool: string;
  callId?: string;
  runId?: string;
  ok: boolean;
  code?: string;
  ms: number;
  created: number;
  updated: number;
  removed: number;
}

export interface ToolLogger {
  (event: ToolLogEvent): void;
}

/** Per-run state shared by the calls of one agent run. */
export interface ToolSession {
  runId: string;
  enabledGroups: Set<ToolGroup>;
  /** Revision of the board after the last call this run made or read; a different one now means someone else edited. */
  lastSeenRevision?: string;
  /** Results by call id, so a retried call is answered, not repeated. */
  replay: Map<string, ToolResult>;
  /** True in tests: destructive tools proceed without a person to ask. */
  autoApproveDestructive?: boolean;
  log?: ToolLogger;
}

export interface ToolEnv {
  host: CanvasHost;
  /** Editor commands over the board as it is at the start of this call. */
  ctx: CommandContext;
  session: ToolSession;
  /** The revision of the board at the start of this call. */
  revision: string;
  /**
   * Asks the person at the keyboard before something destructive happens. Resolves when they approve and
   * throws `confirmation_denied` when they decline or when there is nobody to ask (fail closed).
   */
  confirm(message: string): Promise<void>;
}

/** What a tool body returns; the executor validates the patch, applies it, and adds ids and revision. */
export interface ToolRun {
  /** One line for the model and the activity log: what was done, with counts and names. */
  summary: string;
  data?: Record<string, unknown>;
  patch?: DocPatch | null;
  /** Selection to set after the patch is applied. */
  selection?: string[];
  warnings?: string[];
  /** Elements the call looked at but did not change, and why (locked, unsupported...). */
  skipped?: Array<{ id: string; reason: string }>;
}

export interface ToolResult {
  ok: boolean;
  tool: string;
  summary: string;
  data?: Record<string, unknown>;
  affected: { created: string[]; updated: string[]; removed: string[] };
  /** The board's revision after this call; pass it back as `expected_revision` to guard later edits. */
  revision: string;
  warnings?: string[];
  skipped?: Array<{ id: string; reason: string }>;
  error?: ToolErrorInfo;
  /** True when this is the stored answer to a call id that was already executed. */
  replayed?: boolean;
}

export interface ToolDefinition<Schema extends z.ZodType = z.ZodType> {
  name: string;
  group: ToolGroup;
  /** One or two sentences for the model: what it does and what it changes. */
  description: string;
  input: Schema;
  access: "read" | "write";
  /** Documented as destructive: it asks for confirmation through `env.confirm` and fails closed without a person to ask. */
  destructive?: boolean;
  /** The board must not have changed (by anyone else) since the model last looked. */
  strictRevision?: boolean;
  needs?: Array<keyof HostCapabilities>;
  /** Also usable while any of these groups is on: a follow-up tool that belongs with the work of other groups (fit_frame after moving things). */
  alsoWith?: ToolGroup[];
  run(input: z.infer<Schema>, env: ToolEnv): ToolRun | Promise<ToolRun>;
}

/** Whether a tool may be used with these groups on: its own group, or one it also works with. */
export const toolEnabled = (tool: Pick<ToolDefinition, "group" | "alsoWith">, on: ReadonlySet<ToolGroup>): boolean => on.has(tool.group) || (tool.alsoWith ?? []).some((group) => on.has(group));

export interface ToolCallRequest {
  /** Provider call id; the key for idempotent retries. */
  id?: string;
  name: string;
  args: unknown;
}
