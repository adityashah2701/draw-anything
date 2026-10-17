import { describe, expect, it } from "vitest";
import { resolvePipelineName } from "./pipeline";

describe("resolvePipelineName", () => {
  it("defaults to legacy so nothing changes until the switch is flipped", () => {
    expect(resolvePipelineName({})).toBe("legacy");
    expect(resolvePipelineName({ AI_PIPELINE: "" })).toBe("legacy");
    expect(resolvePipelineName({ AI_PIPELINE: "typo" })).toBe("legacy");
  });
  it("selects the agent only when asked, ignoring case and whitespace", () => {
    expect(resolvePipelineName({ AI_PIPELINE: "agent" })).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: " Agent " })).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: "legacy" })).toBe("legacy");
  });
  it("selects the step-by-step builder only when asked", () => {
    expect(resolvePipelineName({ AI_PIPELINE: "builder" })).toBe("builder");
    expect(resolvePipelineName({ AI_PIPELINE: " BUILDER " })).toBe("builder");
  });
});
