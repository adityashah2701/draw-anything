# E1: AI diagram agent (spec, for review)

Status: **implemented behind `AI_PIPELINE=agent` (default legacy); not yet evaluated against live providers**. Not implemented: canvas-aware editing (the client only appends elements, so passing the existing diagram would draw a duplicate; needs a replace path like the Code tab). Layout direction (LR) is E2. Sub-projects: E1 (this), E2 visual output, E3 incremental canvas/shape-model rewrite. Order agreed: E1 -> E2, E3 incrementally behind a versioned element format.

## Problem (observed)
- Generation is a 12-agent LangGraph chain (`features/ai/server/workflow.ts`): planner -> domain modeler -> infrastructure expander -> relationship -> composer -> layout -> validation -> critic -> repair -> compiler. Every hop passes strict JSON that a model can only get wrong, and a weak model (Groq) fails or flattens the result.
- Hard-coded quality rules in prompts ("EXACTLY 8-15 nodes", fixed kind lists) replace judgement; the same chain runs for a 4-box flowchart and a 40-service platform.
- No real tool calling: the model never looks anything up (icons, layout feedback); the pipeline only "validates" afterwards.
- Result in the user's screenshot: tiny uniform nodes, long corridor connectors, labels on lines, no visual hierarchy.

## What Eraser does (from the user's screenshot and Eraser's public docs; no Eraser code was inspected)
One model pass produces a compact **diagram-as-code** description; a deterministic engine does layout, icons and styling. The model decides *what the diagram says* (groups, tiers, icons, which edges carry labels), never coordinates.

## Design
**One agent loop, not a pipeline** (`features/ai/diagram-agent/`):
1. System prompt = a designer's playbook per diagram type (architecture: actors/entry left, tiers as groups, data stores last, <= one label per edge only when it adds information; flowchart: one start, decisions with labelled branches, top-down; ...) + two or three worked DSL examples + the icon vocabulary the registry actually has. Sizes are not capped by a number: the prompt asks for the smallest diagram that is complete for the request.
2. The model writes **diagram code** (the existing `features/diagram-code` DSL, extended with `icon:`, `direction:`, group `kind:`). Text in, text out: the form models are best at, already lenient-parsed.
3. **Tools (real function calling where the provider supports it, else the same protocol as plain text):**
   - `search_icons(query) -> [{id, category}]` (icon registry; vendor words resolve through aliases).
   - `check_diagram(code) -> {errors, warnings, metrics}`: parse issues, orphans, unknown icons, plus a dry-run of the layout engine (crossings, longest edge, label collisions, density) so the model sees what the picture will be.
   - `finish(code)`: ends the loop.
   Tool arguments are a single string (`code`/`query`). **No provider-native structured output** (project rule in CLAUDE.md: it rejected null/over-long fields and failed whole generations); validation stays server-side and lenient.
4. Loop budget: at most 4 model turns; if the model never calls `finish`, the last parseable code is used (never fails if any version parsed). Providers without tool calling run the same loop in text mode (model emits a fenced code block; server replies with the check result).
5. The result goes through the existing compile path (prepare -> layout -> route -> label placement) and the existing SSE events (phase events are mapped, so the client UI is unchanged).

**Compatibility:** new pipeline behind `AI_PIPELINE=agent|legacy` (default `legacy` until the eval below passes, then the 12-agent chain and its prompts/tools are deleted). Stored boards, providers, API-key handling and the request/response contract do not change. Groq, Gemini, OpenAI, Anthropic, OpenRouter and local models all use the one loop.

**Evaluation (what "better" means, measured):** a golden set of ~12 prompts (architecture, flowchart, CI/CD, auth, IoT, mind-map...). For each run: DSL parses, no orphans, icon coverage (share of nodes with a non-generic icon), crossings and longest edge from `layout/metrics.ts`, label collisions, node count relative to a per-prompt expected range. Offline tests use a scripted fake model for the loop logic; a script `npm run eval:ai` runs the real providers with the user's keys (the agent cannot, keys are server-side). No claim of improvement is made without those numbers.

## Risks / not decided
- Whether Groq's current default model (`openai/gpt-oss-120b`) does reliable tool calling is not verified here; the text-mode fallback exists for that reason, and the eval will say which mode wins per provider.
- Real vendor logos (AWS/Azure/GCP) are a licensing and bundle decision for E2; E1 only uses the existing registry ids.

## Out of scope for E1
Node/edge rendering, routing and label placement (E2); element model and shape registry (E3).
