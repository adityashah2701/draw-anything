/**
 * core/ai/tools/tool-definitions.ts
 *
 * Groq-compatible Tool definitions for the agentic graph mutation loop.
 *
 * Design notes:
 * - JSON Schema is strict: additionalProperties: false on all objects.
 * - edgeId is a return value from createEdge, used by deleteEdge.
 * - "finish" tool acts as the explicit termination signal.
 * - Runtime uniqueness checks live in tool-executor.ts (JSON Schema can't
 *   cross-reference existing state).
 */

import type Groq from "groq-sdk";

type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

// ─── Individual tool definitions ─────────────────────────────────────────────

const createNodeTool: GroqTool = {
  type: "function",
  function: {
    name: "createNode",
    description:
      "Creates a new node in the diagram. The id must be unique, short, and snake_case. Do NOT create a node if a similar one already exists.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Unique snake_case identifier for this node (e.g. 'auth_service'). Must not already exist in the graph.",
        },
        label: {
          type: "string",
          description:
            "Human-readable label shown on the diagram (1–4 words, concise).",
        },
        shape: {
          type: "string",
          enum: ["rectangle", "circle", "diamond"],
          description:
            "Visual shape. Use 'circle' for databases/caches/queues, 'diamond' for decision points, 'rectangle' for everything else.",
        },
        layer: {
          type: "string",
          enum: ["edge", "application", "data", "observability"],
          description:
            "Architecture layer. Required for architecture diagrams. Omit for flowcharts/concepts.",
        },
        column: {
          type: "number",
          description:
            "Column index (0-indexed) within the layer. Optional — omit to let the layout engine decide.",
        },
        fill: {
          type: "string",
          description:
            "Background fill color override. Use only when the user explicitly requests a color or when color is semantically meaningful (e.g. 'green' for success/yes, 'red' for failure/no, '#f97316' for warning). Accepts CSS named colors or hex values.",
        },
        color: {
          type: "string",
          description:
            "Text color override. Defaults to dark (#1f2937) when not set. Only set if the user explicitly asks for it.",
        },
      },
      required: ["id", "label", "shape"],
      additionalProperties: false,
    },
  },
};

const updateNodeTool: GroqTool = {
  type: "function",
  function: {
    name: "updateNode",
    description:
      "Updates an existing node. Provide only the fields that need to change. At least one of label, shape, layer, or column must be provided.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The existing node id to update.",
        },
        label: {
          type: "string",
          description: "New label (1–4 words).",
        },
        shape: {
          type: "string",
          enum: ["rectangle", "circle", "diamond"],
          description: "New shape.",
        },
        layer: {
          type: "string",
          enum: ["edge", "application", "data", "observability"],
          description: "New architecture layer.",
        },
        column: {
          type: "number",
          description: "New column index.",
        },
        fill: {
          type: "string",
          description:
            "New background fill color. Use when the user requests color changes (e.g. 'make Yes green', 'color the error node red'). Accepts CSS named colors or hex values.",
        },
        color: {
          type: "string",
          description: "New text color. Only set if explicitly requested.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
};

const deleteNodeTool: GroqTool = {
  type: "function",
  function: {
    name: "deleteNode",
    description:
      "Deletes a node and all its connected edges. Use this to remove a component from the diagram.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The node id to delete.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
};

const createEdgeTool: GroqTool = {
  type: "function",
  function: {
    name: "createEdge",
    description:
      "Creates a directed edge between two existing nodes. The returned edgeId is needed to delete this edge later.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Source node id.",
        },
        to: {
          type: "string",
          description: "Target node id.",
        },
        bidirectional: {
          type: "boolean",
          description:
            "Set to true only when the relationship is explicitly two-way. Default: false.",
        },
        dashed: {
          type: "boolean",
          description:
            "Set to true for optional, async, or secondary relationships. Default: false.",
        },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
};

const deleteEdgeTool: GroqTool = {
  type: "function",
  function: {
    name: "deleteEdge",
    description:
      "Deletes an edge by its unique edgeId. Use the edgeId returned by createEdge, or the edgeId from the current graph state.",
    parameters: {
      type: "object",
      properties: {
        edgeId: {
          type: "string",
          description: "The unique edge id to delete.",
        },
      },
      required: ["edgeId"],
      additionalProperties: false,
    },
  },
};

const moveNodeToClusterTool: GroqTool = {
  type: "function",
  function: {
    name: "moveNodeToCluster",
    description:
      "Moves a node to a different architecture layer. Only valid in architecture diagrams.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Node id to move.",
        },
        layer: {
          type: "string",
          enum: ["edge", "application", "data", "observability"],
          description: "Target layer.",
        },
      },
      required: ["id", "layer"],
      additionalProperties: false,
    },
  },
};

const finishTool: GroqTool = {
  type: "function",
  function: {
    name: "finish",
    description:
      "Call this when you have finished making all required changes to the diagram. Do NOT make any more tool calls after this.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "A one-sentence summary of what you changed (e.g. 'Added Redis cache node and connected it to the API service').",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
};

// ─── Exported registry ────────────────────────────────────────────────────────

export const AGENT_TOOLS: GroqTool[] = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  moveNodeToClusterTool,
  finishTool,
];

export const TOOL_NAMES = {
  CREATE_NODE: "createNode",
  UPDATE_NODE: "updateNode",
  DELETE_NODE: "deleteNode",
  CREATE_EDGE: "createEdge",
  DELETE_EDGE: "deleteEdge",
  MOVE_NODE: "moveNodeToCluster",
  FINISH: "finish",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
