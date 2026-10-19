import type { AIModelProvider } from "@/features/ai/types";

/** Default NVIDIA model: vision-capable Nemotron. Kept in a dependency-free file so the browser can list the models too. */
export const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

/**
 * Models the NVIDIA provider can serve, with what each is known to do. Nemotron stays the default; the GLM
 * ids (confirmed in the account's `/v1/models` list) are experimental, picked per request. Capabilities are
 * per model, never per provider: `vision: false` means images are never sent to that model.
 * Only the thinking parameter differs per model: GLM gets `chat_template_kwargs` only when
 * NVIDIA_ENABLE_THINKING is set explicitly, because its accepted keys are not verified.
 */
export interface NvidiaModelInfo {
  id: string;
  label: string;
  vision: boolean;
  experimental: boolean;
  /** `nemotron`: always send the thinking kwargs (default on). `explicit`: only when NVIDIA_ENABLE_THINKING is set. */
  thinking: "nemotron" | "explicit";
}

export const NVIDIA_MODELS: readonly NvidiaModelInfo[] = [
  { id: NVIDIA_DEFAULT_MODEL, label: "NVIDIA · Nemotron", vision: true, experimental: false, thinking: "nemotron" },
  { id: "z-ai/glm-5.3", label: "NVIDIA · GLM 5.3 (experimental)", vision: false, experimental: true, thinking: "explicit" },
  { id: "z-ai/glm-5.3-flash", label: "NVIDIA · GLM 5.3 Flash (experimental)", vision: false, experimental: true, thinking: "explicit" },
];

/** What is known about `id`. The fallback Nemotron model and any NVIDIA_MODEL override keep the Nemotron behaviour. */
export const nvidiaModelInfo = (id: string): NvidiaModelInfo =>
  NVIDIA_MODELS.find((m) => m.id === id) ?? { id, label: id, vision: true, experimental: false, thinking: "nemotron" };

/** A model a request may name: only the ids listed above, never free text. */
export const isSelectableNvidiaModel = (id: unknown): id is string =>
  typeof id === "string" && NVIDIA_MODELS.some((m) => m.id === id);

/** Can this provider + model take images? `model` only matters for NVIDIA, where it varies. */
export const modelSupportsVision = (provider: AIModelProvider, model?: string): boolean =>
  provider === "local" ? false : provider === "nvidia" && model ? nvidiaModelInfo(model).vision : true;
