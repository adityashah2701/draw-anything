import { createMemoryHost, type MemoryHostOptions } from "./memory-host";
import { createCanvasTools } from "./runtime";
import type { ToolGroup, ToolResult } from "./types";

export const ALL_GROUPS: ToolGroup[] = ["create", "edit", "connect", "arrange", "organize", "document"];

/** A board in memory with every tool group on; `run` calls a tool exactly as the agent loop would. */
export const setup = (options: MemoryHostOptions & { groups?: ToolGroup[]; autoApprove?: boolean } = {}) => {
  const mem = createMemoryHost(options);
  const executor = createCanvasTools({ host: mem.host, groups: options.groups ?? ALL_GROUPS, session: options.autoApprove ? { autoApproveDestructive: true } : undefined });
  let n = 0;
  const run = (name: string, args: unknown = {}, id?: string): Promise<ToolResult> => executor.execute({ id: id ?? `call_${(n += 1)}`, name, args });
  const ok = async (name: string, args: unknown = {}) => {
    const result = await run(name, args);
    if (!result.ok) throw new Error(`${name} failed: ${result.error?.code} ${result.error?.message}`);
    return result;
  };
  return { mem, executor, run, ok };
};
