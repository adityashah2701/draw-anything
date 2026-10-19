# Plan: one stateful canvas agent, one conversation per board

Repo: `adityashah2701/draw-anything` @ `39e3a68`. Nothing in the code has been changed; this is a plan only.

## 1. What exists today

Two separate AI systems share one side panel and a tab switch.

| | Generate (legacy) | Edit board (canvas agent) |
|---|---|---|
| Entry | `ai-panel.tsx` tab "Generate" → `useAIGeneration.triggerAIGeneration` | tab "Edit board" → `useCanvasAgent.send` |
| Server | `POST /api/ai/generate-diagram` streams SSE from `features/ai/diagram-agent` / `features/ai/server/workflow` (pipeline picked by `AI_PIPELINE`: legacy, agent, builder) | `POST /api/ai/canvas-agent` = one stateless model turn (`agent/handler.ts`), tool calls validated server-side |
| Loop | server-side, owns the model calls and the graph | browser-side (`run-agent.ts`): ask server for a turn, run calls on the live board through `ToolExecutor`, post results back |
| Board writes | compiles a graph into elements (`canvas-compiler`), streamed into the editor | the editor's own command planners; one undo step per tool call |
| State | `aiMessages` in React state, wiped on every new generation (`setAiMessages([])`) | `messages` + `historyRef` (last 30 messages) in React state, wiped by Clear or reload |
| Persistence | Convex `aiFrames`, `aiFrameCheckpoints` | none |

Findings that shape the plan:

1. **Neither conversation survives a reload or is shared.** Both live in hooks (`use-ai-generation.ts`, `use-canvas-agent.ts`). The panel has two transcripts that cannot see each other.
2. **`aiMemories` and `aiDecisions` are dead storage.** `createMemory`, `listByWhiteboard` (aiMemory) and `createDecision`, `listDecisionsByFrame` have no callers outside `convex/` (only `aiFrames:create` is faked in the browser test backend). Only `aiFrames` is actually written, by `use-ai-generation.ts`.
3. **The canvas agent already has what a unified agent needs:** typed tools in groups (inspect, create, connect, edit, arrange, organize, document), a server-written system prompt, per-turn auth and board access check (`decideRoomAccess`), rate limiting, a stall guard, confirmation for destructive steps, and a scripted-model test harness (`agent/test-support.ts`, `scenarios.test.ts`). It lacks a "draw a whole new diagram from a description" capability and any memory.
4. **The generator already has what the agent lacks:** diagram-type planning, semantic layout, validation and critic passes (`features/ai/server/agents/*`, `features/ai/diagram-agent/tools/check-diagram.ts`, `lint.ts`).
5. Provider list is duplicated: `PROVIDER_OPTIONS` in `ai-panel.tsx`, `getEnabledProviders` in `request-guard.ts`, and the `provider` enum in `agent/types.ts`. The panel fetches availability from `GET /api/ai/generate-diagram`, so that route cannot be deleted without moving that endpoint.

## 2. Target design

**One agent, one loop, one transcript per board.** The canvas agent loop becomes the only agent. Diagram generation becomes a *tool* it can call, not a separate mode.

```
Panel (single chat) ── useBoardAgent ──► /api/ai/canvas-agent (one turn, stateless, auth'd)
        ▲                    │                       │ reads/writes conversation + memory in Convex
        │ live query         ▼
 Convex aiConversations   ToolExecutor ► editor host (undo, locks, selection)
 aiMessages / aiMemory         │
                               └► generate_diagram tool ► existing diagram pipeline (server) ► compiled elements ► host
```

Keeping the loop in the browser is deliberate and stays: tools must run against the live editor state (selection, viewport, undo) and only the browser has that. The server stays stateless per turn for model calls; persistence is added around it.

### 2.1 Generation as a tool

- New tool `generate_diagram` in a new `generate` group (off by default, suggested by `suggestGroups` for "draw / build / design / generate / diagram" words, which it already matches).
- Arguments: `description`, optional `diagram_type`, `placement` (`new_area` | `replace_selection` | `below_existing`), `edit_existing` flag.
- Execution: the browser calls a new internal route (`/api/ai/generate-diagram` reused, or a thin `/api/ai/canvas-agent/generate`) that runs the chosen pipeline, then applies the compiled elements through the same host patch path used by the other create tools. That gives it undo, locks and the revision check for free, which the legacy streaming path does not have.
- The result is a normal `ToolResult` (created ids, counts, validation warnings from `check-diagram`), so the model reports what really happened and can follow with `edit`/`arrange` tools.
- Streaming progress ("placing nodes…") is kept as optional `onProgress` events on the tool, shown in the same step row.
- `AI_PIPELINE` keeps selecting legacy/agent/builder underneath; no pipeline rewrite in this refactor.

### 2.2 Persistence: one conversation per board

Replace `aiFrames` / `aiFrameCheckpoints` / `aiMemories` / `aiDecisions` with a smaller set (see §3):

- `aiConversations`: exactly one row per `whiteboardId` (unique by index), holds a rolling summary and a pointer to the latest message.
- `aiMessages`: append-only log (user / assistant / tool turns in the existing `CanvasMessage` shape, plus UI fields already in `AgentUiMessage`).
- `aiMemories` kept but reshaped as board-scoped facts (see §4) and actually wired.

Access: same rule as comments, `getAccessibleWhiteboardByRawId` for read, edit access for append. Everyone with edit access shares one conversation (matches "one conversation per board"); each message records `authorId` so the panel can show who asked.

### 2.3 State the agent carries between turns

- **History window**: send the last N messages (today 30 in `historyRef`) plus the conversation's rolling summary as a server-written block in the system prompt. The summary is regenerated server-side when the log exceeds a threshold, so the browser never sends the whole log (the request already caps at 80 messages / 150k chars).
- **Board facts**: a compact memory block (diagram type, naming conventions, user corrections such as "never use red") from `aiMemories`, injected by `buildSystemPrompt`. Treated as data, with the same "never instructions" rule the prompt already applies to board content.
- **Undo linkage**: each assistant run stores the start/end revision (`revisionOf`) so "Undo this run" survives reload where the board history still allows it, and degrades to a message when it does not.
- **Concurrency**: one run at a time per board. Take a lightweight lease on `aiConversations` (`runningBy`, `leaseUntil`) so two collaborators cannot interleave runs; the second sees "Aditya's request is running".

### 2.4 UI

- Delete the Generate/Edit tab switch; `ai-panel.tsx` renders one `ConversationView` fed by the Convex query, with an input and provider select.
- Merge `canvas-agent-view.tsx` and `ai-timeline.tsx` rendering into one step list (tool rows already carry ok / changed / skipped / warnings; generation progress becomes a tool row with a live label).
- Examples become one list (draw something, change something).
- "Edit current diagram" checkbox goes away: the agent decides from `get_document_state` whether it is editing or drawing new.
- Remove `useAIGeneration` from `use-whiteboard-page-controller.ts` once its non-agent consumers (code panel entry, fit-to-view) are re-pointed; "Open as code" and "Fit to view" move to buttons on the generate tool's result row.
- `ai-panel.tsx` currently also owns provider fetching; move that to a small `useAIProviders` hook backed by one shared constant.

## 3. Convex schema changes

Additive first, destructive later, so a rollback is possible.

```ts
aiConversations: defineTable({
  whiteboardId: v.id("whiteboards"),
  summary: v.optional(v.string()),        // rolling summary of older messages
  messageCount: v.number(),
  runningBy: v.optional(v.id("users")),   // run lease
  leaseUntil: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_whiteboardId", ["whiteboardId"]),

aiMessages: defineTable({
  conversationId: v.id("aiConversations"),
  seq: v.number(),                        // monotonic per conversation
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool"), v.literal("status")),
  authorId: v.optional(v.id("users")),    // set for user messages
  content: v.string(),
  toolCalls: v.optional(v.any()),         // CanvasToolCall[]
  toolResult: v.optional(v.any()),        // trimmed ToolResult summary for the UI
  runId: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_conversation_seq", ["conversationId", "seq"]),
```

- `aiMemories` is reshaped: `whiteboardId: v.id("whiteboards")` (it is `v.optional(v.string())` today), `kind` (`preference` | `fact` | `correction`), `text`, `sourceMessageId`. Keep `by_whiteboardId`; drop `by_userId`/`by_orgId`/`by_sourceFrameId` and the `payload: v.any()` blob.
- `aiFrames`, `aiFrameCheckpoints`, `aiDecisions`: stop writing in phase 3, migrate or drop in phase 5. Their only writer is `use-ai-generation.ts`, so nothing else depends on them. Decide whether finished frames are worth converting into messages (see open questions).
- Retention: cap messages per conversation (e.g. keep last 500, older ones folded into `summary`) with a scheduled Convex cleanup, so a board cannot grow unbounded.
- New modules: `convex/aiConversation.ts` (`get`, `append`, `acquireRun`, `releaseRun`, `compact`) replacing `aiFrames.ts`; `convex/aiMemory.ts` rewritten around the new shape. The existing `loadOwnedFrame` ownership check disappears in favour of board access checks.

## 4. Memory: what gets remembered

Dead code today, so this needs a real definition:

- Written by a `remember` tool (explicit: "always use blue for databases") and by a server-side extractor over user corrections after a run. Start with the explicit tool only; add the extractor later if the explicit one proves too rare.
- Capped (e.g. 20 per board, newest wins, user can delete from the panel).
- Never stores board content or secrets; only short user-stated preferences.

## 5. Server changes

- `agent/types.ts`: the request gets no conversation id. The server resolves the conversation from `whiteboardId` after the existing access check, so the browser cannot name another board's conversation. The request still carries only the recent window.
- `agent/handler.ts`: after `checkBoardAccess`, load summary + memories via a server Convex client (same `ConvexHttpClient` + `getToken({template:"convex"})` pattern the route already uses) and pass them into `buildSystemPrompt`.
- `agent/prompt.ts`: add a "Board memory" and "Conversation so far" section; add rules for `generate_diagram` (use it for new diagrams, not for small edits; check the result).
- `agent/groups.ts`: add the `generate` group and keyword rule.
- `registry.ts` / `tools/`: add `tools/generate.ts` and `tools/memory.ts` with schemas and tests in the existing style.
- `TOOL_GROUPS` in `features/canvas-tools/types.ts` gains `generate`.
- Keep `/api/ai/generate-diagram` working until phase 4 so rollout can be flagged.

## 6. Phased rollout

Each phase is a PR that leaves the app working.

1. **Persistence only (no behaviour change).** Add `aiConversations` / `aiMessages` and the Convex module; make `useCanvasAgent` write and read them. Reload keeps the Edit-board transcript. Tests: Convex unit tests in the style of `comments.test.ts`; update `convex-backend.ts` fake.
2. **Generate as a tool.** Add `generate` group + `generate_diagram`, behind a flag (`NEXT_PUBLIC_UNIFIED_AGENT`). Scripted-model scenarios for "draw X", "draw X then rename a node", failure and abort mid-generation.
3. **One panel.** Remove tabs, merge views, stop calling `useAIGeneration` when the flag is on. Browser tests in `tests/browser/editor/` updated.
4. **Memory + summary + run lease.** `remember` tool, summary compaction, concurrency lease.
5. **Cleanup.** Flip flag on by default, delete `use-ai-generation.ts`, `ai-timeline.tsx` (if fully absorbed), legacy tables and `aiFrames.ts`; keep `GET` providers endpoint under a clearer name. Migration for existing `aiFrames` rows only if we decide to keep history.

## 7. Risks and decisions I would default on

- **Browser-side loop stays.** Moving the loop to the server would need a headless copy of the editor state and lose per-call undo; not worth it.
- **Generation latency inside a tool call.** A long pipeline run holds one agent step open. Mitigation: progress events, the existing abort signal, and a per-tool timeout; the stall guard in `run-agent.ts` already covers repeated failures.
- **Shared conversation + privacy.** Everyone who can edit the board can read the chat. I would make that explicit in the panel header.
- **Token growth.** The 30-message client window plus server summary keeps turns bounded; the 150k char guard in `handler.ts` stays as the hard stop.
- **Rate limiting.** The agent limiter is per turn (120 per 10 min); a generate call is one turn plus pipeline model calls that bypass it. Count pipeline calls against the generate limiter (10 per 10 min today) so the unified path is not a way around it.
- **Rollback.** Additive schema + feature flag until phase 5.

## 8. Questions before I write any code

1. Keep a history of old generated frames (`aiFrames`), or drop them? Default: drop; nothing reads them.
2. Should the conversation be shared by all editors of a board (my default), or per user per board?
3. The earlier open question about GLM via the NVIDIA API: `nvidia` is already a provider (`NVIDIA_API_KEY`, "Nemotron" label in the panel). Do you want GLM added as a model choice inside that provider, or as a separate one? It does not change this plan but touches `models.ts` and the panel list.
4. Start with phase 1 only, or phases 1 and 2 together?

Note: the repo's `AGENTS.md` currently describes an unrelated routing-engine crash fix and optimization task. I treated it as out of scope for this plan; say if it should be folded in.

---

## Status: phases 1 and 2 (implemented behind flags)

Decisions taken (from the project owner): keep `aiFrames` and import it rather than drop it; one conversation shared by everyone who can open the board, with a notice in the panel; GLM as a separate option inside the `nvidia` provider (not done yet, see below); phases 1 and 2 first, UI unification, run lease/summary compaction and cleanup after.

**Flags** (both default off; off = the previous behaviour, byte for byte at the API level)
- `NEXT_PUBLIC_UNIFIED_AGENT=1` (browser): the "Edit board" assistant stores its conversation in Convex, opens by default, shows the sharing notice, and enables the `generate` and `memory` groups.
- `AI_UNIFIED_AGENT=1` (server): `/api/ai/canvas-agent` offers those groups and puts the board's memory in the system prompt. With it off the groups are filtered out of tool specs, `enable_tools` and call checking.

**Phase 1: persistence** (`convex/aiConversation.ts`, `schema.ts`)
- `aiConversations` (one per board, holds the model-facing history, last 30 messages within 100k chars) and `aiMessages` (the transcript, newest 500 kept). Access is the board's own rule; `authorId` comes from the caller.
- `importLegacyFrames` copies each old `aiFrames` row as a prompt and an outcome line, once (`sourceFrameId`), and never modifies or deletes `aiFrames`. The hook calls it once per board load.
- Client: `use-canvas-agent.ts` reads the conversation with `useQuery`, appends after each run, restores the history for the next turn (`agent/history.ts`), and "Clear" clears the shared conversation.

**Phase 2: generation and memory as tools**
- `generate_diagram` (`tools/generate.ts`, group `generate`): the host runs the existing `/api/ai/generate-diagram` stream (`editor/generate-client.ts`), the tool places the final element set beside existing content as one patch (undoable, id collisions refused, nothing changes on failure). Cancellation uses the run's abort signal.
- `remember` (group `memory`): kind `preference | correction | decision | fact`, 3-300 characters, secrets refused, de-duplicated, at most 30 per board (`convex/aiMemory.ts`). Notes enter the prompt only as flattened `<board_memory>` data lines, with the rule that the live board and the current request win.
- Still to do from the plan: single unified panel (phase 3), run lease and summary compaction (phase 4), removing the legacy generate path and tables (phase 5, only after the import has been verified in production).

**NVIDIA GLM**: not wired. NVIDIA's catalog lists `z-ai/glm-5.1` and `z-ai/glm-5.2` on `https://integrate.api.nvidia.com/v1`, but no GLM tool-calling sample is published and this environment has no `NVIDIA_API_KEY` or route to the API, so neither the exact id nor tool calling could be checked against the provider. Before adding it to `model-providers.ts`/the selector, call `/v1/models` and one chat completion with a `tools` array using a real key.
