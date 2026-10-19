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

import { createShape } from "@/core/shapes/shape-runtime";
import type { DrawingElement, GroupRecord, StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/** A semantic node from its top-left corner (the same factory the editor and the tools use). */
export const node = (id: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}, size = { w: 168, h: 78 }): DrawingElement =>
  ({
    ...createShape("semantic-node", { id, label, points: [{ x, y }, { x: x + size.w, y: y + size.h }], ai: { semanticId: id, role: "node", ...(extra.ai as object | undefined) } }),
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "ai")),
  }) as DrawingElement;

export const rectangle = (id: string, x: number, y: number, w = 120, h = 80, extra: Record<string, unknown> = {}): DrawingElement =>
  ({ ...createShape("rectangle", { id, points: [{ x, y }, { x: x + w, y: y + h }] }), ...extra }) as DrawingElement;

export const groupRecord = (id: string, extra: Partial<GroupRecord> = {}): GroupRecord => ({ id, type: "group", points: [], color: "#000000", strokeWidth: 0, ...extra });

/** Ids of the stored elements, in stacking order. */
export const idsOf = (stored: readonly StoredElement[]) => stored.map((item) => item.id);

export const find = <T extends StoredElement = DrawingElement>(stored: readonly StoredElement[], id: string): T => {
  const found = stored.find((item) => item.id === id);
  if (!found) throw new Error(`no element ${id}`);
  return found as T;
};

export const boxOf = (shape: DrawingElement) => {
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
