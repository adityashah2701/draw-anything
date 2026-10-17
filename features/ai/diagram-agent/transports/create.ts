import type { AIModelProvider } from "@/features/ai/types";
import { createAIChatModel, createBaseChatModel } from "@/features/ai/server/model-providers";
import { createFallbackTransport, type FallbackNotice } from "./fallback";
import { AGENT_TOOL_SPECS, createNativeTransport } from "./native";
import { createTextTransport } from "./text";
import type { ToolSpec, ToolTransport } from "../types";

export type TransportPreference = "native" | "text" | "auto";

/**
 * Providers whose chat models do function calling. Gemini has its own adapter without tools, so it
 * always uses the text protocol. Which is better per provider is an eval question: override with
 * AI_AGENT_TRANSPORT=native|text (default auto: native where available, text as fallback).
 */
const NATIVE_CAPABLE = new Set<AIModelProvider>(["groq", "openai", "anthropic", "openrouter", "nvidia", "local"]);

export const resolveTransportPreference = (provider: AIModelProvider, env: Record<string, string | undefined> = process.env): TransportPreference => {
  const forced = env.AI_AGENT_TRANSPORT;
  if (forced === "native" || forced === "text") return NATIVE_CAPABLE.has(provider) || forced === "text" ? forced : "text";
  return "auto";
};

export interface ToolTransportOptions {
  /** The tools this agent offers (default: the one-shot diagram agent's). Native calling only; the text protocol is described in the prompt. */
  tools?: readonly ToolSpec[];
  /** Use the provider's vision model so user messages can carry images. */
  vision?: boolean;
}

/** Providers whose models here can look at an image. A local model is whatever the user runs, so it is not assumed to. */
export const supportsVision = (provider: AIModelProvider) => provider !== "local";

export const createToolTransport = (
  provider: AIModelProvider,
  onFallback?: (notice: FallbackNotice) => void,
  env: Record<string, string | undefined> = process.env,
  options: ToolTransportOptions = {},
): ToolTransport => {
  const preference = resolveTransportPreference(provider, env);
  const vision = Boolean(options.vision) && supportsVision(provider);
  const text = createTextTransport(createAIChatModel(provider, { vision }));
  if (preference === "text" || !NATIVE_CAPABLE.has(provider)) return text;
  const base = createBaseChatModel(provider, { vision });
  if (!base) return text;
  let native: ToolTransport;
  try {
    native = createNativeTransport(base, options.tools ?? AGENT_TOOL_SPECS);
  } catch {
    return text;
  }
  return preference === "native" ? native : createFallbackTransport(native, text, onFallback);
};
