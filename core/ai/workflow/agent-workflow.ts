/**
 * core/ai/workflow/agent-workflow.ts
 *
 * The agentic Groq loop — the heart of the refactored AI integration.
 *
 * Architecture:
 * 1. Acquires a per-board mutex to prevent concurrent updates.
 * 2. Reconstructs the logical graph from existing CanvasElements.
 * 3. Runs an iterative Groq loop (max 6 iterations):
 *    a. First turn: tool_choice="required", full graph digest.
 *    b. Subsequent turns: tool_choice="auto", only structural diffs.
 *    c. "finish" tool call → normal termination.
 *    d. Text-only response → one retry with a clarification prompt.
 * 4. Returns the mutated AgentGraph for the layout engine to re-render.
 */

import Groq from "groq-sdk";
import type { AgentGraph, AgentWorkflowResult } from "@/core/ai/types";
import { GraphStore } from "@/core/graph/graph-store";
import { GraphMetadataRegistry } from "@/core/graph/graph-metadata";
import type { ReconstructableElement } from "@/core/graph/graph-metadata";
import { AGENT_TOOLS, TOOL_NAMES } from "@/core/ai/tools/tool-definitions";
import { executeToolCallBatch } from "@/core/ai/tools/tool-executor";
import {
  buildAgentSystemPrompt,
  buildAgentUserMessage,
  buildDiffSummary,
  buildGraphDigest,
  buildRetryMessage,
} from "@/core/ai/agent/agent-prompt";

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 6;
const WORKFLOW_TIMEOUT_MS = 45_000;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_TEMPERATURE = 0.1;

// ─── Per-board mutex ──────────────────────────────────────────────────────────
// Prevents concurrent agent loops from corrupting the same board's state.
// Keys are boardIds; values are a chained promise that acts as a queue.

const boardLocks = new Map<string, Promise<void>>();

async function acquireLock(boardId: string): Promise<() => void> {
  // Create a deferred that this lock holder will resolve when done
  let release!: () => void;
  const mySlot = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Chain behind any existing lock for this board
  const existing = boardLocks.get(boardId) ?? Promise.resolve();
  boardLocks.set(
    boardId,
    existing.then(() => mySlot),
  );

  // Wait for any preceding work to finish
  await existing;

  return () => {
    release();
    // Clean up if nobody else waiting
    // (if the chain was extended, the key will be overwritten anyway)
    if (boardLocks.get(boardId) === mySlot) {
      boardLocks.delete(boardId);
    }
  };
}

// ─── Message helpers ──────────────────────────────────────────────────────────

type Message = Groq.Chat.Completions.ChatCompletionMessageParam;

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  result: { ok: boolean; data?: unknown; error?: string },
): Message {
  const content = result.ok
    ? JSON.stringify(result.data ?? { ok: true })
    : JSON.stringify({ error: result.error });

  return {
    role: "tool",
    tool_call_id: toolCallId,
    content,
  };
}

// ─── Main workflow ────────────────────────────────────────────────────────────

export interface AgentWorkflowParams {
  prompt: string;
  boardId: string;
  /** CanvasElement[] received from the client (current diagram state) */
  currentElements: ReconstructableElement[];
  intent: "architecture" | "flowchart" | "concept";
  groqClient: Groq;
  /**
   * When the user has exactly one element selected, this is its logical node ID.
   * The agent will focus all operations on this node.
   */
  focusedNodeId?: string;
}

export async function runAgentWorkflow(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const {
    prompt,
    boardId,
    currentElements,
    intent,
    groqClient,
    focusedNodeId,
  } = params;

  // ── Acquire board lock ────────────────────────────────────────────────────
  const releaseLock = await acquireLock(boardId);

  // ── Setup timeout ─────────────────────────────────────────────────────────
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    WORKFLOW_TIMEOUT_MS,
  );

  let store: GraphStore;
  let bestStore: GraphStore; // last clean snapshot for timeout recovery

  try {
    // ── Reconstruct graph from canvas elements ────────────────────────────
    const registry = new GraphMetadataRegistry();
    store = registry.reconstruct(currentElements);
    bestStore = store;

    const initialGraph: AgentGraph = store.toAgentGraph();
    const graphDigest = buildGraphDigest(initialGraph);

    // ── Build initial conversation history ────────────────────────────────
    const messages: Message[] = [
      {
        role: "system",
        content: buildAgentSystemPrompt(graphDigest, intent, focusedNodeId),
      },
      {
        role: "user",
        content: buildAgentUserMessage(prompt, intent, focusedNodeId),
      },
    ];

    let iterations = 0;
    let didRetryTextResponse = false;
    let finished = false;
    let timedOut = false;

    // ── Agent loop ────────────────────────────────────────────────────────
    while (iterations < MAX_ITERATIONS && !finished) {
      if (abortController.signal.aborted) {
        timedOut = true;
        break;
      }

      // First turn: force a tool call to prevent Groq from just chatting.
      // Subsequent turns: auto (Groq may chain multiple tool batches).
      const tool_choice: Groq.Chat.Completions.ChatCompletionToolChoiceOption =
        iterations === 0 ? "required" : "auto";

      let response: Groq.Chat.Completions.ChatCompletion;
      try {
        response = await groqClient.chat.completions.create({
          model: GROQ_MODEL,
          temperature: GROQ_TEMPERATURE,
          max_tokens: 4096,
          messages,
          tools: AGENT_TOOLS,
          tool_choice,
        });
      } catch (err) {
        // Groq API error — break and return best store so far
        console.error("[agent-workflow] Groq API error:", err);
        break;
      }

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;

      // ── Case 1: No tool calls — text response ───────────────────────────
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        if (didRetryTextResponse) {
          // Already retried once — give up on this iteration
          break;
        }
        // Push the text response and ask Groq to use tools
        messages.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
        });
        messages.push({
          role: "user",
          content: buildRetryMessage(),
        });
        didRetryTextResponse = true;
        // Don't count this as a real iteration
        continue;
      }

      // Reset retry flag on successful tool use
      didRetryTextResponse = false;
      iterations += 1;

      // Push assistant message (with tool_calls) to history
      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      });

      // ── Case 2: "finish" tool called ────────────────────────────────────
      const finishCall = assistantMessage.tool_calls.find(
        (tc) => tc.function.name === TOOL_NAMES.FINISH,
      );

      // Execute all tool calls (including finish — executor acks it safely)
      const { results, finalStore, mergedDiff } = executeToolCallBatch(
        assistantMessage.tool_calls,
        store,
      );

      // Update store to the new version
      store = finalStore;
      bestStore = store; // record latest clean snapshot

      // Append tool result messages for Groq history
      for (const res of results) {
        messages.push(
          toolResultMessage(res.toolCallId, res.toolName, res.result),
        );
      }

      if (finishCall) {
        finished = true;
        break;
      }

      // ── Append diff summary for next iteration ──────────────────────────
      const diffSummary = buildDiffSummary(mergedDiff);
      if (diffSummary) {
        messages.push({
          role: "user",
          content: diffSummary,
        });
      }
    }

    clearTimeout(timeoutId);

    return {
      agentGraph: bestStore.toAgentGraph(),
      iterations,
      timedOut,
    };
  } finally {
    clearTimeout(timeoutId);
    releaseLock();
  }
}
