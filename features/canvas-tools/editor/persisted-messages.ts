import type { AgentUiMessage } from "./use-canvas-agent";

export interface StoredRow {
  role: "user" | "assistant" | "tool" | "status";
  content: string;
  ui?: unknown;
}

export interface LoadedRow extends StoredRow {
  id: string;
}

/** What is kept of a run's reasoning in the shared conversation: the same text the panel shows, capped. */
export const MAX_STORED_THINKING = 3_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A transcript line as the row the conversation table stores. */
export const toRow = (message: AgentUiMessage): StoredRow => {
  switch (message.kind) {
    case "user":
      // Only how many pictures were attached is kept: the pixels were for this run and are not stored with the board.
      return { role: "user", content: message.text, ...(message.images ? { ui: { images: message.images } } : {}) };
    case "assistant":
      return { role: "assistant", content: message.text };
    case "thinking":
      return { role: "status", content: message.text.slice(0, MAX_STORED_THINKING), ui: { kind: "thinking", source: message.source } };
    case "status":
      return { role: "status", content: message.text, ui: { tone: message.tone } };
    case "tool":
      return { role: "tool", content: message.summary, ui: { tool: message.tool, ok: message.ok, changed: message.changed, skipped: message.skipped, warnings: message.warnings.slice(0, 4), code: message.code } };
  }
};

/** Stored rows back into transcript lines; a row that does not look right is skipped, never trusted. */
export const fromRows = (rows: readonly LoadedRow[]): AgentUiMessage[] => {
  const out: AgentUiMessage[] = [];
  for (const row of rows) {
    const id = `saved-${row.id}`;
    const ui = isRecord(row.ui) ? row.ui : {};
    if (row.role === "user") out.push({ id, kind: "user", text: row.content, ...(typeof ui.images === "number" && ui.images > 0 ? { images: Math.min(Math.floor(ui.images), 4) } : {}) });
    else if (row.role === "assistant") out.push({ id, kind: "assistant", text: row.content });
    else if (row.role === "status" && ui.kind === "thinking") out.push({ id, kind: "thinking", text: row.content, source: ui.source === "generator" ? "generator" : "model" });
    else if (row.role === "status") out.push({ id, kind: "status", text: row.content, tone: ui.tone === "warn" || ui.tone === "error" ? ui.tone : "ok" });
    else if (typeof ui.tool === "string")
      out.push({
        id,
        kind: "tool",
        tool: ui.tool,
        ok: ui.ok === true,
        summary: row.content,
        changed: typeof ui.changed === "number" ? ui.changed : 0,
        skipped: typeof ui.skipped === "number" ? ui.skipped : 0,
        warnings: Array.isArray(ui.warnings) ? ui.warnings.filter((w): w is string => typeof w === "string") : [],
        ...(typeof ui.code === "string" ? { code: ui.code } : {}),
      });
  }
  return out;
};
