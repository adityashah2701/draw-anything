import type { AIModelProvider } from "@/features/ai/types";

/**
 * The provider used when a request or the panel names none. NVIDIA serves its Nemotron model
 * (`NVIDIA_DEFAULT_MODEL`) unless `NVIDIA_MODEL` says otherwise. Kept dependency-free so the browser can use it.
 */
export const DEFAULT_AI_PROVIDER: AIModelProvider = "nvidia";

/** The default provider when the server has its key, else the first provider that is configured (undefined when none is). */
export const pickDefaultProvider = (enabled: readonly AIModelProvider[]): AIModelProvider | undefined =>
  enabled.includes(DEFAULT_AI_PROVIDER) ? DEFAULT_AI_PROVIDER : enabled[0];
