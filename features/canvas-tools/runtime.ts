import { createToolExecutor, type ToolExecutor, type ToolExecutorOptions } from "./executor";
import { buildTools } from "./registry";
import type { CanvasHost, ToolGroup, ToolSession } from "./types";

export interface CanvasToolRuntimeOptions {
  host: CanvasHost;
  session?: Partial<ToolSession>;
  /** Groups on from the start; `inspect` is always on. */
  groups?: readonly ToolGroup[];
  now?: ToolExecutorOptions["now"];
}

/**
 * The tools wired to a host: one executor whose `enable_tools` really changes what the same run may call.
 * This is what the editor, the scripted-model tests and the browser tests all construct.
 */
export const createCanvasTools = ({ host, session, groups, now }: CanvasToolRuntimeOptions): ToolExecutor => {
  let executor: ToolExecutor | null = null;
  const tools = buildTools((enabled) => executor?.enable(enabled));
  executor = createToolExecutor({ host, tools, session, now });
  executor.enable(["inspect", ...(groups ?? [])]);
  return executor;
};
