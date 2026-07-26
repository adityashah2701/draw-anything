import { describe, expect, it } from "vitest";
import { toV1CompatibilityEvents } from "@/features/ai/server/sse";

describe("AI SSE compatibility", () => {
  it("maps v2 phase events to v1 thought events", () => {
    expect(
      toV1CompatibilityEvents({
        type: "phase.completed",
        frameId: "frame",
        phase: "architecturePlanner",
        message: "Planning complete",
      }),
    ).toEqual([{ type: "thought", message: "Planning complete" }]);
  });

  it("maps v2 architecture events to v1 thought events", () => {
    expect(
      toV1CompatibilityEvents({
        type: "infrastructure.expanded",
        frameId: "frame",
        addedNodeIds: ["waf", "cdn"],
        infrastructure: ["waf", "cdn"],
      }),
    ).toEqual([
      {
        type: "thought",
        message: "Expanded infrastructure with 2 supporting components",
      },
    ]);
  });
});
