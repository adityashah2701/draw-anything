# Refactoring plan

Status date: 2026-10-17. Nothing in this plan has been committed.

## 1. Architecture as it is

Next.js 15 (App Router), React 19, TypeScript, Tailwind 4. Liveblocks holds the live document, Convex holds snapshots, users and comments, Clerk handles auth. The repo is already organised by domain, not by file type:

| Area | Role |
| --- | --- |
| `app/` | Routes, route handlers, server actions (framework-discovered, do not move) |
| `features/whiteboard` | Editor UI, hooks, canvas interaction, export |
| `features/ai` | Client schemas and types, `server/` LangGraph pipeline, `diagram-agent/` loop |
| `features/diagram-code` | Text DSL to and from canvas elements |
| `features/dashboard`, `features/billing` | Dashboard and billing UI |
| `core/` | Framework-free engine: `shapes`, `routing`, `anchors`, `snap`, `collision`, `text`, `icons`, `color`, `theme`, `arrow` |
| `convex/` | Schema, queries, mutations, access rules |
| `components/ui` | shadcn primitives |
| `tests/browser` | Real-Chrome tests with in-memory fakes of Liveblocks, Convex and Next |

This layout is sound. A rewrite into a new tree would move about 500 files for no gain and break the `@/` imports that tests and docs rely on. The plan is targeted fixes inside the existing structure.

## 2. Baseline (observed 2026-10-17)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | 84 files, 1166 tests passed |
| `npm run test:browser` | 190 passed, 11 skipped (last full run, before the fan-out edit) |
| `next build` | passed earlier in the session; needs placeholder `NEXT_PUBLIC_CONVEX_URL` and Clerk keys; not re-run since |
| After the compiler fan-out edit | `tsc` clean, `features/ai` + `features/diagram-code` 508 tests passed |

## 3. Oversized files (by responsibility, not line count)

| File | Lines | Mixed responsibilities | Action |
| --- | --- | --- | --- |
| `features/whiteboard/hooks/controller/use-whiteboard-page-controller.ts` | 1214 | Composes ~every editor hook, shortcuts dispatch, AI wiring, comments, export | Split by concern (shortcut runner, selection commands, view state). Needs browser tests after each step. |
| `features/whiteboard/hooks/interaction/use-whiteboard-drawing.ts` | 1015 | One `Gesture` machine plus per-gesture pointer logic | Extract per-gesture handlers (draw, drag, resize, marquee, connect) |
| `core/routing/orthogonal-router.ts` | 794 | Public API, manual-route handling, candidate selection, re-exports | Move manual-route handling out; trim re-exports (see section 5) |
| `features/ai/server/canvas-compiler.ts` | 733 | `prepareDiagram`, handle choice, group frames, arrow build | Extract handle selection and arrow drafting |
| `core/routing/route-engine.ts` | 656 | Engine stages plus state | Leave; cohesive pipeline |
| `core/arrow/use-arrow-connections.ts` | 573 | Cache priming and routing duplicated in `routeArrowByConnections` and `rerouteConnectedArrowsForChanges` | Extract one `routeThroughCaches` helper |
| `features/whiteboard/utils/rich-text-renderer.ts` | 683 | Markdown parse, HTML conversion, layout, drawing | Split parse / html / layout |
| `features/ai/schemas.ts` | 660 | Many schemas, 15 exported but only used internally | Un-export unused schemas |
| `components/ui/sidebar.tsx`, `chart.tsx` | 726, 353 | Vendored shadcn | Leave |

Not split: `route-engine.ts`, `path-normalizer.ts`, `obstacle-avoidance.ts`. They are long but each is one pipeline stage.

## 4. Circular imports (madge, run before any change)

Eight cycles reported. Madge counts `import type`, so most are not runtime cycles:

1. `core/icons/registry.ts` <-> `custom-icon.ts`: the second imports only `IconDef` as a type. Harmless at runtime.
2. `core/routing/routing-guards.ts` <-> `route-engine.ts` (cycles 2 to 6): `routing-guards` imports only types (`RouteEngineEdge`, `RoutingObstacle`). Harmless at runtime; fix by moving those types to `core/routing/types.ts`.
3. `core/shapes/arrow/arrow-utils.ts` <-> `features/whiteboard/utils/canvas-render-utils.ts` (cycles 7 and 8): **a real runtime cycle**, and a layering violation (`core` imports `features`). `arrow-utils` imports `getAdaptiveColor`, a pure colour function. Fix: move `getAdaptiveColor` to `core/color/adaptive-color.ts`, re-export it from `canvas-render-utils` so existing consumers keep working, and point `arrow-utils` at the new file.

Status: **not started** (see section 8).

## 5. Dead code (knip, with `.claude/**` and `docs/**` ignored)

### Verified unused source files, proposed for deletion

Evidence for each: knip reports it unused, a repo-wide `grep` (excluding `node_modules`, `.claude`, `.git`, `.next`) finds no import, and it has no test. Docs mentions only are noted.

| File | Evidence | Confidence |
| --- | --- | --- |
| `core/routing/cluster-aware-router.ts` | only named in `docs/testing/canvas-regression-matrix.md` | high |
| `core/routing/path-scoring.ts` | only named in `CLAUDE.md` (stale) and the matrix doc | high |
| `core/routing/port-resolver.ts` | only named in the matrix doc | high |
| `core/shapes/capabilities/rotatable.ts` | only named in `docs/architecture/draw-anything-target-architecture.md` | high |
| `features/ai/server/tools/graph-validator.ts`, `json-validator.ts`, `semantic-search.ts`, `theme-resolver.ts` | no references anywhere | high |
| `features/ai/server/tools/icon-resolver.ts` | only named in the icon-system spec | high |
| `features/dashboard/components/create-whiteboard.tsx` | no importer | high |
| `features/dashboard/components/whiteboards/whiteboard-list.tsx`, `whiteboard-raw-data.ts` | no importer | high |
| `features/dashboard/constants/templates.tsx` | only imported by the dead `create-whiteboard.tsx` | high |
| `features/whiteboard/components/chrome/properties-panel.tsx` | the editor uses `floating-properties-panel.tsx`; the only match was that longer name | high |
| `features/whiteboard/components/properties/status-section.tsx` | only imported by the dead `properties-panel.tsx` | high |
| `features/whiteboard/components/overlays/ai-agent-status-widget.tsx` | no importer | high |
| `hooks/use-raf-throttle.ts` | no importer | high |

All are tracked in git, so a deletion is reversible with `git checkout -- <path>`.

**Status: deleted after approval on 2026-10-17.** See the changelog.

### Not proposing for deletion

- 29 unused `components/ui/*.tsx` shadcn primitives: harmless library files, and removing them forces removing their Radix packages in one coordinated step. Candidate for a later pass.
- `tests/browser/**` and `scripts/*.mjs`: knip does not see the esbuild bundle entries and the generator scripts. They are used.
- `convex/_generated`, `.claude/worktrees` (an untracked agent worktree that is not mine): left alone.

### Unused dependencies (knip, unconfirmed)

`@gsap/react`, `gsap`, `@types/gsap`, `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `recharts`, `date-fns`, `embla-carousel-react`, `groq-sdk`, `langchain`, `@langchain/google-genai`, `input-otp`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `react-resizable-panels`, `vaul`, and several `@radix-ui/*` packages. Several only serve the unused shadcn files above. `eslint` and `eslint-config-next` are used by `next lint` and must stay. `@langchain/google-genai` and `groq-sdk` may be loaded by name in `model-providers.ts`; check that before removal. `package-lock.json` is already out of sync with `package.json`, so any removal needs a fresh `npm install` and a diff review. Status: **done** (see the changelog).

### Unused exports

68 exports reported (mostly `core/routing` helper re-exports and `features/ai/schemas.ts`). Un-exporting is low risk but touches many files; deferred.

## 6. Target structure

No directory moves. Changes are limited to:

```text
core/
  color/adaptive-color.ts      # new: getAdaptiveColor moved from features/whiteboard/utils
  routing/types.ts             # new: RouteEngineEdge, RoutingObstacle (breaks type cycles)
features/ai/server/
  layout/handle-selection.ts   # new: chooseHandles + decision fan-out from canvas-compiler.ts
```

## 7. Risks

- Splitting the controller and drawing hooks is the largest risk. The editor has no unit-level coverage for hooks, only the real-Chrome editor tests, so each step needs `npm run test:browser`.
- Un-exporting router helpers can break `core/routing/*.test.ts` imports; run the whole suite per step.
- Dependency removal changes the lockfile and may change the production bundle.
- The signed-in flow (Clerk, real Convex and Liveblocks) has no automated test; auth code was not touched.

## 8. Checklist

- [x] Baseline: `tsc`, `lint`, unit tests, browser tests
- [x] Circular-import scan (madge): 8 -> 1 (type-only, documented)
- [x] Dead-code scan (knip) and grep verification of non-UI candidates
- [x] Decision-branch fan-out (`handle-selection.ts`)
- [x] Break the `core` <-> `features` cycle (`getAdaptiveColor`)
- [x] Move shared routing types to `core/routing/types.ts`; drop the router's engine re-export
- [x] Split `orthogonal-router.ts`, `rich-text-renderer.ts`
- [x] Controller: extract selected-arrow and selection-style hooks (1214 -> 990)
- [x] Drawing hook: extract draft-element logic (1015 -> 988; the rest is closure-heavy, see below)
- [x] De-duplicate `use-arrow-connections.ts`
- [x] Layout: straighten small one-to-one chain jogs
- [x] Re-run `tsc`, lint, unit, browser, build
- [x] `docs/architecture/REFACTORING_CHANGELOG.md`
- [x] Delete the 17 verified dead files (approved)
- [x] Remove unused dependencies and 28 shadcn files (approved; lockfile diff reviewed, `npm ci` works again)
- [x] Drawing hook: gesture scratch object, pure decisions extracted (988 -> 860); the three lifecycle functions keep their React-state reads on purpose
- [x] Controller: diagram placement and text-edit handlers extracted (990 -> 852)
- [x] Unused exports reviewed: 47 `export` keywords dropped, router compat block and `measureRichTextTopOffset` deleted; the rest classified in the changelog
- [x] Dependency and runtime-import verification
- [x] Layout verification (benchmarks, real-Chrome render)
- [x] Signed-in smoke-test checklist: `docs/testing/signed-in-smoke-test.md`
- [ ] Retry/back-edge arrows share anchors and vertical segments with the forward flow (needs router lane separation; two handle-based attempts broke the `auth-flow` crossing guarantee)
- [ ] Zero-reference functions listed in the changelog: decide per owner whether to delete
- [ ] Declare `esbuild` and `postcss` as devDependencies (used directly by `tests/browser`)
- [ ] Manual signed-in run (Clerk, Convex, Liveblocks) - needs a real session
