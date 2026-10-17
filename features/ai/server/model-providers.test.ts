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

describe("NVIDIA Nemotron provider", () => {
  it("defaults to the vision-capable Nemotron model and needs NVIDIA_API_KEY", () => {
    expect(getAIModelProviderConfig("nvidia")).toMatchObject({ provider: "nvidia", modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b" });
    expect(getAIModelProviderConfig("nvidia", { vision: true }).modelName).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    vi.stubEnv("NVIDIA_API_KEY", "");
    expect(() => createAIChatModel("nvidia")).toThrow(MissingAIProviderKeyError);
    vi.unstubAllEnvs();
  });

  it("is listed as enabled only when its key is set", async () => {
    const { getEnabledProviders } = await import("./request-guard");
    expect(getEnabledProviders({})).not.toContain("nvidia");
    expect(getEnabledProviders({ NVIDIA_API_KEY: "k" })).toContain("nvidia");
  });

  it("answers from the fallback model on a rate limit, also after bindTools, but not on an auth error", async () => {
    const { withNvidiaFallback } = await import("./model-providers");
    const make = (result: string | Error) => {
      const invoke = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
      const self = { invoke, bindTools: () => self };
      return self;
    };
    const limited = make(new Error("429 Too Many Requests"));
    const backup = make("backup");
    const model = withNvidiaFallback(limited as never, backup as never);
    await expect(model.invoke("hi" as never)).resolves.toBe("backup");
    await expect((model as never as { bindTools: (t: never[]) => typeof model }).bindTools([]).invoke("hi" as never)).resolves.toBe("backup");

    const denied = make(new Error("401 Unauthorized"));
    await expect(withNvidiaFallback(denied as never, backup as never).invoke("hi" as never)).rejects.toThrow("401");
  });
});
