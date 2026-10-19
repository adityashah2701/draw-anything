import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { AIModelProvider } from "@/features/ai/types";
import { MODELS, ModelRole } from "./models";
import { NVIDIA_DEFAULT_MODEL, isSelectableNvidiaModel, nvidiaModelInfo } from "@/features/ai/nvidia-models";
import { GoogleGenAI, Content } from "@google/genai";
import { z } from "zod";
import { parseModelJson } from "./json-extract";

export interface AIModelProviderConfig {
  provider: AIModelProvider;
  modelName: string;
  displayName: string;
}

export type StructuredChatModel = Pick<BaseChatModel, "withStructuredOutput" | "invoke">;

export class MissingAIProviderKeyError extends Error {
  constructor(provider: AIModelProvider, envName: string) {
    super(`Missing ${envName} for ${provider} AI provider.`);
    this.name = "MissingAIProviderKeyError";
  }
}

const readProvider = (provider?: AIModelProvider): AIModelProvider =>
  provider ?? "gemini";

const requireEnv = (provider: AIModelProvider, envName: string) => {
  const value = process.env[envName];
  if (!value) {
    throw new MissingAIProviderKeyError(provider, envName);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Gemini adapter using @google/genai (supports Gemini 3.x models)
// ---------------------------------------------------------------------------

type GenAIPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** `data:image/png;base64,...` as Gemini's inline image part; null for anything else (remote URLs are not fetched). */
const imagePartFromUrl = (url: unknown): GenAIPart | null => {
  const m = typeof url === "string" ? /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(url) : null;
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
};

/** The parts of one LangChain message: its text, and its images when the content is a list of blocks. */
const partsOf = (content: unknown): GenAIPart[] => {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: "" }];
  const parts: GenAIPart[] = [];
  let text = "";
  for (const block of content as Array<{ type?: string; text?: string; image_url?: { url?: string } | string }>) {
    if (block?.type === "text" && typeof block.text === "string") text += block.text;
    else if (block?.type === "image_url") {
      const image = imagePartFromUrl(typeof block.image_url === "string" ? block.image_url : block.image_url?.url);
      if (image) parts.push(image);
    }
  }
  return [{ text }, ...parts];
};

interface GenAIMessage {
  role: string;
  parts: GenAIPart[];
}

/** Convert LangChain message format to Google GenAI Content format. */
export function toGenAIMessages(
  messages: unknown[],
): { systemInstruction?: string; contents: GenAIMessage[] } {
  const contents: GenAIMessage[] = [];
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    // Handle BaseMessage objects
    if (msg && typeof msg === "object" && "getType" in msg) {
      const m = msg as { getType(): string; content: unknown; name?: string };
      const role = m.getType();
      const parts = partsOf(m.content);
      if (role === "system") {
        systemInstruction = parts.map((p) => ("text" in p ? p.text : "")).join("");
      } else {
        contents.push({ role: role === "ai" || role === "assistant" ? "model" : "user", parts });
      }
    }
    // Handle [role, content] tuples
    else if (Array.isArray(msg) && msg.length === 2) {
      const [role, content] = msg as [string, unknown];
      const text = typeof content === "string" ? content : String(content ?? "");
      if (role === "system") {
        systemInstruction = text;
      } else {
        contents.push({ role: role === "ai" || role === "assistant" ? "model" : "user", parts: [{ text }] });
      }
    }
    // Handle string messages
    else if (typeof msg === "string") {
      contents.push({ role: "user", parts: [{ text: msg }] });
    }
  }

  return { systemInstruction, contents };
}

const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.6-flash";

/** Gemini docs: 503 UNAVAILABLE is a temporary overload of that model; another model is the suggested workaround. */
const isGeminiOverload = (e: unknown): boolean =>
  /\b503\b|UNAVAILABLE|high demand/i.test(e instanceof Error ? e.message : String(e));

class GeminiChatModel {
  private client: GoogleGenAI;
  private model: string;
  private temperature: number;
  private maxOutputTokens: number;

  constructor(opts: { apiKey: string; model: string; temperature?: number; maxOutputTokens?: number }) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model;
    this.temperature = opts.temperature ?? 0;
    this.maxOutputTokens = opts.maxOutputTokens ?? 16384;
  }

  private async generate(params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]) {
    try {
      return await this.client.models.generateContent(params);
    } catch (e) {
      if (!isGeminiOverload(e) || params.model === GEMINI_FALLBACK_MODEL) throw e;
      console.warn(`[gemini] ${params.model} overloaded, falling back to ${GEMINI_FALLBACK_MODEL}`);
      return this.client.models.generateContent({ ...params, model: GEMINI_FALLBACK_MODEL });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(input: any): Promise<any> {
    const messages = Array.isArray(input) ? input : [input];
    const { systemInstruction, contents } = toGenAIMessages(messages);

    const response = await this.generate({
      model: this.model,
      contents: contents as Content[],
      config: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    const text = response.text ?? "";
    return { content: text };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withStructuredOutput<T extends Record<string, any>>(
    schema: unknown,
  ): { invoke: (input: unknown) => Promise<T> } {
    const generate = this.generate.bind(this);
    const model = this.model;
    const temperature = this.temperature;
    const maxOutputTokens = this.maxOutputTokens;

    return {
      invoke: async (input: unknown): Promise<T> => {
        const messages = Array.isArray(input) ? input : [input];
        const { systemInstruction, contents } = toGenAIMessages(messages);

        const structuredPrompt: GenAIMessage = {
          role: "user",
          parts: [{ text: buildJsonInstruction(schema) }],
        };

        const response = await generate({
          model,
          contents: [...contents, structuredPrompt] as Content[],
          config: {
            temperature,
            maxOutputTokens,
            responseMimeType: "application/json",
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        });

        return parseModelJson(response.text ?? "") as T;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Schema description
// ---------------------------------------------------------------------------

const isZodSchema = (schema: unknown): schema is z.ZodType =>
  typeof schema === "object" &&
  schema !== null &&
  typeof (schema as { safeParse?: unknown }).safeParse === "function" &&
  "_zod" in schema;

/**
 * JSON Schema for a structured-output request, as text for the prompt.
 *
 * Zod 4 schemas expose a `.type` property, so the previous converter mistook
 * them for ready-made JSON Schema and ended up telling Gemini the answer was
 * `{"type":"STRING"}`. Use Zod's own converter, and accept plain JSON Schema
 * objects for callers that already have one.
 */
export const describeSchemaForPrompt = (schema: unknown): string => {
  let json: Record<string, unknown> = { type: "object" };
  try {
    if (isZodSchema(schema)) {
      json = z.toJSONSchema(schema) as Record<string, unknown>;
    } else if (typeof schema === "object" && schema !== null) {
      json = schema as Record<string, unknown>;
    }
  } catch {
    // Unrepresentable schema: fall back to "some object"; the caller validates anyway.
  }
  const { $schema: _ignored, ...rest } = json;
  return JSON.stringify(rest);
};

/** The instruction appended to every structured request, for every provider. */
const buildJsonInstruction = (schema: unknown): string =>
  `Respond with ONLY a single JSON object that matches this JSON Schema:\n${describeSchemaForPrompt(schema)}\n` +
  "Rules: no markdown code fences and no text before or after the JSON; leave out optional fields you do not need instead of sending null; keep to the length limits in the schema.";

/** Plain text of a chat reply, whether `content` is a string or content blocks. */
export const messageText = (message: unknown): string => {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) =>
      typeof block === "string"
        ? block
        : typeof (block as { text?: unknown })?.text === "string"
          ? (block as { text: string }).text
          : "",
    )
    .join("");
};

const finishReasonOf = (message: unknown): string | undefined => {
  const meta = (message as { response_metadata?: Record<string, unknown> } | null)
    ?.response_metadata;
  const reason = meta?.finish_reason ?? meta?.stop_reason;
  return typeof reason === "string" ? reason : undefined;
};

/**
 * Structured output for any LangChain chat model, the same way for every
 * provider: the schema goes in the prompt, the reply is read as plain text and
 * parsed leniently here. The provider's own structured-output modes are
 * deliberately not used. They differ per model (Groq switches gpt-oss to strict
 * JSON-schema decoding, others use tool calling), validate against our strict
 * Zod schema before the lenient normaliser runs, and on failure left callers
 * with nothing to recover from.
 */
export const createPromptedStructuredModel = (
  base: Pick<BaseChatModel, "invoke">,
): StructuredChatModel =>
  ({
    invoke: (input: unknown, options?: unknown) =>
      base.invoke(input as never, options as never),
    withStructuredOutput: (schema: unknown) => {
      const instruction = buildJsonInstruction(schema);
      return {
        invoke: async (input: unknown) => {
          const messages = [
            ...(Array.isArray(input) ? input : [input]),
            ["human", instruction],
          ];
          const response = await base.invoke(messages as never);
          return parseModelJson(messageText(response), finishReasonOf(response));
        },
      };
    },
  }) as unknown as StructuredChatModel;

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/** Groq's default model cannot read images; this one can (override with GROQ_VISION_MODEL). */
const GROQ_VISION_DEFAULT = "meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * NVIDIA's hosted API (OpenAI-compatible). Both models below take images, call tools and reason
 * (checked against the live /v1/models list); the newer one is the default, the smaller one answers
 * when it is rate limited or unavailable. Override with NVIDIA_MODEL / NVIDIA_FALLBACK_MODEL.
 */
const NVIDIA_FALLBACK_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

/** A reply that another model might still give: rate limit, overload, outage, or this model not served to this key. */
export const isNvidiaRetryable = (e: unknown): boolean =>
  /\b(429|404|50[0-4])\b|rate.?limit|too many requests|overloaded|unavailable|not found|timed? ?out|ECONN|fetch failed/i.test(
    e instanceof Error ? e.message : String(e),
  );

/**
 * Reasoning config: full thinking capacity by default (unbounded), or capped when NVIDIA_REASONING_BUDGET is set.
 * Set NVIDIA_ENABLE_THINKING=0 to disable reasoning.
 */
export const nvidiaThinking = (model?: string) => {
  const explicit = process.env.NVIDIA_ENABLE_THINKING;
  if (model && nvidiaModelInfo(model).thinking === "explicit") {
    if (explicit === undefined || explicit === "") return undefined;
    if (explicit === "0") return { enable_thinking: false };
  }
  if (process.env.NVIDIA_ENABLE_THINKING === "0") {
    return { enable_thinking: false };
  }
  const budget = process.env.NVIDIA_REASONING_BUDGET ? Number(process.env.NVIDIA_REASONING_BUDGET) : undefined;
  return budget && budget > 0
    ? { enable_thinking: true, reasoning_budget: budget }
    : { enable_thinking: true };
};

export const createNvidiaModel = (model: string): BaseChatModel =>
  new ChatOpenAI({
    model,
    temperature: 0.6, // NVIDIA's recommendation for the reasoning mode; greedy decoding can loop
    topP: 0.95,
    maxTokens: Number(process.env.NVIDIA_MAX_TOKENS) || 16384,
    apiKey: requireEnv("nvidia", "NVIDIA_API_KEY"),
    configuration: { baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1" },
    // No timing constraint: timeout is undefined by default so deep reasoning is never aborted mid-thought.
    // Override with NVIDIA_TIMEOUT_MS if a specific timeout limit is desired.
    timeout: process.env.NVIDIA_TIMEOUT_MS ? Number(process.env.NVIDIA_TIMEOUT_MS) || undefined : undefined,
    modelKwargs: nvidiaThinking(model) ? { chat_template_kwargs: nvidiaThinking(model) } : {},
  });

type Runner = Pick<BaseChatModel, "invoke"> & { bindTools?: (tools: never[]) => Runner };

/** `primary`, and `secondary` for any call that fails in a way another model could answer. Also after `bindTools`. */
export const withNvidiaFallback = (primary: Runner, secondary: Runner): BaseChatModel =>
  ({
    invoke: async (input: never, options?: never) => {
      try {
        return await primary.invoke(input, options);
      } catch (e) {
        if (!isNvidiaRetryable(e)) throw e;
        console.warn("[nvidia] primary model failed, using the fallback model:", e instanceof Error ? e.message.slice(0, 120) : e);
        return secondary.invoke(input, options);
      }
    },
    bindTools: (tools: never[]) => withNvidiaFallback(primary.bindTools!(tools), secondary.bindTools!(tools)),
  }) as unknown as BaseChatModel;

export interface ModelOptions {
  /** NVIDIA only: a model from NVIDIA_MODELS to use instead of the default. Ignored (and never trusted) for other providers. */
  model?: string;
  /** A model that accepts images: `<PROVIDER>_VISION_MODEL` when set, else the provider's usual model (Groq: a Llama 4 vision model). */
  vision?: boolean;
}

export const getAIModelProviderConfig = (
  providerInput?: AIModelProvider,
  options: ModelOptions = {},
): AIModelProviderConfig => {
  let config = baseProviderConfig(providerInput);
  if (config.provider === "nvidia" && isSelectableNvidiaModel(options.model)) {
    config = { ...config, modelName: options.model, displayName: nvidiaModelInfo(options.model).label };
  }
  if (!options.vision) return config;
  // A model that cannot read images never gets them: use the provider's vision default instead.
  if (config.provider === "nvidia" && !nvidiaModelInfo(config.modelName).vision) {
    return { ...config, modelName: process.env.NVIDIA_VISION_MODEL ?? NVIDIA_DEFAULT_MODEL, displayName: "NVIDIA Nemotron" };
  }
  const override = process.env[`${config.provider.toUpperCase()}_VISION_MODEL`];
  if (override) return { ...config, modelName: override };
  return config.provider === "groq" ? { ...config, modelName: GROQ_VISION_DEFAULT } : config;
};

const baseProviderConfig = (providerInput?: AIModelProvider): AIModelProviderConfig => {
  const provider = readProvider(providerInput);
  switch (provider) {
    case "gemini":
      return {
        provider,
        modelName: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
        displayName: "Gemini",
      };
    case "groq":
      return {
        provider,
        modelName: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
        displayName: "Groq",
      };
    case "openai":
      return {
        provider,
        modelName: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        displayName: "OpenAI",
      };
    case "anthropic":
      return {
        provider,
        modelName: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        displayName: "Anthropic",
      };
    case "openrouter":
      return {
        provider,
        modelName:
          process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
        displayName: "OpenRouter",
      };
    case "nvidia":
      return {
        provider,
        modelName: process.env.NVIDIA_MODEL ?? NVIDIA_DEFAULT_MODEL,
        displayName: "NVIDIA Nemotron",
      };
    case "local":
      return {
        provider,
        modelName: process.env.LOCAL_AI_MODEL ?? "local-model",
        displayName: "Local",
      };
  }
};

/**
 * The provider's own LangChain chat model (no prompted-JSON wrapper), for callers that talk to the
 * model directly (the diagram agent's tool loop). `null` for Gemini, which has its own adapter
 * without tool calling.
 */
export const createBaseChatModel = (
  providerInput?: AIModelProvider,
  options: ModelOptions = {},
): BaseChatModel | null => {
  const config = getAIModelProviderConfig(providerInput, options);

  switch (config.provider) {
    case "gemini":
      return null;
    case "groq":
      return new ChatGroq({
        model: config.modelName,
        temperature: 0,
        maxTokens: 16384,
        apiKey: requireEnv(config.provider, "GROQ_API_KEY"),
      });
    case "openai":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: 0,
        maxTokens: 16384,
        apiKey: requireEnv(config.provider, "OPENAI_API_KEY"),
      });
    case "anthropic":
      return new ChatAnthropic({
        model: config.modelName,
        temperature: 0,
        maxTokens: 16384,
        apiKey: requireEnv(config.provider, "ANTHROPIC_API_KEY"),
      });
    case "openrouter":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: 0,
        maxTokens: 16384,
        apiKey: requireEnv(config.provider, "OPENROUTER_API_KEY"),
        configuration: {
          baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        },
      });
    case "nvidia": {
      const primary = createNvidiaModel(config.modelName);
      if (process.env.NVIDIA_DISABLE_FALLBACK === "1" || process.env.NVIDIA_FALLBACK_MODEL === "none") {
        return primary;
      }
      // An override that is already the fallback model has nothing to fall back to.
      const fallback = process.env.NVIDIA_FALLBACK_MODEL ?? NVIDIA_FALLBACK_MODEL;
      return fallback === config.modelName ? primary : withNvidiaFallback(primary, createNvidiaModel(fallback));
    }
    case "local":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: 0,
        apiKey: process.env.LOCAL_AI_API_KEY ?? "local",
        configuration: {
          baseURL: process.env.LOCAL_AI_BASE_URL ?? "http://localhost:11434/v1",
        },
      });
  }
};

export const createAIChatModel = (
  providerInput?: AIModelProvider,
  options: ModelOptions = {},
): StructuredChatModel => {
  const config = getAIModelProviderConfig(providerInput, options);
  const base = createBaseChatModel(providerInput, options);
  if (!base) {
    return new GeminiChatModel({
      apiKey: requireEnv(config.provider, "GEMINI_API_KEY"),
      model: config.modelName,
      temperature: 0,
      maxOutputTokens: 16384,
    }) as unknown as StructuredChatModel;
  }
  return createPromptedStructuredModel(base);
};

/**
 * Create a chat model from a named role in the model registry.
 * Agents should use this instead of calling createAIChatModel directly.
 */
export const createAIChatModelFromRole = (role: ModelRole): StructuredChatModel => {
  const entry = MODELS[role];
  return createAIChatModel(entry.provider);
};
