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

### Feature: AI agent can place standalone icons (`shape: icon`)
- Requested after the refactor: the agent had `search_icons` (lookup only) and could only attach an icon tile inside a node. `Name [icon: server, shape: icon]` (or `[kind: database, shape: icon]`) now draws a bare icon with the name as a caption underneath, connectable like any node, mixable with boxed nodes.
- Pieces: DSL parse/serialize/types, AI schema + type, `canvas-compiler.ts` (`shapeOf`, `sizeIconNode`, glyph colour), `core/shapes/icon` (optional caption under the glyph, `caption.ts`), `getShapeLabelRegion("icon")` for the layout metrics, `readableOnDark` (`core/color/adaptive-color.ts`) so a box-less glyph reads on the dark canvas, code round trip (`graphFromElements`, pins, metrics) limited to icons with `ai.role === "node"`.
- Agent side: language line and a rule in the system prompt (within the prompt token budgets), `search_icons` results say how to draw a hit as a bare icon, and the `icon-shape-needs-icon` lint rule warns when no icon can be resolved (the node would be drawn as a box).
- Bug found on the way: the schema drops an `icon:` equal to the node's kind icon, so `[kind: database, icon: database, shape: icon]` lost its icon and fell back to a box; an icon-shaped node now accepts either.
- Tests: parse, compile to icon elements (no box, caption, connected), code round trip, fallback without an icon, hand-inserted icons ignored, lint rule, prompt/tool text, `readableOnDark`, and a real-Chrome export of a captioned icon (SVG, PNG, PDF). Also rendered in real Chrome in the editor: icons, captions, kind colours, mixed with a boxed node, readable on the dark canvas.
- Known: the legacy 12-agent pipeline (the default `AI_PIPELINE`) has no tools, so it does not get this; only `AI_PIPELINE=agent`. The layered layout for `type architecture` still groups by layer and can look odd with bare icons, and arrows can share a segment (same limitation as the retry arrow).

### Feature: AI builder agent (`AI_PIPELINE=builder`)
- Requested: let Groq (or any provider) build the diagram step by step while it streams to the canvas, using the canvas as context for the next step, then look at the result and adjust nodes, arrows and edges until it is right, with both a text report and a picture ("both").
- New: `features/ai/diagram-agent/builder/` (`state.ts` add/adjust over a mutable diagram, `canvas.ts` layout + stream diff, `report.ts` named per-connection problems, `prompt.ts`, `loop.ts`, `render-png.ts`, `testing.ts`), `run-builder.ts`, eval `eval/builder.eval.ts`.
- Changed: transports take a tool list and user messages can carry images; `getAIModelProviderConfig`/`createBaseChatModel`/`createAIChatModel` take `{ vision }`; the compiler takes `offsets` and `edgeSides`; `layout/pins.ts: withOffsets`; `AIStreamEvent` gains `element.update` and `element.remove`; `use-ai-generation.ts` and the controller apply them; `sharp` is now a declared dependency (it was only a transitive one).
- Tests: state/adjust/report/canvas/diff (`builder.test.ts`), the loop with a scripted model including what the model is shown each turn (`loop.test.ts`), the event stream (`run-builder.test.ts`), the PNG renderer, pipeline selection, and two real-Chrome tests that play the builder's SSE into the real editor and check updates move elements instead of adding copies (`ai-builder.browser.test.ts`; the update test fails when the client's update handler is disabled).
- Verified by picture: one `sides` command fixes the login flow's retry arrow (the router-level attempt in the previous round could not, see above).
- Gemini vision: the Gemini adapter (`toGenAIMessages`) now sends `data:image/...;base64` images as `inlineData` parts, and `supportsVision` is true for Gemini (only `local` is excluded). Gemini's regular models are multimodal, so `GEMINI_MODEL` is used as is (`GEMINI_VISION_MODEL` overrides it if wanted). Tested at the message-conversion level only; not run against the live API (quota used up).
- Builder guardrails (after a live Groq run produced a spread-out diagram with long, tangled connectors): `move` capped at 200 per command and 240 in total per node, the agent is shown "Moved by hand", the report flags connectors over 600px and scores each version (`score`), and an adjust-only step that makes the score worse is undone with an explanation (`guardAdjustments`). The prompt now says to keep the diagram compact and to prefer `sides` over `move`. Tests: clamp, moved-by-hand line, long-connector score, undo of a worse adjustment, no undo for a fix that adds length.
- Architecture layout choice: `compileAIDiagramDetailed` lays an `architecture` diagram out by tiers and by flow and keeps the cheaper one (`layoutCost`). A diagram written as code names no tiers, so nine connected nodes fell into one "application" row, long tangled connectors and a very wide picture; flow layout fixes that, and the benchmark fixtures (which need their tiers and groups) still pick tiers. A first attempt that switched on row width or flat-edge share broke the stress fixture's groups and was replaced by measuring.
- Found while diagnosing: `.env` had `AI_PIPELINE=agent`, which draws everything at the end; streaming needs `AI_PIPELINE=builder`.
- Fewer calls per prompt (quota): builder steps are 12 statements (was 6), default 12 turns (was 24), 2 reviews (was 3), `finish` may share the last reply, and the shapes of a step are revealed one by one by the server (`revealChunks`) so the stream still reads as step by step. Quota errors per day or 'exceeded your current quota' are no longer retried (they used to be waited out for minutes), and a run that hits quota after drawing something keeps its canvas (`stoppedByQuota`). Measured: about 1,500 input tokens per turn (system 980, tool schema 320, state 200).

### Agent and code panels redesign, richer code, bold groups, theme arrows
- **Panels.** The agent panel is rewritten (`ai-panel.tsx`, `ai-timeline.tsx`): a timeline of what the agent thought, did and found, in the app's monochrome tokens, replacing the violet wand, pulsing sparkle and chat bubbles. The code editor is no longer a tab inside it: `diagram-code-panel.tsx` is its own panel (sidebar button, command menu, empty-board card, "Open as code"), mounted when closed, with line numbers, error marks, Tab, Cmd/Ctrl+Enter and a syntax reference. Both can be open; the "Hide UI" button and the view fit stay clear of them (`panel-layout.ts`, `fitView({ rightInset })`).
- **Insightful thoughts.** The builder emits structured `agent.note` events (`builder/notes.ts`): the model's own reasoning (the prompt now asks every reply to start with one or two specific sentences), what was added with how the flow reads and the layout counts, the review's named problems, what each adjustment did and why an undone one was undone, and a closing summary (steps, reviews, problems fixed, what was left). Facts come from the state and the report, not from decoration.
- **Code carries layout.** Nodes take `x, y, w, h`; connections take `from` and `to` sides (`parse.ts`, `serialize.ts`, `canvas.ts`, `schemas.ts`, the compiler: size override, `withPins` from coordinates, sides from the edge). Connections already name their source and destination (`A > B`); the sides are the new part. Round trip tested (positions, sizes, sides, edge colours); code is written in reading order with layout.
- **Groups and arrows.** Group frame 3px black with a 24px weight-800 heading; connectors and edge labels default to black (white in the dark theme) unless a colour was set. The heading collided with arrows entering a narrow group, so `placeGroupHeadings` moves it past the connector and grows the frame when needed (it would not clear otherwise); tested and checked in the browser.
- Other: Gemini label in the provider list is 3.8; the toast moved to bottom-centre; `--font-mono`/`--font-sans` got system fallbacks (without them the code and timeline fell back to a serif font wherever Geist is not loaded).
- Design pass after seeing it in the real app: the black sidebar and "Update diagram" buttons showed no icon or text there (`text-background` did not apply outside the harness), so every button of the new UI uses `bg-primary text-primary-foreground`; both panels now shrink with the window (`clamp`, in `panel-layout.ts`: together about 56% of a 1360px window, never above 880px) and the floating Outline/Fill bar and "Hide UI" stay in the free part (`usePanelInset`); a run of icon lookups is one entry listing what was searched; the boilerplate "AI Agent started" and "Request understood" are gone; a long request is cut to three lines; the first add does not print "0 connections, longest connector 0px"; the toast sits bottom-left beside the sidebar.
