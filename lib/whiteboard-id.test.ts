import { describe, expect, it } from "vitest";
import { isPlausibleWhiteboardId } from "./whiteboard-id";

describe("isPlausibleWhiteboardId", () => {
  it("accepts Convex-shaped ids (31-37 base32 chars)", () => {
    for (const length of [31, 32, 34, 37]) {
      expect(isPlausibleWhiteboardId("k57abcdefghjkmnpqrstvwxyz0123456789".slice(0, length))).toBe(true);
    }
    expect(isPlausibleWhiteboardId("jd7x2m9q4n8r5t6v3w1y0z7b2c4d6f8h")).toBe(true);
  });

  it("accepts the full margin and either case, so a real id is never rejected", () => {
    expect(isPlausibleWhiteboardId("a".repeat(16))).toBe(true);
    expect(isPlausibleWhiteboardId("a".repeat(64))).toBe(true);
    expect(isPlausibleWhiteboardId("JD7X2M9Q4N8R5T6V3W1Y0Z7B2C4D6F8H")).toBe(true);
  });

  it("rejects the reproduced crash input and other junk", () => {
    expect(isPlausibleWhiteboardId("abc123")).toBe(false);
    expect(isPlausibleWhiteboardId("")).toBe(false);
    expect(isPlausibleWhiteboardId("a".repeat(15))).toBe(false);
    expect(isPlausibleWhiteboardId("a".repeat(65))).toBe(false);
    expect(isPlausibleWhiteboardId("../../etc/passwd/aaaaaaaaaaaa")).toBe(false);
    expect(isPlausibleWhiteboardId("jd7x2m9q4n8r5t6v3w1y0z7b2c4d6f8h%00")).toBe(false);
    expect(isPlausibleWhiteboardId("jd7x2m9q4n8r5t6v-3w1y0z7b2c4d6f8h")).toBe(false);
    expect(isPlausibleWhiteboardId(" jd7x2m9q4n8r5t6v3w1y0z7b2c4d6f8h")).toBe(false);
    expect(isPlausibleWhiteboardId("jd7x2m9q4n8r5t6v3w1y0z7b2c4d6f8h\n")).toBe(false);
  });

  it("rejects non-strings (e.g. a catch-all param array or undefined)", () => {
    expect(isPlausibleWhiteboardId(undefined)).toBe(false);
    expect(isPlausibleWhiteboardId(null)).toBe(false);
    expect(isPlausibleWhiteboardId(["jd7x2m9q4n8r5t6v3w1y0z7b2c4d6f8h"])).toBe(false);
    expect(isPlausibleWhiteboardId(123456789012345678)).toBe(false);
  });
});
