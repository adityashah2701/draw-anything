import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { AIModelProvider } from "@/features/ai/types";
import { MODELS, ModelRole } from "./models";
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

type GenAIPart = { text: string } | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GenAIMessage {
  role: string;
  parts: GenAIPart[];
}

/** Convert LangChain message format to Google GenAI Content format. */
function toGenAIMessages(
  messages: unknown[],
): { systemInstruction?: string; contents: GenAIMessage[] } {
  const contents: GenAIMessage[] = [];
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    // Handle BaseMessage objects
    if (msg && typeof msg === "object" && "getType" in msg) {
      const m = msg as { getType(): string; content: unknown; name?: string };
      const role = m.getType();
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text : "")).join("")
          : "";

      if (role === "system") {
        systemInstruction = text;
      } else {
        contents.push({ role: role === "ai" || role === "assistant" ? "model" : "user", parts: [{ text }] });
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

export interface ModelOptions {
  /** A model that accepts images: `<PROVIDER>_VISION_MODEL` when set, else the provider's usual model (Groq: a Llama 4 vision model). */
  vision?: boolean;
}

export const getAIModelProviderConfig = (
  providerInput?: AIModelProvider,
  options: ModelOptions = {},
): AIModelProviderConfig => {
  const config = baseProviderConfig(providerInput);
  if (!options.vision) return config;
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
