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

describe("stored rows for images and thinking", () => {
  it("keeps only how many images were attached, never pixels", () => {
    const row = toRow({ id: "u", kind: "user", text: "copy this", images: 2, previews: ["data:image/png;base64,AAAA"] });
    expect(row).toEqual({ role: "user", content: "copy this", ui: { images: 2 } });
    expect(JSON.stringify(row)).not.toContain("base64");
    expect(fromRows([{ id: "a", ...row }])).toEqual([{ id: "saved-a", kind: "user", text: "copy this", images: 2 }]);
    expect(fromRows([{ id: "b", role: "user", content: "x", ui: { images: 9999 } }])[0]).toMatchObject({ images: 4 });
    expect(fromRows([{ id: "c", role: "user", content: "x", ui: { images: "lots" } }])[0]).not.toHaveProperty("images");
  });

  it("round-trips thinking as a status row the older panel would also read, capped", () => {
    const row = toRow({ id: "t", kind: "thinking", text: "plan".repeat(2000), source: "generator" });
    expect(row.role).toBe("status");
    expect(row.content.length).toBe(3_000);
    expect(fromRows([{ id: "t1", ...row }])[0]).toMatchObject({ kind: "thinking", source: "generator" });
    expect(fromRows([{ id: "t2", role: "status", content: "hm", ui: { kind: "thinking", source: "weird" } }])[0]).toMatchObject({ kind: "thinking", source: "model" });
  });
});
