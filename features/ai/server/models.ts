import { AIModelProvider } from "@/features/ai/types";

export interface ModelEntry {
  provider: AIModelProvider;
  model: string;
  displayName: string;
}

/**
 * Central model registry. Change model upgrades here — no other file needs to change.
 *
 * Roles:
 *   FAST      — low-latency, high-throughput (diagram generation default)
 *   REASONING — deeper analysis (planning, expansion)
 *   CHEAP     — cost-optimized (Groq free tier)
 *   REVIEW    — highest quality (critic, repair)
 *   CODING    — code-aware (if needed)
 */
export const MODELS = {
  FAST: {
    provider: "gemini" as AIModelProvider,
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
  },
  REASONING: {
    provider: "gemini" as AIModelProvider,
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
  },
  CHEAP: {
    provider: "groq" as AIModelProvider,
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    displayName: "Groq Llama-3 70B",
  },
  REVIEW: {
    provider: "anthropic" as AIModelProvider,
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
    displayName: "Claude 3.5 Sonnet",
  },
  CODING: {
    provider: "openai" as AIModelProvider,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
  },
} as const;

export type ModelRole = keyof typeof MODELS;

export const getDefaultModel = (): ModelEntry => MODELS.FAST;

export const getModelByRole = (role: ModelRole): ModelEntry => MODELS[role];
