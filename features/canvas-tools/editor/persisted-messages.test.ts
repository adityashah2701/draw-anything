import { describe, expect, it } from "vitest";
import { fromRows, toRow } from "./persisted-messages";
import type { AgentUiMessage } from "./use-canvas-agent";

const lines: AgentUiMessage[] = [
  { id: "1", kind: "user", text: "draw an API" },
  { id: "2", kind: "assistant", text: "On it." },
  { id: "3", kind: "tool", tool: "generate_diagram", ok: true, summary: "Generated a diagram", changed: 5, skipped: 0, warnings: ["w"], code: undefined },
  { id: "4", kind: "tool", tool: "create_shape", ok: false, summary: "no", changed: 0, skipped: 1, warnings: [], code: "locked" },
  { id: "5", kind: "status", tone: "warn", text: "Stopped." },
];

describe("stored conversation rows", () => {
  it("round-trips a transcript", () => {
    const back = fromRows(lines.map((line, i) => ({ id: `r${i}`, ...toRow(line) })));
    const strip = (list: AgentUiMessage[]) => list.map((m) => JSON.parse(JSON.stringify({ ...m, id: undefined })));
    expect(strip(back)).toEqual(strip(lines));
    expect(back.map((m) => m.id)).toEqual(["saved-r0", "saved-r1", "saved-r2", "saved-r3", "saved-r4"]);
  });

  it("skips rows that do not look right instead of trusting them", () => {
    const back = fromRows([
      { id: "a", role: "tool", content: "x", ui: "nonsense" },
      { id: "b", role: "status", content: "fine", ui: { tone: "explode" } },
      { id: "c", role: "tool", content: "ok", ui: { tool: "undo_action", ok: true, warnings: [1, "w"] } },
    ]);
    expect(back).toEqual([
      { id: "saved-b", kind: "status", text: "fine", tone: "ok" },
      { id: "saved-c", kind: "tool", tool: "undo_action", ok: true, summary: "ok", changed: 0, skipped: 0, warnings: ["w"] },
    ]);
  });
});
