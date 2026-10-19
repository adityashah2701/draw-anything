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

  it("configures unbounded thinking by default and respects explicit overrides", async () => {
    const { nvidiaThinking } = await import("./model-providers");
    vi.stubEnv("NVIDIA_ENABLE_THINKING", "");
    vi.stubEnv("NVIDIA_REASONING_BUDGET", "");
    expect(nvidiaThinking()).toEqual({ enable_thinking: true });

    vi.stubEnv("NVIDIA_ENABLE_THINKING", "0");
    expect(nvidiaThinking()).toEqual({ enable_thinking: false });

    vi.stubEnv("NVIDIA_ENABLE_THINKING", "1");
    vi.stubEnv("NVIDIA_REASONING_BUDGET", "4096");
    expect(nvidiaThinking()).toEqual({ enable_thinking: true, reasoning_budget: 4096 });
    vi.unstubAllEnvs();
  });

  it("removes timeout timing constraint by default for NVIDIA model", async () => {
    const { createNvidiaModel } = await import("./model-providers");
    vi.stubEnv("NVIDIA_API_KEY", "nvapi-test");
    vi.stubEnv("NVIDIA_TIMEOUT_MS", "");
    const unconstrained = createNvidiaModel("nvidia/nemotron-3.5-super-vl-120b-a12b") as unknown as { timeout?: number };
    expect(unconstrained.timeout).toBeUndefined();

    vi.stubEnv("NVIDIA_TIMEOUT_MS", "120000");
    const customTimeout = createNvidiaModel("nvidia/nemotron-3.5-super-vl-120b-a12b") as unknown as { timeout?: number };
    expect(customTimeout.timeout).toBe(120000);
    vi.unstubAllEnvs();
  });
});

describe("NVIDIA GLM experimental models", () => {
  const GLM = "z-ai/glm-5.3";
  const FLASH = "z-ai/glm-5.3-flash";

  it("lists both GLM ids as experimental, text-only, and keeps Nemotron the default", async () => {
    const { NVIDIA_MODELS, nvidiaModelInfo, isSelectableNvidiaModel } = await import("@/features/ai/nvidia-models");
    expect(NVIDIA_MODELS.filter((m) => m.experimental).map((m) => m.id)).toEqual([GLM, FLASH]);
    expect(nvidiaModelInfo(GLM)).toMatchObject({ vision: false, experimental: true });
    expect(nvidiaModelInfo(FLASH)).toMatchObject({ vision: false, experimental: true });
    expect(nvidiaModelInfo("nvidia/nemotron-3.5-super-vl-120b-a12b")).toMatchObject({ vision: true, experimental: false });
    expect(getAIModelProviderConfig("nvidia").modelName).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(isSelectableNvidiaModel(GLM)).toBe(true);
    expect(isSelectableNvidiaModel("z-ai/glm-9")).toBe(false);
    expect(isSelectableNvidiaModel(undefined)).toBe(false);
  });

  it("uses a requested GLM model, ignores one that is not listed, and ignores a model for other providers", () => {
    expect(getAIModelProviderConfig("nvidia", { model: FLASH }).modelName).toBe(FLASH);
    expect(getAIModelProviderConfig("nvidia", { model: "evil/model" }).modelName).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(getAIModelProviderConfig("groq", { model: GLM }).modelName).not.toBe(GLM);
  });

  it("never sends images to a text-only model: vision requests use the vision model instead", async () => {
    const { modelSupportsVision } = await import("@/features/ai/nvidia-models");
    expect(modelSupportsVision("nvidia", GLM)).toBe(false);
    expect(modelSupportsVision("nvidia", FLASH)).toBe(false);
    expect(modelSupportsVision("nvidia", "nvidia/nemotron-3.5-super-vl-120b-a12b")).toBe(true);
    expect(modelSupportsVision("nvidia")).toBe(true);
    expect(modelSupportsVision("local", GLM)).toBe(false);
    expect(getAIModelProviderConfig("nvidia", { model: GLM, vision: true }).modelName).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    vi.stubEnv("NVIDIA_VISION_MODEL", "nvidia/other-vl");
    expect(getAIModelProviderConfig("nvidia", { model: GLM, vision: true }).modelName).toBe("nvidia/other-vl");
    vi.unstubAllEnvs();
  });

  it("sends thinking parameters to Nemotron as before, and to GLM only when explicitly configured", async () => {
    const { nvidiaThinking } = await import("./model-providers");
    vi.stubEnv("NVIDIA_ENABLE_THINKING", "");
    vi.stubEnv("NVIDIA_REASONING_BUDGET", "");
    expect(nvidiaThinking()).toEqual({ enable_thinking: true });
    expect(nvidiaThinking("nvidia/nemotron-3.5-super-vl-120b-a12b")).toEqual({ enable_thinking: true });
    expect(nvidiaThinking(GLM)).toBeUndefined();
    expect(nvidiaThinking(FLASH)).toBeUndefined();
    vi.stubEnv("NVIDIA_ENABLE_THINKING", "0");
    expect(nvidiaThinking(GLM)).toEqual({ enable_thinking: false });
    vi.stubEnv("NVIDIA_ENABLE_THINKING", "1");
    expect(nvidiaThinking(GLM)).toEqual({ enable_thinking: true });
    vi.unstubAllEnvs();
  });

  it("builds the GLM chat model on the same endpoint and key, with the model's own kwargs, and keeps the Nemotron fallback", async () => {
    const { createNvidiaModel, createBaseChatModel } = await import("./model-providers");
    vi.stubEnv("NVIDIA_API_KEY", "nvapi-test");
    vi.stubEnv("NVIDIA_ENABLE_THINKING", "");
    const glm = createNvidiaModel(GLM) as unknown as { model: string; modelKwargs?: Record<string, unknown> };
    expect(glm.model).toBe(GLM);
    expect(glm.modelKwargs?.chat_template_kwargs).toBeUndefined();
    const nemotron = createNvidiaModel("nvidia/nemotron-3.5-super-vl-120b-a12b") as unknown as { modelKwargs?: Record<string, unknown> };
    expect(nemotron.modelKwargs?.chat_template_kwargs).toEqual({ enable_thinking: true });
    // Selected GLM is wrapped with the unchanged fallback, which keeps working after bindTools.
    const wrapped = createBaseChatModel("nvidia", { model: GLM }) as unknown as { bindTools: unknown; invoke: unknown };
    expect(typeof wrapped.invoke).toBe("function");
    expect(typeof wrapped.bindTools).toBe("function");
    vi.unstubAllEnvs();
  });

  it("falls back to the Nemotron model when GLM is rate limited, overloaded or not served to the key, but surfaces auth and bad-request errors", async () => {
    const { withNvidiaFallback } = await import("./model-providers");
    const make = (result: string | Error) => {
      const self = { invoke: vi.fn(async () => { if (result instanceof Error) throw result; return result; }), bindTools: () => self };
      return self;
    };
    const backup = make("nemotron");
    for (const message of ["429 Too Many Requests", "503 Service Unavailable", "404 model not found", "fetch failed"]) {
      await expect(withNvidiaFallback(make(new Error(message)) as never, backup as never).invoke("hi" as never)).resolves.toBe("nemotron");
    }
    for (const message of ["401 Unauthorized", "400 Bad Request: unsupported chat_template_kwargs"]) {
      await expect(withNvidiaFallback(make(new Error(message)) as never, backup as never).invoke("hi" as never)).rejects.toThrow(message.slice(0, 3));
    }
  });
});
