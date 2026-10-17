# Refactoring changelog

Nothing here is committed. Each entry was checked with `tsc`, `npm run lint`, `npx vitest run` and, for editor code, `npm run test:browser`.

## 2026-10-17

### Dependency boundaries
- `core/color/adaptive-color.ts` (new): `getAdaptiveColor` moved out of `features/whiteboard/utils/canvas-render-utils.ts`, which re-exports it. `core/shapes/arrow/arrow-utils.ts`, `core/shapes/text/renderer.ts` and `core/shapes/base/shape-label-renderer.ts` now import it from `core`. Removes the only runtime `core` -> `features` cycle.
- `core/routing/types.ts` (new): `RouteEngineEdge` and `RoutingObstacle`; the old modules re-export them as types.
- `core/routing/orthogonal-router.ts` no longer re-exports the route engine (a runtime cycle). `core/arrow/use-arrow-connections.ts` and `endpoint-approach.test.ts` import the engine from `route-engine.ts`.
- Result: madge circular imports 8 -> 1. The remaining one, `core/icons/registry.ts` <-> `custom-icon.ts`, is a type-only import and harmless at runtime.

### File splits (public paths and exports unchanged)
| From | To |
| --- | --- |
| `core/routing/orthogonal-router.ts` (794 -> 576) | `endpoint-stubs.ts` (stub pinning, re-anchoring), `path-editing.ts` (bend/segment edits); still re-exported from the router |
| `features/whiteboard/utils/rich-text-renderer.ts` (683 -> 2) | `rich-text-markup.ts` (parse, HTML <-> markdown), `rich-text-layout.ts` (wrap, measure, draw); the old path re-exports both |
| `use-whiteboard-page-controller.ts` (1214 -> 990) | `use-selected-arrow.ts`, `use-selection-style.ts` (four near-identical style handlers now share one helper) |
| `use-whiteboard-drawing.ts` (1015 -> 988) | `interaction/draft-element.ts` (draft shape growth, straight arrow preview) |
| `core/arrow/use-arrow-connections.ts` (573 -> 535) | duplicated cache-then-route code in two functions replaced by one `routeThroughCaches` |
| `features/ai/server/canvas-compiler.ts` | `layout/handle-selection.ts` (`chooseHandles`, `spreadParallelEdges`, `decisionExitHandle`) |

New pure modules have tests: `arrow-bend-edit.test.ts` (4), `draft-element.test.ts` (4), `handle-selection.test.ts` (3), plus one in `layered-order.test.ts`.

### Behaviour changes (intended, tested)
- A decision (diamond) with two or more outgoing edges sends side branches out of its left or right corner instead of sharing the bottom stub.
- `assignCenters` ends with a pass that straightens one-to-one chain links whose offset is at most 100 units (`SMALL_JOG`; first 60, raised after a render of the login flow showed a 75-unit jog; 140 also passes the benchmark, 200 does not). Larger offsets are left alone: an unrestricted version raised connector overlaps on the stress fixture from 28 to 29 and failed the benchmark guarantee, which was not loosened.

### Deleted (approved by the user)
Evidence for each: knip unused, no importer found by a repo-wide grep (excluding `node_modules`, `.claude`, `.next`, `.git`), no test, no config or script reference. All are tracked in git, so `git checkout -- <path>` restores them.
- 17 source files: `core/routing/{cluster-aware-router,path-scoring,port-resolver}.ts`, `core/shapes/capabilities/rotatable.ts`, `features/ai/server/tools/{graph-validator,icon-resolver,json-validator,semantic-search,theme-resolver}.ts`, `features/dashboard/components/create-whiteboard.tsx`, `features/dashboard/components/whiteboards/{whiteboard-list.tsx,whiteboard-raw-data.ts}`, `features/dashboard/constants/templates.tsx`, `features/whiteboard/components/chrome/properties-panel.tsx` (the editor uses `floating-properties-panel.tsx`), `features/whiteboard/components/properties/status-section.tsx`, `features/whiteboard/components/overlays/ai-agent-status-widget.tsx`, `hooks/use-raf-throttle.ts`.
- 28 unused shadcn files in `components/ui/` (accordion, alert-dialog, alert, aspect-ratio, badge, breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, radio-group, resizable, scroll-area, select, slider, table, tabs, textarea). Kept: `sonner.tsx`, imported by `tests/browser/editor/editor-entry.tsx`.
- 33 packages, removed with one `npm uninstall` so `package.json` and `package-lock.json` changed together: `@gsap/react`, `gsap`, `@types/gsap`, `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`, `recharts`, `date-fns`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `react-resizable-panels`, `vaul`, `langchain`, `groq-sdk`, `@langchain/google-genai`, and 14 `@radix-ui/react-*` packages (accordion, alert-dialog, aspect-ratio, checkbox, collapsible, hover-card, menubar, navigation-menu, popover, radio-group, scroll-area, select, slider, tabs). Gemini is served by `@google/genai` and Groq by `@langchain/groq`, so none of the removed AI packages was imported. Lockfile diff: 60 lines added (shared Radix helpers hoisted, `dev` flags), about 1,880 removed, no version changes to remaining packages. `npm ci --dry-run` now succeeds; before, it failed.
- Not removed: `eslint` and `eslint-config-next` (used by `next lint`).

### Verification
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | 87 files, 1178 tests passed (baseline 84 files, 1166) |
| `npm run test:browser` | 17 files passed, 1 skipped; 190 tests passed, 11 skipped (same as baseline) |
| `npm run build` (placeholder env only) | passed, `/whiteboard/[id]` 200 kB (unchanged) |
| `madge --circular` | 1 cycle left (type-only `core/icons`) |
| `knip` | unused source: only `ui/sonner.tsx` (kept on purpose), test entries and generator scripts |

## 2026-10-17 (second round)

### Drawing hook (`use-whiteboard-drawing.ts`, 988 -> 860 lines)
- The nine per-gesture refs (drag session, collapse-on-release, last point, resize bounds/base/last point, pending arrow reroute, two snap records) are one `GestureScratch` object (`interaction/gesture-scratch.ts`) with a single `resetScratch()`. `resetStaleGesture`, `cancelDrawing` and the end of `stopDrawing` each used to clear a slightly different hand-written subset; now all clear everything. This is safe because every gesture sets the fields it reads when it starts.
- Pure decisions moved out of the closures, each with tests: `startDragSession` (`drag-session.ts`), `resolveConnectionDrop` and `handleUnderPoint` (`connector-arrow.ts`), `classifyDraftCommit` (`draft-element.ts`).
- `startDrawing`, `draw` and `stopDrawing` still read the React state they need (tool, selection, elements, viewport, callbacks). That coupling is genuine, not accidental, so it stays; splitting the three into per-gesture handlers would need a context object that only moves the same values to another file.
- Two real-Chrome tests added for behaviour that touched the scratch state and had none: marquee selection, and collapse-to-one on a plain click versus moving all on a drag. The collapse test was checked to fail when the collapse line is disabled.

### Controller (`use-whiteboard-page-controller.ts`, 990 -> 852 lines; 1214 at the start)
- `diagram-placement.ts` (pure): `cornerOf`, `aiAnchorShift`, `shiftElement`, `planDiagramCode`. The AI-streaming shift and applying diagram code used the same corner and viewport maths twice.
- `editing-text.ts` (pure) + `use-editing-text.ts`: the text-edit commit decision (add, update from the stored copy, delete, or nothing) and the three handlers. Only the three format fields are copied onto the element.
- Both are covered by new tests (`diagram-placement.test.ts`, `editing-text.test.ts`).

### Exports
- Dropped `export` from 47 values that are used only inside their own file (knip unused, no importer in code, tests, scripts or config; `tsc` confirms). One was restored: `buildPlannerMessages` is re-exported by `prompts/index.ts`.
- Deleted dead code with no reference anywhere: the router's compatibility block (`getOrthogonalPath`, `isOrthogonalPath`, `isOrthogonalPathStrict`, `pathHasDuplicateNeighborPoints`, re-exports of `SpatialHashGrid`, `AdjacencyMap`, `validateEdge`, `isFullyConnectedEdge`, `sanitizeEdges`, `insertBendPoint`, `removeBendPoint`, `reanchorPathEndpoints`) and `measureRichTextTopOffset`. The private copy of `isOrthogonalPath` in `endpoint-stubs.ts` is replaced by the shared one in `routing-utils.ts`.
- Left alone on purpose: exported types (`whiteboard.types.ts` shapes etc.), `liveblocks.config.ts` hooks, shadcn component exports, test helpers, the zod schemas in `ai/schemas.ts`, and the `default` exports of the canvas components (named and default both exist). Knip now reports 38 unused exports, 15 unused exported types, 8 duplicate exports.
- Zero-reference functions kept (not confirmed as safe to delete, they look like entry points or tooling): `runAIDiagramWorkflow`, `createAIChatModelFromRole`, `getModelByRole`, `getDefaultModel`, `estimateTokens`, `extractSemanticTags`, `createEmptyValidationReport`, `playbookFor`, `placeElk`, `isAnchorSide`, `ICON_IDS_FOR_PROMPT`, the congestion-map and obstacle-detector helpers, `markShapeEdgesDirty`, `invalidateAllRoutes`, `distance`, `CanvasState`.

### Dependency verification
- Lockfile versus the committed one: 795 -> 655 entries, 140 removed, 0 added, 0 version changes. `npm ci --dry-run` and `npm ls --depth=0` report no problems.
- Every bare import in `app`, `components`, `core`, `features`, `lib`, `convex`, `hooks`, `tests`, `scripts` and the config files resolves, except three that were already undeclared: `esbuild` and `postcss` (used by `tests/browser`, present transitively, version 0.27.0 and 8.5.23) and `simple-icons` (only the offline logo generator script; not installed). Left as they were.
- Runtime AI providers: `@google/genai`, `@langchain/{anthropic,core,groq,openai,langgraph}` all resolve. No reference to any deleted file remains in code, config or scripts (older docs under `docs/` still name some of them as history).

### Layout verification
- Layout and benchmark suites pass (all five fixtures within their connector ceilings; no limit was changed).
- Rendered in real Chrome through the editor (`applyDiagramCode`): a chain with a decision (Receive > Validate > Approve? > Ship/Reject > Notify) is straight, the decision's branches leave its left and right corners with labels clear, and the two branches merge into the last node by a shared bus. The login flow example now has `Enter Credentials` directly above `Valid?`.
- Not fixed, found in that render: in the login flow the retry arrow (`Show Error` > `Enter Credentials`) leaves the same top anchor the `no` branch enters and enters the bottom anchor the forward arrow leaves, so it shares those vertical segments and its label sits next to `no`'s. Two attempts: sending every upward edge to the right sides raised `auth-flow` crossings from 6 to 8, and doing it only when an anchor is already taken did the same. Both fail the benchmark guarantee, so both were reverted. This needs a router-level lane separation, not a handle choice.

### Verification (all run, all after the last code change)
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | 90 files, 1200 tests passed |
| `npm run test:browser` | 17 files passed, 1 skipped; 192 tests passed, 11 skipped (190 + the 2 new) |
| `npm run build` (placeholder env) | passed; `/whiteboard/[id]` 200 kB |
| `madge --circular` | 1 cycle (type-only, `core/icons`) |
| `npm ci --dry-run` | passes |

### Bug fix found in use (not caused by the refactor)
- `whiteboard-editing-overlays.tsx`: clicking Bold in the shape-label toolbar threw `ReferenceError: _ is not defined` (Next.js error overlay, `onClick` at the old line 185). An old commit had left `_ = next;` with `declare let _: unknown;` to silence lint; `declare` only exists at compile time, so the assignment hit an undeclared variable. Removed the unused `next` computation, the assignment and the `declare`. Regression test: "the label editor's Bold, Italic and size buttons work without throwing" (fails on the old code with exactly that error). Existing unit and browser tests did not click the toolbar buttons, which is why it went unnoticed.
