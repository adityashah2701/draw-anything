import { describe, expect, it } from "vitest";
import { exportFilename } from "./deliver";

describe("exportFilename", () => {
  it("keeps letters and digits from any script", () => {
    expect(exportFilename("Plan 2026: Q3/Q4", "png")).toBe("Plan-2026-Q3-Q4.png");
    expect(exportFilename("設計図 v2", "svg")).toBe("設計図-v2.svg");
  });
  it("never produces an empty or path-like name", () => {
    expect(exportFilename("", "pdf")).toBe("whiteboard.pdf");
    expect(exportFilename(undefined, "pdf")).toBe("whiteboard.pdf");
    expect(exportFilename("../../etc/passwd", "png")).toBe("etc-passwd.png");
    expect(exportFilename('a"b<c>', "png")).toBe("a-b-c.png");
  });
  it("caps the length", () => {
    expect(exportFilename("x".repeat(200), "png").length).toBeLessThanOrEqual(64);
  });
});
