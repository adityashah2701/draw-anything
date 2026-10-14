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

npx vitest run                       # All tests (there is no `npm run test` script)
npx vitest run <file>                # One file
npx vitest run -t "<test name>"      # One test by name

npx convex dev           # Convex dev server; regenerates convex/_generated
npx convex deploy
```

Tests live next to source (`*.test.ts`) in `features/ai/server` and `core/routing`. `vitest.config.ts` maps the `@/` alias. `features/ai/server/workflow.test.ts` ("applies a repair pass…") fails on a clean checkout and is unrelated to routing. `package-lock.json` is out of sync with `package.json` (`npm ci` fails; use `npm install`).

## Architecture

### Directory layout
- `app/` — routes: `(main-page)` dashboard/billing/org creation, `whiteboard/[id]` editor, `api/` (AI generation, Clerk webhook, Liveblocks auth), `actions/` server actions.
- `features/` — feature modules: `whiteboard` (editor UI + hooks), `dashboard`, `billing`, `ai` (client types/schemas + `server/` pipeline).
- `core/` — framework-free engine code: `shapes` (shape registry, per-shape definition/render/hit-test), `routing`, `arrow` (React hook bridging elements → routing), `anchors`, `snap`, `layout`, `collision`.
- `convex/` — schema and queries/mutations. `liveblocks.config.ts` — Liveblocks room types and hooks.

### Whiteboard data flow
- **Liveblocks storage is the live document**: `elements: LiveList<LiveObject<DrawingElementJson>>`, plus presence (cursor, selection, pencil draft). See `liveblocks.config.ts`.
- **Convex `whiteboards.content`** is a JSON snapshot. On load, `use-whiteboard-page-controller.ts` seeds an empty Liveblocks room from it and restores the viewport; `features/whiteboard/hooks/data/use-whiteboard-auto-save.ts` writes it back.
- Room access is granted in `app/api/liveblocks-auth/route.ts`; Convex auth uses Clerk JWTs (`convex/auth.config.ts`). Users are created both by the Clerk webhook (`users.createUser`) and on client login (`users.storeUser`).

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
- `workflow.ts` builds a LangGraph `StateGraph`: contextRetriever → architecturePlanner → domainModeler → infrastructureExpander → relationshipAgent → diagramComposer → layoutAgent → validationAgent → intermediateCompile → criticAgent → (one optional expansion loop back to relationshipAgent) → repairAgent → canvasCompiler. Agents are in `agents/`, prompts in `prompts/`, deterministic helpers in `tools/`.
- Agents emit `AIStreamEvent`s in their state updates; the route forwards them and also emits v1 compatibility events (`sse.ts`).
- `model-providers.ts` picks the LLM from the request's `provider`: gemini (default), groq, openai, anthropic, openrouter, local. Each reads `<PROVIDER>_API_KEY` and an optional `<PROVIDER>_MODEL` override (`LOCAL_AI_*` for local).

## Environment Variables (`.env.local`)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  CLERK_SECRET_KEY=  CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CONVEX_URL=  CONVEX_DEPLOY_KEY=
LIVEBLOCKS_SECRET_KEY=  NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=
GEMINI_API_KEY=  GROQ_API_KEY=  OPENAI_API_KEY=  ANTHROPIC_API_KEY=  OPENROUTER_API_KEY=   # at least one
# optional: GEMINI_MODEL, GROQ_MODEL, OPENAI_MODEL, ANTHROPIC_MODEL, OPENROUTER_MODEL, LOCAL_AI_BASE_URL/MODEL/API_KEY
```

## Git
- PRs target `main`; conventional commits preferred.
- Run `npm run lint` and `npx vitest run` before committing.
- `AGENTS.md` is an old task prompt (routing crash fix + perf upgrades), not current guidance.
