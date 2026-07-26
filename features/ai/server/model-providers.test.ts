import { describe, expect, it, vi } from "vitest";
import {
  createAIChatModel,
  getAIModelProviderConfig,
  MissingAIProviderKeyError,
} from "@/features/ai/server/model-providers";

describe("AI model providers", () => {
  it("uses Gemini as the default provider", () => {
    expect(getAIModelProviderConfig().provider).toBe("gemini");
  });

  it("throws a clear missing-key error", () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    expect(() => createAIChatModel("gemini")).toThrow(MissingAIProviderKeyError);

    vi.unstubAllEnvs();
  });
});
