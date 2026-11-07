// Types for canvas agent UI messages and confirmations

export type AgentUiMessage =
  /** `images` counts the pictures attached; `previews` (this tab only, while the run is local) are small data URLs. Pixels are never stored. */
  | { id: string; kind: "user"; text: string; images?: number; previews?: string[] }
  /** The model's or generator's own reasoning: secondary to the answer, collapsible. */
  | { id: string; kind: "thinking"; text: string; source: "model" | "generator" }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; tool: string; ok: boolean; summary: string; changed: number; skipped: number; warnings: string[]; code?: string }
  | { id: string; kind: "status"; text: string; tone: "ok" | "warn" | "error" };

export interface PendingConfirmation {
  tool: string;
  message: string;
}

