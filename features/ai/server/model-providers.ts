import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { AIModelProvider } from "@/features/ai/types";
import { MODELS, ModelRole } from "./models";
import { GoogleGenAI, Schema, Type, Content } from "@google/genai";

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

/** Convert a JSON Schema object to the Google GenAI Schema type. */
function jsonSchemaToGeminiSchema(jsonSchema: Record<string, unknown>): Schema {
  const schema: Schema = {};

  if (jsonSchema.type === "object" && jsonSchema.properties) {
    schema.type = Type.OBJECT;
    schema.properties = {};
    for (const [key, prop] of Object.entries(jsonSchema.properties as Record<string, Record<string, unknown>>)) {
      (schema.properties as Record<string, Schema>)[key] = jsonSchemaToGeminiSchema(prop);
    }
    if (Array.isArray(jsonSchema.required)) {
      schema.required = jsonSchema.required as string[];
    }
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
  } else if (jsonSchema.type === "array" && jsonSchema.items) {
    schema.type = Type.ARRAY;
    schema.items = jsonSchemaToGeminiSchema(jsonSchema.items as Record<string, unknown>);
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
  } else if (jsonSchema.type === "string") {
    schema.type = Type.STRING;
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
    if (jsonSchema.enum) schema.enum = jsonSchema.enum as string[];
  } else if (jsonSchema.type === "number" || jsonSchema.type === "integer") {
    schema.type = jsonSchema.type === "integer" ? Type.INTEGER : Type.NUMBER;
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
  } else if (jsonSchema.type === "boolean") {
    schema.type = Type.BOOLEAN;
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
  } else {
    schema.type = Type.STRING;
    if (jsonSchema.description) schema.description = jsonSchema.description as string;
  }

  return schema;
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(input: any): Promise<any> {
    const messages = Array.isArray(input) ? input : [input];
    const { systemInstruction, contents } = toGenAIMessages(messages);

    const response = await this.client.models.generateContent({
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
    const jsonSchema = schemaToJSONSchema(schema);
    const geminiSchema = jsonSchemaToGeminiSchema(jsonSchema);
    const schemaDescription = JSON.stringify(geminiSchema);

    const client = this.client;
    const model = this.model;
    const temperature = this.temperature;
    const maxOutputTokens = this.maxOutputTokens;

    return {
      invoke: async (input: unknown): Promise<T> => {
        const messages = Array.isArray(input) ? input : [input];
        const { systemInstruction, contents } = toGenAIMessages(messages);

        const structuredPrompt: GenAIMessage = {
          role: "user",
          parts: [{ text: `Respond ONLY with a single JSON object matching this JSON Schema:\n${schemaDescription}\nDo not wrap in markdown code fences. Do not include any text before or after the JSON.` }],
        };

        const response = await client.models.generateContent({
          model,
          contents: [...contents, structuredPrompt] as Content[],
          config: {
            temperature,
            maxOutputTokens,
            responseMimeType: "application/json",
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        });

        const raw = response.text ?? "";
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as T;
        }
        // If model returned a JSON string literal (e.g. "..." instead of {...}),
        // try parsing the inner value.
        if (typeof parsed === "string") {
          const inner = JSON.parse(parsed);
          if (typeof inner === "object" && inner !== null) return inner as T;
        }
        throw new Error(`Expected JSON object but got: ${typeof parsed}`);
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Schema conversion
// ---------------------------------------------------------------------------

/** Convert a Zod schema or plain object to a standard JSON Schema. */
function schemaToJSONSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }

  const s = schema as Record<string, unknown>;

  if (s.type || s.properties || s.$schema) {
    return s as Record<string, unknown>;
  }

  if (typeof s.parse === "function" && typeof s.shape === "object" && s.shape !== null) {
    return zodToJSONSchema(s);
  }

  if (s.name && s.parameters) {
    return s.parameters as Record<string, unknown>;
  }

  return s as Record<string, unknown>;
}

/** Minimal Zod-to-JSON-Schema converter for the schemas used in our agents. */
function zodToJSONSchema(zodSchema: Record<string, unknown>): Record<string, unknown> {
  const shape = zodSchema.shape as Record<string, unknown> | undefined;
  if (!shape) {
    return { type: "object", properties: {} };
  }

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [key, zodField] of Object.entries(shape)) {
    const field = zodField as Record<string, unknown>;
    const def = (field._def ?? field) as Record<string, unknown>;
    const typeName = String(def.typeName ?? def.type ?? "");
    const description = String(field.description ?? def.description ?? "");

    let jsonProp: Record<string, unknown> = {};

    if (typeName === "ZodString" || typeName === "string") {
      jsonProp = { type: "string" };
    } else if (typeName === "ZodNumber" || typeName === "number") {
      jsonProp = { type: "number" };
    } else if (typeName === "ZodBoolean" || typeName === "boolean") {
      jsonProp = { type: "boolean" };
    } else if (typeName === "ZodArray" || typeName === "array") {
      jsonProp = { type: "array", items: { type: "string" } };
      const innerDef = (def.type ?? def) as Record<string, unknown>;
      if (innerDef._def) {
        const innerTypeName = String((innerDef._def as Record<string, unknown>).typeName ?? "");
        if (innerTypeName === "ZodObject") {
          jsonProp.items = zodToJSONSchema(innerDef);
        }
      }
    } else if (typeName === "ZodObject" || typeName === "object") {
      jsonProp = zodToJSONSchema(field);
    } else if (typeName === "ZodEnum") {
      jsonProp = { type: "string", enum: (def.values ?? []) as string[] };
    } else if (typeName === "ZodOptional") {
      jsonProp = { type: "string" };
      const innerDef2 = (def.innerType ?? def.type ?? def) as Record<string, unknown>;
      if (innerDef2._def) {
        const innerTypeName = String((innerDef2._def as Record<string, unknown>).typeName ?? "");
        if (innerTypeName === "ZodString") jsonProp = { type: "string" };
        else if (innerTypeName === "ZodNumber") jsonProp = { type: "number" };
        else if (innerTypeName === "ZodBoolean") jsonProp = { type: "boolean" };
      }
    } else {
      jsonProp = { type: "string" };
    }

    if (description) jsonProp.description = description;

    properties[key] = jsonProp;
    required.push(key);
  }

  return { type: "object", properties, required };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export const getAIModelProviderConfig = (
  providerInput?: AIModelProvider,
): AIModelProviderConfig => {
  const provider = readProvider(providerInput);
  switch (provider) {
    case "gemini":
      return {
        provider,
        modelName: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
        displayName: "Gemini",
      };
    case "groq":
      return {
        provider,
        modelName: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
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

export const createAIChatModel = (
  providerInput?: AIModelProvider,
): StructuredChatModel => {
  const config = getAIModelProviderConfig(providerInput);

  switch (config.provider) {
    case "gemini":
      return new GeminiChatModel({
        apiKey: requireEnv(config.provider, "GEMINI_API_KEY"),
        model: config.modelName,
        temperature: 0,
        maxOutputTokens: 16384,
      }) as unknown as StructuredChatModel;
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
          baseURL:
            process.env.LOCAL_AI_BASE_URL ?? "http://localhost:11434/v1",
        },
      });
  }
};

/**
 * Create a chat model from a named role in the model registry.
 * Agents should use this instead of calling createAIChatModel directly.
 */
export const createAIChatModelFromRole = (role: ModelRole): StructuredChatModel => {
  const entry = MODELS[role];
  return createAIChatModel(entry.provider);
};
