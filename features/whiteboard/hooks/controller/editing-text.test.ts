import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { resolveTextCommit, withTextFormat } from "./editing-text";

const text = (id: string, t: string) => ({ id, type: "text", points: [{ x: 0, y: 0 }], text: t }) as DrawingElement;
const format = { fontSize: 20, fontWeight: "700", fontStyle: "italic" };

describe("resolveTextCommit", () => {
  it("adds a new element with trimmed text and the chosen format", () => {
    const out = resolveTextCommit({ editing: text("t", "TEXT"), isNew: true, text: "  hello ", format, stored: undefined });
    expect(out).toMatchObject({ kind: "add", element: { id: "t", text: "hello", fontSize: 20, fontWeight: "700", fontStyle: "italic" } });
  });

  it("drops a new element left empty", () => {
    expect(resolveTextCommit({ editing: text("t", "TEXT"), isNew: true, text: "   ", format, stored: undefined })).toEqual({ kind: "none" });
  });

  it("updates an existing element from its stored copy, not the editor snapshot", () => {
    const stored = { ...text("t", "old"), color: "#f00" } as DrawingElement;
    const out = resolveTextCommit({ editing: text("t", "old"), isNew: false, text: "new", format, stored });
    expect(out).toMatchObject({ kind: "update", element: { id: "t", text: "new", color: "#f00" } });
  });

  it("falls back to the editor snapshot when the element is gone from the board", () => {
    const out = resolveTextCommit({ editing: text("t", "old"), isNew: false, text: "new", format, stored: undefined });
    expect(out).toMatchObject({ kind: "update", element: { id: "t", text: "new" } });
  });

  it("deletes an existing element whose text was cleared", () => {
    expect(resolveTextCommit({ editing: text("t", "old"), isNew: false, text: "", format, stored: text("t", "old") })).toEqual({ kind: "delete", id: "t" });
  });
});

describe("withTextFormat", () => {
  it("copies only the three format fields", () => {
    const out = withTextFormat(text("t", "a"), "b", { ...format, extra: 1 } as never);
    expect(out).toMatchObject({ text: "b", fontSize: 20, fontWeight: "700", fontStyle: "italic" });
    expect(out).not.toHaveProperty("extra");
  });
});
