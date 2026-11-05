import { describe, expect, it } from "vitest";
import { resolvePipelineName } from "./pipeline";

describe("resolvePipelineName", () => {
  it("defaults to the one-shot agent, including for unknown or retired values", () => {
    expect(resolvePipelineName({})).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: "" })).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: "typo" })).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: "legacy" })).toBe("agent");
    expect(resolvePipelineName({ AI_PIPELINE: " Agent " })).toBe("agent");
  });
  it("selects the step-by-step builder only when asked, ignoring case and whitespace", () => {
    expect(resolvePipelineName({ AI_PIPELINE: "builder" })).toBe("builder");
    expect(resolvePipelineName({ AI_PIPELINE: " BUILDER " })).toBe("builder");
  });
});
