# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Draw-Anything** is a collaborative whiteboard / diagramming app: Next.js 15 (App Router), React 19, TypeScript, Tailwind 4. Real-time editing runs on Liveblocks, persistence and users on Convex, auth on Clerk. It has a custom orthogonal arrow-routing engine (`core/routing`) and an AI diagram generator built as a LangGraph multi-agent pipeline (`features/ai/server`).

## Commands

```bash
npm run dev              # Dev server (Turbopack was removed from the script)
npm run build
npm run lint             # next lint
npx tsc --noEmit         # Type check

npx vitest run                       # All unit tests (there is no `npm run test` script)
npm run test:browser                 # Real-Chrome text checks (excluded from the line above)
npx vitest run <file>                # One file
npx vitest run -t "<test name>"      # One test by name

npx convex dev           # Convex dev server; regenerates convex/_generated
npx convex deploy
```

Tests live next to source (`*.test.ts`) under `core`, `features`, `lib`. `vitest.config.ts` maps the `@/` alias. They are pure-logic tests (no DOM or React renderer is installed): hooks and components are covered through the pure modules they delegate to, so browser behaviour still needs a manual check. `package-lock.json` is out of sync with `package.json` (`npm ci` fails; use `npm install`). `npm run lint` reports 32 errors, all in `features/dashboard` and `hooks/use-api-*` and none introduced here (46 before the reliability work); `next build` needs `NEXT_PUBLIC_CONVEX_URL` and Clerk keys set to prerender.

## Architecture

### Directory layout
- `app/` — routes: `(main-page)` dashboard/billing/org creation, `whiteboard/[id]` editor, `api/` (AI generation, Liveblocks auth), `actions/` server actions. The Clerk webhook lives in `convex/http.ts` only.
- `features/` — feature modules: `whiteboard` (editor UI + hooks), `dashboard`, `billing`, `ai` (client types/schemas + `server/` pipeline), `diagram-code` (text DSL ⇄ canvas).
- `core/` — framework-free engine code: `shapes` (shape registry, per-shape definition/render/hit-test), `routing`, `arrow` (React hook bridging elements → routing), `anchors`, `snap`, `collision`. `shapes/base/resize-box.ts` is the one resize implementation; shapes must delegate to it.
- `convex/` — schema and queries/mutations. `liveblocks.config.ts` — Liveblocks room types and hooks.

### Whiteboard data flow
- **Liveblocks storage is the live document**: `elements: LiveList<LiveObject<DrawingElementJson>>`, plus presence (cursor, selection, pencil draft). See `liveblocks.config.ts`.
- **Convex `whiteboards.content`** is a JSON snapshot. On load, `use-whiteboard-page-controller.ts` seeds an empty Liveblocks room from it and restores the viewport; `features/whiteboard/hooks/data/use-whiteboard-auto-save.ts` writes it back.
- **Authorization** is one rule: the whiteboard's creator, or a member of its organization (`convex/lib/accessRules.ts`, enforced by `convex/lib/access.ts` in every whiteboard/AI-frame/memory function). Non-members get nothing (there is no share-link feature). `app/api/liveblocks-auth/route.ts` applies the same rule through `lib/authz/room-access.ts` and fails closed. Convex auth uses the Clerk JWT template named `convex` (`convex/auth.config.ts`); org-wide access needs an `org_id` claim in it. Users are created by the Clerk webhook in `convex/http.ts` and on client login (`users.storeUser`). Deploy Convex before the app when changing these rules.
- **Autosave** is `data/autosave-controller.ts` (pure: whole-board change detection, single flight, debounce + max wait, retry with backoff, stops on permission errors, flushes on hide/unmount) driven by `use-whiteboard-auto-save.ts`. It does not run until the Liveblocks room has been seeded from the stored snapshot (`seedState`), so a not-yet-synced empty board never overwrites stored content; unparseable stored content (`saved-content.ts`) is left alone.
- **Undo**: every drag/resize/erase/draw gesture is bracketed by `beginGesture`/`endGesture` (`interaction/gesture-history.ts`, an idempotent wrapper around Liveblocks `history.pause/resume`) so it is one undo step.
- **Canvas input**: `whiteboard-canvas-stage.tsx` uses pointer events with pointer capture (primary button/pointer only); selection rules are in `interaction/selection.ts`; Escape runs `cancelDrawing` before clearing the selection. Connector-handle arrows are built by `interaction/connector-arrow.ts` and routed through the same obstacle-aware router as drawn arrows. Unfilled `isGuide` rectangles (AI group frames) are hit-tested on their border only.
- **Router** (`core/routing`): the per-edge search tries fixed path shapes, then `grid-route.ts` (a deterministic Hanan-grid search around obstacles), and only then accepts a path through a node. `pinPathEndpointStubs` must never overwrite a real bend with the stub point (it once sent connectors straight through other rows).

### Text (`core/text`)
One typography source (`typography.ts`: font stack, line height 1.2, `makeFontString`); canvas drawing, measuring and both DOM editors read it, so entering edit mode moves nothing. Shape-label layout (`label-layout.ts: layoutShapeLabel`) is computed in world units and only scaled by zoom afterwards, so a label wraps the same at every zoom; `measureShapeLabel`/`renderShapeLabel` are the screen-space adapters. Wrapping code takes a `MeasureContext` (`font` + `measureText`), so tests and the server can pass a double. `estimate.ts` sizes text without a canvas (AI compiler, tests); it is an estimate of Inter, not real metrics. `resizeText` takes its size from the already-measured `originalBounds`; do not re-measure there. Canvas text sits on the CSS first baseline (`baseline.ts`); both editors' styles live in `shape-label-editor-style.ts` / `text-block-style.ts` and `label-region.ts` is the one place that says where a label goes (semantic nodes keep theirs beside the icon). **The app does not load Inter**, so users get their system font, whose widths are not linear in size; exact zoom and resize behaviour is only guaranteed for Inter (see the spec). Text tests: `core/text/*.test.ts`; real-Chrome checks (canvas vs editor pixels, caret, IME, estimator accuracy) run with `npm run test:browser` (system Chrome via `playwright-core`; skips if none, set `CHROME_PATH`; `tests/browser/fixtures` holds Inter for the tests). Design: `docs/superpowers/specs/2026-10-15-text-foundation-design.md`.

### Icons (`core/icons`)
`registry.ts` is the only icon source: `iconForNode(element.ai)` = valid `ai.icon`, else `ai.semanticKind`, else generic (old boards need no migration). Vendor words are aliases of neutral ids; add icons with `registerIcon`. Glyph paths are vendored lucide (ISC) generated by `scripts/generate-icon-glyphs.mjs` into `glyphs.ts` (never edit by hand; keep each shape a separate path string). `draw.ts` draws the tile at any zoom and falls back to a text badge. Icon geometry still belongs to `core/text/label-region.ts`. Design: `docs/superpowers/specs/2026-10-16-icon-system-design.md`.

### AI diagram agent (`features/ai/diagram-agent`)
An alternative to the 12-agent workflow, selected with `AI_PIPELINE=agent` (default `legacy`; `pipeline.ts`). One loop (`agent-loop.ts`): the model writes diagram code (the `features/diagram-code` DSL) and may call three string-only tools: `search_icons` (`core/icons/registry.ts: searchIcons`), `check_diagram` (parse + layout dry-run + design lint: `tools/check-diagram.ts`, `tools/lint.ts`) and `finish`. Two interchangeable transports (`transports/`): `native` (LangChain `bindTools`, groq/openai/anthropic/openrouter/local) and `text` (a lenient `<tool name=...>` + fenced-code protocol, always for Gemini and the automatic fallback when a provider rejects `tools`); `AI_AGENT_TRANSPORT=native|text` forces one. Tool calling here is plain-string arguments with server-side lenient validation, so the "no provider-native structured output" rule above still holds. Any parseable draft is kept; only "nothing readable was ever produced" throws. `run.ts` emits the same `AIStreamEvent` contract as the legacy workflow (frame.created -> phase.* -> element.batch -> frame.done), so the client and route handler are unchanged. Prompts: `prompt/` (system prompt, per-diagram-type playbooks, worked examples that tests assert parse and lay out cleanly). Quality is measured, not claimed: `npm run eval:ai` (live provider calls, needs keys in `.env.local`; `AI_EVAL_PROVIDERS`, `AI_EVAL_TRANSPORTS`, `AI_EVAL_LEGACY=1`, `AI_EVAL_LIMIT`) writes `docs/superpowers/reports/ai-eval-<date>.md`. Design: `docs/superpowers/specs/2026-10-16-ai-diagram-agent-design.md`.

### Canvas interaction (`features/whiteboard`)
Logic lives in pure, tested modules; hooks only wire them. Shortcuts: `hooks/interaction/keyboard-policy.ts` (`resolveShortcut`; nothing fires while typing, read-only viewers get no editing commands), dispatched by `use-whiteboard-keyboard.ts` and `runShortcut` in the controller. Viewport: `utils/viewport-math.ts` (cursor-anchored zoom, fit capped at 100%, plain wheel pans, Ctrl/Cmd+wheel zooms; the wheel listener is native and non-passive because React's `onWheel` cannot `preventDefault`). Dragging: `interaction/drag-session.ts` (`computeDrag`: position = origin snapshot + total pointer travel, snapped to other shapes' edges/centres within 6 screen px, Alt disables; guides drawn by `utils/draw-guides.ts`). Copy/paste/duplicate/nudge/align/distribute/z-order: `utils/arrange.ts` + `utils/clipboard.ts` through `use-element-commands.ts`, each a single batched Liveblocks mutation (`addElements`/`updateElements`/`reorderElements`, one undo step; array order is z-order). Pasted copies drop `ai.semanticId/frameId/generationId`. Minimap: `utils/minimap-math.ts` + `components/canvas/minimap.tsx`. The whiteboard route cannot be run without Clerk and Convex, so wiring (pointer events, mutations, context menu) is verified only by type check/lint/build; the pure modules are unit tested and `tests/browser/canvas-ux.browser.test.ts` checks the math on a real canvas. Design: `docs/superpowers/specs/2026-10-16-canvas-ux-design.md`.

### Shapes
`core/shapes/<shape>/` each export a definition built with `createShapeDefinition` (bounds, hit-test, resize handles, canvas render, anchors). They are registered in `core/shapes/register-shapes.ts` / `shape-registry.ts`; add new shapes there.

### Routing engine (`core/routing`)
Public API is `orthogonal-router.ts` (`routeArrowPoints`, `routeArrowBatch`); `route-engine.ts` (`routeWithEngine`) runs the pipeline:
1. Sanitize inputs (`routing-guards.ts`: `sanitizeEdges`, `sanitizeObstacles`, `isFullyConnectedEdge`)
2. Dirty tracking against `RouteEngineState` (route cache, path-hash cache, congestion map). An edge is re-routed if marked dirty, uncached, or its hash (endpoints, handles, mode, existing points, obstacle layout) changed. The engine routes whatever subset it is given and never infers deletions; the state's owner calls `pruneRouteEngineState(state, liveArrowIds)` (the hook does, on every `elements` change)
3. Parallel-edge offsets (`parallel-edge-manager.ts`)
4. Per-edge A* obstacle avoidance + candidate scoring (`obstacle-avoidance.ts`, `path-scoring.ts`, `congestion-map.ts`)
5. Segment conflict resolution (`segment-conflict-resolver.ts`, spatial index)
6. Lane assignment (`lane-manager.ts`) and crossing minimization (`crossing-minimizer.ts`)
7. Normalization (`path-normalizer.ts`) and endpoint stabilization to connection handles

`routingMode: "straight"` arrows bypass stages 6–7 (they would otherwise be forced to Manhattan geometry). `normalizeRoutes` checks crossings per arrow via `createCrossingCounter` (one grid, no map clones); do not reintroduce a whole-graph `countTotalCrossings` per arrow.

`core/arrow/use-arrow-connections.ts` feeds it from React: it only routes descriptors passing `isRouteDescriptorReady` (arrows mid-drag can lack `sourceId`/`targetId`/points), and keeps a second module-level cache, `globalPathCache` (`path-cache.ts`), keyed by arrow id + rounded endpoints + obstacle signature.

Rule: always guard points with `isValidPoint` / `toValidPoint` from `routing-guards.ts` before reading `.x`/`.y`. Routing must fall back to a straight path, never throw.

Point = `{ x, y }`; ConnectionHandle = `"top" | "right" | "bottom" | "left"`; descriptor type is `RouteArrowDescriptor` in `orthogonal-router.ts`.

### AI diagram generation (`features/ai/server`)
- Client (`features/whiteboard/hooks/controller/use-ai-generation.ts`) POSTs to `/api/ai/generate-diagram` and reads a Server-Sent Events stream. It also records frame progress in Convex (`convex/aiFrames.ts`).
- `workflow.ts` builds a LangGraph `StateGraph`: contextRetriever → architecturePlanner → domainModeler → infrastructureExpander → relationshipAgent → diagramComposer → layoutAgent → validationAgent → criticAgent → (one optional expansion loop back to relationshipAgent) → repairAgent → canvasCompiler. Agents are in `agents/`, prompts in `prompts/`, deterministic helpers in `tools/`.
- Agents emit `AIStreamEvent`s in their state updates; the route forwards them and also emits v1 compatibility events (`sse.ts`).
- The route (`app/api/ai/generate-diagram`) requires a Clerk session, validates and size-limits the body (`request-guard.ts`), allow-lists the provider, rate limits per user (in memory, per server instance; `AI_RATE_LIMIT_MAX` default 10 per `AI_RATE_LIMIT_WINDOW_MS` default 10 min), and shows clients only generic error text. `GET` on the same path lists the providers that have keys configured; the UI offers only those. Logic is in `generate-diagram-handler.ts` because route files may only export HTTP handlers.
- Structured model output works the same for every provider: the JSON Schema (`z.toJSONSchema`, `buildJsonInstruction`) goes in the prompt, the reply is read as plain text (`createPromptedStructuredModel`, `json-extract.ts: parseModelJson`) and normalised leniently (`schemas.ts`: clamps to `MAX_GRAPH_*`, drops unusable items with warnings, throws only if no node survives), with one corrective re-ask for unreadable *or* unusable answers (`agents/types.ts: callStructuredNormalized`). **Do not use a provider's native `withStructuredOutput`** (tool calling, Groq strict `json_schema`): it validates against the strict Zod schema before the normaliser runs and turned every null/over-long field into a failed generation. Do not reintroduce strict `.parse()` of model output. Unreadable replies are logged with the model's own text (`[callStructured] … gave no readable JSON`). The critic's layer-completeness rules apply to `architecture` diagrams only.
- `canvas-compiler.ts` is a pipeline: `prepareDiagram` (node sizes from labels via `core/text/node-size.ts`, cycle-aware layers, group paths, gaps) -> a `PlacementEngine` (`layout/layered-placement.ts`: components laid out separately, `layered-order.ts` barycentre sweeps with nested groups kept adjacent, row heights from the tallest node, room between same-row neighbours for edge labels, `group-separation.ts` moves strangers out of group frames) -> `buildCanvas` (frames, routing through `core/routing`, `layout/bus.ts` shared bus levels for fan-out/fan-in, `layout/edge-labels.ts` collision-free label placement). Node height is dynamic (min 78, 92 for decisions); never reintroduce a fixed height. `compileAIDiagramDetailed` returns diagnostics (colliding labels, dropped groups, unfitted nodes, layout fallback to `grid-placement.ts` if an engine throws). `pins` keep user-dragged nodes in place when diagram code is re-applied (`features/diagram-code/pins.ts`). Group frames and edge labels are `isGuide` elements with `ai.role`; a frame is omitted rather than drawn over a non-member. Quality is measured by `layout/metrics.ts` (geometry only); `layout/benchmark/` compares the engine with ELK.js (dev dependency, not used in production) and asserts the guarantees. Decision and numbers: `docs/superpowers/reports/2026-10-16-layout-benchmark.md`. Measurement contract (world vs screen, estimator vs browser, Geist is DOM-UI only) is in the Sub-project B spec.
- `features/diagram-code` is an Eraser-inspired text DSL (not claimed compatible): `parseDiagramCode`, `serializeDiagramCode`, `elementsFromDiagramCode`, `graphFromElements`. Edited from the AI panel's Code tab; applying it to an existing diagram is one undo step.
- `model-providers.ts` picks the LLM from the request's `provider`: gemini (default), groq, openai, anthropic, openrouter, local. Each reads `<PROVIDER>_API_KEY` and an optional `<PROVIDER>_MODEL` override (`LOCAL_AI_*` for local).

## Environment Variables (`.env.local`)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  CLERK_SECRET_KEY=  CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CONVEX_URL=  CONVEX_DEPLOY_KEY=
LIVEBLOCKS_SECRET_KEY=  NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=
GEMINI_API_KEY=  GROQ_API_KEY=  OPENAI_API_KEY=  ANTHROPIC_API_KEY=  OPENROUTER_API_KEY=   # at least one
# optional: AI_PIPELINE (legacy|agent), AI_AGENT_TRANSPORT (native|text), AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS, GEMINI_MODEL, GROQ_MODEL, OPENAI_MODEL, ANTHROPIC_MODEL, OPENROUTER_MODEL, LOCAL_AI_BASE_URL/MODEL/API_KEY
```

## Git
- PRs target `main`; conventional commits preferred.
- Run `npm run lint` and `npx vitest run` before committing.
- `AGENTS.md` is an old task prompt (routing crash fix + perf upgrades), not current guidance.
