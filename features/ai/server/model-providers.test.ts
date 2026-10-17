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

describe("Gemini adapter images", () => {
  it("sends a data-URL image as an inline part next to the text, and plain text as before", async () => {
    const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");
    const { toGenAIMessages } = await import("./model-providers");
    const { systemInstruction, contents } = toGenAIMessages([
      new SystemMessage("sys"),
      new HumanMessage({ content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] }),
      new HumanMessage("plain"),
    ]);
    expect(systemInstruction).toBe("sys");
    expect(contents[0].parts).toEqual([{ text: "look" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }]);
    expect(contents[1].parts).toEqual([{ text: "plain" }]);
  });

  it("ignores an image that is not a data URL instead of fetching it", async () => {
    const { HumanMessage } = await import("@langchain/core/messages");
    const { toGenAIMessages } = await import("./model-providers");
    const { contents } = toGenAIMessages([new HumanMessage({ content: [{ type: "text", text: "x" }, { type: "image_url", image_url: { url: "https://example.com/a.png" } }] })]);
    expect(contents[0].parts).toEqual([{ text: "x" }]);
  });
});
