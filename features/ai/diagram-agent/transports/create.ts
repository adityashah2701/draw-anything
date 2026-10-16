import type { AIModelProvider } from "@/features/ai/types";
import { createAIChatModel, createBaseChatModel } from "@/features/ai/server/model-providers";
import { createFallbackTransport, type FallbackNotice } from "./fallback";
import { createNativeTransport } from "./native";
import { createTextTransport } from "./text";
import type { ToolTransport } from "../types";

export type TransportPreference = "native" | "text" | "auto";

/**
 * Providers whose chat models do function calling. Gemini has its own adapter without tools, so it
 * always uses the text protocol. Which is better per provider is an eval question: override with
 * AI_AGENT_TRANSPORT=native|text (default auto: native where available, text as fallback).
 */
const NATIVE_CAPABLE = new Set<AIModelProvider>(["groq", "openai", "anthropic", "openrouter", "local"]);

export const resolveTransportPreference = (provider: AIModelProvider, env: Record<string, string | undefined> = process.env): TransportPreference => {
  const forced = env.AI_AGENT_TRANSPORT;
  if (forced === "native" || forced === "text") return NATIVE_CAPABLE.has(provider) || forced === "text" ? forced : "text";
  return "auto";
};

export const createToolTransport = (
  provider: AIModelProvider,
  onFallback?: (notice: FallbackNotice) => void,
  env: Record<string, string | undefined> = process.env,
): ToolTransport => {
  const preference = resolveTransportPreference(provider, env);
  const text = createTextTransport(createAIChatModel(provider));
  if (preference === "text" || !NATIVE_CAPABLE.has(provider)) return text;
  const base = createBaseChatModel(provider);
  if (!base) return text;
  let native: ToolTransport;
  try {
    native = createNativeTransport(base);
  } catch {
    return text;
  }
  return preference === "native" ? native : createFallbackTransport(native, text, onFallback);
};
