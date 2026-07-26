import { AIPlanOutput } from "@/features/ai/schemas";

export const resolveThemeHints = (plan: AIPlanOutput) => ({
  theme: plan.styleTheme,
  density: plan.density,
});
