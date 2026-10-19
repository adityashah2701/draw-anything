/**
 * Feature flags for the unified agent (one conversation per board, diagram generation and memory as tools).
 * Both default to off: with them off the editor and the endpoints behave exactly as before.
 *
 * - `NEXT_PUBLIC_UNIFIED_AGENT=1` (browser): persist the board's conversation and enable the generate and memory tools.
 * - `AI_UNIFIED_AGENT=1` (server): offer those tools to the model and put the board's memory in its prompt.
 */
const on = (value: string | undefined) => value === "1" || value?.toLowerCase() === "true";

export const unifiedAgentClientEnabled = (): boolean => {
  try {
    // Written out in full so Next inlines it into the browser bundle; a bundler without `process` simply means "off".
    return on(process.env.NEXT_PUBLIC_UNIFIED_AGENT);
  } catch {
    return false;
  }
};

export const unifiedAgentServerEnabled = (env: Record<string, string | undefined> = process.env): boolean => on(env.AI_UNIFIED_AGENT);

/** The groups only the unified agent has. */
export const UNIFIED_GROUPS = ["generate", "memory"] as const;
