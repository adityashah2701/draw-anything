import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { AIModelProvider } from "@/features/ai/types";

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

export const getAIModelProviderConfig = (
  providerInput?: AIModelProvider,
): AIModelProviderConfig => {
  const provider = readProvider(providerInput);
  switch (provider) {
    case "gemini":
      return {
        provider,
        modelName: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
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
      return new ChatGoogleGenerativeAI({
        model: config.modelName,
        temperature: 0,
        apiKey: requireEnv(config.provider, "GEMINI_API_KEY"),
      });
    case "groq":
      return new ChatGroq({
        model: config.modelName,
        temperature: 0,
        apiKey: requireEnv(config.provider, "GROQ_API_KEY"),
      });
    case "openai":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: 0,
        apiKey: requireEnv(config.provider, "OPENAI_API_KEY"),
      });
    case "anthropic":
      return new ChatAnthropic({
        model: config.modelName,
        temperature: 0,
        apiKey: requireEnv(config.provider, "ANTHROPIC_API_KEY"),
      });
    case "openrouter":
      return new ChatOpenAI({
        model: config.modelName,
        temperature: 0,
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
