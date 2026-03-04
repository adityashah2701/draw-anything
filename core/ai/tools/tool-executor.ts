/**
 * core/ai/tools/tool-executor.ts
 *
 * Executes tool calls dispatched by the Groq agent against the GraphStore.
 *
 * Each execution:
 * 1. Parses and validates the raw JSON arguments.
 * 2. Delegates to the appropriate GraphStore mutation (which has its own
 *    pre-mutation validation gates).
 * 3. Returns a ToolExecutionResult — either success (new store + diff) or
 *    a structured error that is fed back to Groq for self-correction.
 *
 * No mutation ever happens in this file — all mutations go through GraphStore.
 */

import type Groq from "groq-sdk";
import type { GraphDiff, ToolCallResult } from "@/core/ai/types";
import type { ArchitectureLayer } from "@/core/ai/types";
import { GraphStore } from "@/core/graph/graph-store";
import { TOOL_NAMES } from "@/core/ai/tools/tool-definitions";

// ─── Result type ─────────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolCallResult;
  updatedStore: GraphStore;
  diff: GraphDiff;
}

// ─── Empty diff helper ────────────────────────────────────────────────────────

function emptyDiff(): GraphDiff {
  return {
    added: { nodes: [], edges: [] },
    removed: { nodeIds: [], edgeIds: [] },
    updated: [],
  };
}

// ─── Argument parsers (safe JSON) ────────────────────────────────────────────

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = args[key];
  return typeof val === "string" ? val : undefined;
}

function getBoolean(
  args: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const val = args[key];
  return typeof val === "boolean" ? val : defaultValue;
}

function getNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = args[key];
  return typeof val === "number" ? val : undefined;
}

// ─── Individual tool handlers ────────────────────────────────────────────────

function handleCreateNode(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const id = getString(args, "id");
  const label = getString(args, "label");
  const shape = getString(args, "shape");
  const layer = getString(args, "layer") as ArchitectureLayer | undefined;
  const column = getNumber(args, "column");
  const fill = getString(args, "fill");
  const color = getString(args, "color");

  if (!id || !label || !shape) {
    return {
      result: { ok: false, error: "createNode requires id, label, and shape." },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const validShapes = ["rectangle", "circle", "diamond"];
  if (!validShapes.includes(shape)) {
    return {
      result: {
        ok: false,
        error: `createNode: shape must be rectangle, circle, or diamond. Got "${shape}".`,
      },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const node = {
    id: id.trim(),
    label: label.trim().slice(0, 48),
    shape: shape as "rectangle" | "circle" | "diamond",
    ...(layer ? { layer } : {}),
    ...(column !== undefined
      ? { column: Math.max(0, Math.floor(column)) }
      : {}),
    ...(fill ? { fill: fill.trim() } : {}),
    ...(color ? { color: color.trim() } : {}),
  };

  const newStore = store.createNode(node);
  if (newStore instanceof Error) {
    return {
      result: { ok: false, error: newStore.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  return {
    result: { ok: true, data: { nodeId: id } },
    updatedStore: newStore,
    diff: {
      added: { nodes: [node], edges: [] },
      removed: { nodeIds: [], edgeIds: [] },
      updated: [],
    },
  };
}

function handleUpdateNode(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const id = getString(args, "id");
  if (!id) {
    return {
      result: { ok: false, error: "updateNode requires id." },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const patch: Record<string, unknown> = {};
  const label = getString(args, "label");
  const shape = getString(args, "shape");
  const layer = getString(args, "layer");
  const column = getNumber(args, "column");
  const fill = getString(args, "fill");
  const color = getString(args, "color");

  if (label !== undefined) patch.label = label.trim().slice(0, 48);
  if (shape !== undefined) patch.shape = shape;
  if (layer !== undefined) patch.layer = layer;
  if (column !== undefined) patch.column = Math.max(0, Math.floor(column));
  if (fill !== undefined) patch.fill = fill.trim();
  if (color !== undefined) patch.color = color.trim();

  if (Object.keys(patch).length === 0) {
    return {
      result: {
        ok: false,
        error: "updateNode: at least one patch field required.",
      },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const newStore = store.updateNode(
    id,
    patch as Parameters<GraphStore["updateNode"]>[1],
  );
  if (newStore instanceof Error) {
    return {
      result: { ok: false, error: newStore.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const updatedNode = newStore.nodes[id];
  return {
    result: { ok: true, data: { nodeId: id, patch } },
    updatedStore: newStore,
    diff: {
      added: { nodes: [], edges: [] },
      removed: { nodeIds: [], edgeIds: [] },
      updated: updatedNode ? [updatedNode] : [],
    },
  };
}

function handleDeleteNode(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const id = getString(args, "id");
  if (!id) {
    return {
      result: { ok: false, error: "deleteNode requires id." },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const deleteResult = store.deleteNode(id);
  if (deleteResult instanceof Error) {
    return {
      result: { ok: false, error: deleteResult.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  return {
    result: {
      ok: true,
      data: {
        deletedNodeId: id,
        deletedEdgeIds: deleteResult.removedEdgeIds,
      },
    },
    updatedStore: deleteResult.store,
    diff: {
      added: { nodes: [], edges: [] },
      removed: { nodeIds: [id], edgeIds: deleteResult.removedEdgeIds },
      updated: [],
    },
  };
}

function handleCreateEdge(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const from = getString(args, "from");
  const to = getString(args, "to");

  if (!from || !to) {
    return {
      result: { ok: false, error: "createEdge requires from and to." },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const bidirectional = getBoolean(args, "bidirectional", false);
  const dashed = getBoolean(args, "dashed", false);

  const createResult = store.createEdge(from, to, { bidirectional, dashed });
  if (createResult instanceof Error) {
    return {
      result: { ok: false, error: createResult.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const newEdge = createResult.store.edges[createResult.edgeId];
  return {
    result: { ok: true, data: { edgeId: createResult.edgeId } },
    updatedStore: createResult.store,
    diff: {
      added: { nodes: [], edges: newEdge ? [newEdge] : [] },
      removed: { nodeIds: [], edgeIds: [] },
      updated: [],
    },
  };
}

function handleDeleteEdge(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const edgeId = getString(args, "edgeId");
  if (!edgeId) {
    return {
      result: { ok: false, error: "deleteEdge requires edgeId." },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const newStore = store.deleteEdge(edgeId);
  if (newStore instanceof Error) {
    return {
      result: { ok: false, error: newStore.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  return {
    result: { ok: true, data: { deletedEdgeId: edgeId } },
    updatedStore: newStore,
    diff: {
      added: { nodes: [], edges: [] },
      removed: { nodeIds: [], edgeIds: [edgeId] },
      updated: [],
    },
  };
}

function handleMoveNodeToCluster(
  args: Record<string, unknown>,
  store: GraphStore,
): { result: ToolCallResult; updatedStore: GraphStore; diff: GraphDiff } {
  const id = getString(args, "id");
  const layer = getString(args, "layer") as ArchitectureLayer | undefined;

  if (!id || !layer) {
    return {
      result: {
        ok: false,
        error: "moveNodeToCluster requires id and layer.",
      },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const newStore = store.moveNodeToCluster(id, layer);
  if (newStore instanceof Error) {
    return {
      result: { ok: false, error: newStore.message },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  const updatedNode = newStore.nodes[id];
  return {
    result: { ok: true, data: { nodeId: id, layer } },
    updatedStore: newStore,
    diff: {
      added: { nodes: [], edges: [] },
      removed: { nodeIds: [], edgeIds: [] },
      updated: updatedNode ? [updatedNode] : [],
    },
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Executes a single Groq tool call against the current store.
 * Always returns a structured result — never throws.
 */
export function executeSingleToolCall(
  toolCall: Groq.Chat.Completions.ChatCompletionMessageToolCall,
  store: GraphStore,
): ToolExecutionResult {
  const { id: toolCallId, function: fn } = toolCall;
  const toolName = fn.name;
  const args = parseArgs(fn.arguments);

  if (!args) {
    return {
      toolCallId,
      toolName,
      result: {
        ok: false,
        error: `Failed to parse arguments for tool "${toolName}". Ensure arguments is valid JSON.`,
      },
      updatedStore: store,
      diff: emptyDiff(),
    };
  }

  let handlerResult: {
    result: ToolCallResult;
    updatedStore: GraphStore;
    diff: GraphDiff;
  };

  switch (toolName) {
    case TOOL_NAMES.CREATE_NODE:
      handlerResult = handleCreateNode(args, store);
      break;
    case TOOL_NAMES.UPDATE_NODE:
      handlerResult = handleUpdateNode(args, store);
      break;
    case TOOL_NAMES.DELETE_NODE:
      handlerResult = handleDeleteNode(args, store);
      break;
    case TOOL_NAMES.CREATE_EDGE:
      handlerResult = handleCreateEdge(args, store);
      break;
    case TOOL_NAMES.DELETE_EDGE:
      handlerResult = handleDeleteEdge(args, store);
      break;
    case TOOL_NAMES.MOVE_NODE:
      handlerResult = handleMoveNodeToCluster(args, store);
      break;
    case TOOL_NAMES.FINISH:
      // "finish" is handled at the loop level — here we just ack it.
      handlerResult = {
        result: { ok: true, data: { acknowledged: true } },
        updatedStore: store,
        diff: emptyDiff(),
      };
      break;
    default:
      handlerResult = {
        result: {
          ok: false,
          error: `Unknown tool "${toolName}". Use only the registered tools.`,
        },
        updatedStore: store,
        diff: emptyDiff(),
      };
  }

  return {
    toolCallId,
    toolName,
    ...handlerResult,
  };
}

/**
 * Executes a batch of tool calls sequentially, threading the store through.
 * Returns the final store, an array of results (for Groq message construction),
 * and a merged diff of all mutations.
 */
export function executeToolCallBatch(
  toolCalls: Groq.Chat.Completions.ChatCompletionMessageToolCall[],
  initialStore: GraphStore,
): {
  results: ToolExecutionResult[];
  finalStore: GraphStore;
  mergedDiff: GraphDiff;
} {
  const results: ToolExecutionResult[] = [];
  let currentStore = initialStore;

  const mergedDiff: GraphDiff = {
    added: { nodes: [], edges: [] },
    removed: { nodeIds: [], edgeIds: [] },
    updated: [],
  };

  for (const toolCall of toolCalls) {
    const executionResult = executeSingleToolCall(toolCall, currentStore);
    results.push(executionResult);

    // Thread the store forward
    currentStore = executionResult.updatedStore;

    // Merge diffs
    const d = executionResult.diff;
    mergedDiff.added.nodes.push(...d.added.nodes);
    mergedDiff.added.edges.push(...d.added.edges);
    mergedDiff.removed.nodeIds.push(...d.removed.nodeIds);
    mergedDiff.removed.edgeIds.push(...d.removed.edgeIds);
    mergedDiff.updated.push(...d.updated);
  }

  return { results, finalStore: currentStore, mergedDiff };
}
