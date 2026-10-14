import { describe, expect, it } from "vitest";
import { parseSavedContent } from "./saved-content";

describe("parseSavedContent", () => {
  it.each([undefined, null, "", "   "])("treats %j as empty", (value) => {
    expect(parseSavedContent(value)).toEqual({ status: "empty" });
  });

  it("reads elements and keeps the rest of the snapshot", () => {
    const content = JSON.stringify({
      elements: [{ id: "a" }, { id: "b" }],
      canvasSettings: { zoom: 2, panOffset: { x: 1, y: 2 }, showGrid: true },
    });
    const result = parseSavedContent(content);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.elements).toHaveLength(2);
      expect(result.data.canvasSettings?.zoom).toBe(2);
    }
  });

  it("treats a snapshot with no elements key as empty (a new board)", () => {
    expect(parseSavedContent(JSON.stringify({ canvasSettings: {} }))).toEqual({
      status: "empty",
    });
  });

  it.each(["{nope", "null", "[1,2]", '"text"', '{"elements": "x"}', '{"elements": {}}'])(
    "reports unreadable content %s as corrupt, never as empty",
    (content) => {
      expect(parseSavedContent(content)).toEqual({ status: "corrupt" });
    },
  );
});
