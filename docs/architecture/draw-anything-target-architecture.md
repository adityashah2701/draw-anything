# Draw Anything: existing and target architecture

Date: 2026-10-16. Serves MASTER_PROMPT deliverable 3 (Phase 4 decomposition).
Evidence rule: every claim cites a path (line numbers are from the tree as read; several files were being edited by other workers, so use the function name if a line has drifted). "Unverified" means it was not confirmed by reading code or running a command.

State of the tree when read: HEAD `432b438` plus uncommitted work by other workers (a `pill` shape under `core/shapes/pill/`, export dialog and `svg-context` edits, AI schema/compiler edits, new `tests/browser/baseline*.ts`). The 17-subsystem list below is Phase 4 of `git show HEAD:MASTER_PROMPT.md`; the working-copy `MASTER_PROMPT.md` is a different, shorter brief with no Phase 4. The `pill` shape is not assessed here.

## 1. Existing architecture in one page

```
Browser (app/whiteboard/[id])                         Server and services
 whiteboard-canvas-stage -> useCanvasEngine (rAF)      app/api/ai/generate-diagram  (SSE; selectPipeline() legacy | agent)
   -> drawElement (canvas-render-utils.ts)             app/api/liveblocks-auth      (room access via lib/authz)
        -> core/shapes registry: renderToCanvas        convex/: whiteboard.ts, aiFrames.ts, aiMemory.ts, users.ts, http.ts
 use-whiteboard-page-controller (1143 lines)            Liveblocks room: elements = LiveList<LiveObject<DrawingElementJson>>
   Liveblocks mutations + history, Convex query/update  Clerk: identity, orgs, webhook (convex/http.ts)
   use-whiteboard-drawing (892 lines): pointer FSM
   core/routing (A*, Hanan grid, lanes), core/text, core/icons, features/diagram-code, features/ai
```

| Area | Size (non-test lines, approx.) | Notes |
|---|---|---|
| `core/shapes` | 3.4k | 10 shapes, one folder each (definition, geometry, interaction, anchors, renderer, types) |
| `core/routing` | 5.8k | orthogonal router + route engine; 4 test files, 658 test lines |
| `core/text`, `core/icons`, `core/theme`, `core/color` | 0.4k / 0.35k / 16 / 35 | best-bounded part of core |
| `core/arrow`, `core/anchors`, `core/snap`, `core/collision` | 573 / 175 / 189 / 103 | zero test files |
| `features/whiteboard` | 11.8k | editor UI, hooks, export |
| `features/ai` | 8.7k | `server/` (legacy 12-agent LangGraph, compiler, layout), `diagram-agent/` (single loop) |
| `features/diagram-code` | 0.8k | DSL parser, serializer, canvas bridge |
| `convex`, `app`, `lib` | 1.1k / 0.5k / 0.15k | authorization rule is `convex/lib/accessRules.ts` |

## 2. The 17 subsystems: where they live and how clean the boundary is

Status: **clean** = a module owns it and others go through it; **blurred** = owned but leaks; **violated** = no single owner or a dependency points the wrong way.

| # | Subsystem | Lives in | Status | Contract other code relies on | Main gap (evidence in section 7) |
|---|---|---|---|---|---|
| 1 | Document and board model | `features/whiteboard/types/whiteboard.types.ts` (`DrawingElement` union, `WhiteboardData`), `liveblocks.config.ts` (`DrawingElementJson` mirror), Convex `whiteboards.content` (string) | violated | flat `{id,type,points,color,strokeWidth,fill?,label?,text?,fontSize?,ai?,...}`; array order is z-order | type lives in `features/` but 82 of 121 non-test `core/` files import it; hand-written mirror type; `points` means different things per type; no load-time validation (section 7, #1) |
| 2 | Semantic diagram model | `features/ai/types.ts` `AIDiagramDocumentV1` (`schemaVersion: "ai-diagram-v1"`, checked by Zod at `features/ai/schemas.ts:581`); `ai{semanticId,role,frameId,icon,...}` on canvas elements | clean for the document, blurred for the canvas link | graph is the source for compile; canvas elements carry `ai.*` so edits can find them | canvas -> graph (`graphFromElements`) is lossy: only `diamond` (and `pill`, in flight) keep their shape; rectangle/circle/triangle come back as `semantic-node` |
| 3 | Diagram-as-code parser/compiler | `features/diagram-code/{parse,serialize,canvas,pins,types}.ts` | blurred | `parseDiagramCode`, `serializeDiagramCode`, `elementsFromDiagramCode`, `graphFromElements`; code and AI share one compiler | client code imports `features/ai/server/{validation,canvas-compiler}` (`canvas.ts:1-2`, `parse.ts:3`) |
| 4 | Shape registry and schemas | `core/shapes/shape-registry.ts`, `register-shapes.ts`, `shape-runtime.ts`, `base/create-shape-definition.ts` | blurred | `BaseShapeDefinition` (`base/base-shape-definition.ts:42`): `create`, `getBounds`, `getAnchors`, `containsPoint`, `getResizeHandles`, `onResize`, `renderToCanvas` | one registry (good); no element schema; `validate`, `render`, `capabilities` are never consumed |
| 5 | Typography and text measurement | `core/text/{typography,label-layout,label-region,node-size,estimate,baseline,measure-context}.ts` | clean inside, blurred at the edge | `FONT_FAMILY`, `LINE_HEIGHT_RATIO=1.2`, `layoutShapeLabel(ctx: MeasureContext, ...)` in world units | wrapping/measure primitives live in `features/whiteboard/utils/rich-text-renderer.ts` and core imports them; third estimator in `core/shapes/text/geometry.ts:38-42` |
| 6 | Geometry and coordinate transforms | no owner. `x * zoom + panOffset.x` is inlined 91 times in `core/` and `features/` (`grep`); `features/whiteboard/utils/viewport-math.ts` owns only zoom/pan; `core/collision/aabb.ts` serves routing | violated | world units are stored; screen = world * zoom + pan | no `worldToScreen`; box-shape bounds code copy-pasted (section 4) |
| 7 | Graph layout | `features/ai/server/layout/*` (`layered-placement`, `layered-order`, `group-separation`, `bus`, `edge-labels`, `pins`, `metrics`, `grid-placement`), driven by `canvas-compiler.ts` (`prepareDiagram` -> `PlacementEngine` -> `buildCanvas`) | clean (pure, synchronous, benchmarked) | `PlacementEngine` interface, deterministic output, `compileAIDiagramDetailed` diagnostics | lives under `server/` but runs in the browser through diagram-code |
| 8 | Connector routing | `core/routing/*` (public API `orthogonal-router.ts`; `route-engine.ts` pipeline; `grid-route.ts`), `core/arrow/use-arrow-connections.ts`, `core/anchors`, `core/snap` | blurred | `routeArrowPoints`, `routeArrowBatch`, `RouteEngineState` + `pruneRouteEngineState`; falls back to a straight path, never throws | `orthogonal-router.ts` <-> `route-engine.ts` import cycle; module-level `globalPathCache`; hook files untested |
| 9 | Canvas rendering | `features/whiteboard/utils/canvas-render-utils.ts` (`drawElement`, `drawGrid`), `hooks/canvas/use-canvas-engine.ts`, per-shape `renderer.ts` | violated | `drawElement(ctx, element, isSelected, RenderContext)` | one function draws the shape and the editor chrome; sits in a 25-file import cycle (section 7, #5) |
| 10 | Canvas interaction and hit testing | `hooks/interaction/{use-whiteboard-drawing,selection,drag-session,connector-arrow,use-element-commands,keyboard-policy}.ts`, `hooks/utils/use-whiteboard-utils.ts` | blurred | pure modules (`selection`, `drag-session`, `keyboard-policy`, `arrange`) are tested; the pointer state machine is not | implicit FSM of 10+ booleans in one 892-line hook |
| 11 | Command history and undo/redo | Liveblocks `useHistory`; `hooks/interaction/gesture-history.ts` brackets gestures with `pause/resume`; batched `addElements/updateElements/reorderElements` in the controller | clean | one gesture = one undo step | covered only with a fake history (`gesture-history.test.ts`, 4 tests) |
| 12 | Persistence and migration | `hooks/data/{autosave-controller,use-whiteboard-auto-save,saved-content}.ts`, controller seeding, `convex/whiteboard.ts` | blurred | autosave is pure and tested (17 tests); `parseSavedContent` returns `empty`, `ok` or `corrupt` and a corrupt snapshot pauses autosave | snapshot `metadata.version: "1.0.0"` is written (`use-whiteboard-auto-save.ts:87`) and never read; no migration hook (section 6) |
| 13 | AI orchestration and validation | `features/ai/server/{workflow,agents,validation,request-guard,sse}.ts`, `features/ai/diagram-agent/*`, `app/api/ai/generate-diagram` | clean at the seam | `AIStreamEvent` stream; `selectPipeline()` picks `legacy` or `agent` from `AI_PIPELINE` (`diagram-agent/pipeline.ts:13`) | duplicated kind lists (section 7, #12) |
| 14 | Icon registry and assets | `core/icons/{registry,glyphs,draw}.ts` | clean | `iconForNode(ai)` = valid `ai.icon`, else `ai.semanticKind`, else generic; glyphs are vendored lucide paths | only `semantic-node` draws icons (`semantic-node/renderer.ts:35`); no icon element, no picker (grep for IconPicker: none) |
| 15 | Export and serialization | `features/whiteboard/export/*`, `hooks/export/use-board-export.ts`, `components/overlays/export-dialog.tsx` | clean (best-designed seam) | one renderer, two passes (section 5) | reuses `drawElement` (carries editor-chrome code, off by arguments) |
| 16 | Security and authorization | `convex/lib/accessRules.ts` (pure rule), `convex/lib/access.ts`, `lib/authz/room-access.ts`, `features/ai/server/request-guard.ts`, `lib/security/csp.ts` | clean | creator or org member; same rule for Convex and Liveblocks | not assessed beyond layout; see `docs/audits/draw-anything-security-audit.md` |
| 17 | Testing, diagnostics, instrumentation | Vitest node tests beside source; `tests/browser/*` (esbuild bundle onto a blank Chrome page); `telemetry.ts` for AI; no render/interaction timers | blurred | see `docs/testing/canvas-regression-matrix.md` | no CI config (`.github` absent); no runtime perf instrumentation |

## 3. Data flow

### 3.1 Live document, snapshot and autosave
```
Liveblocks room (storage.elements)  <--- single live source of truth while a room has content
   | useStorage -> elements[]  (controller.ts:66; cast DrawingElementJson -> DrawingElement, no validation)
   v
 render / hit-test / routing / export all read elements[]
   |
   +-- autosave-controller (pure): whole-board change detection, single flight, debounce + max wait,
   |    retry with backoff, stops on permission errors, flushes on hide/unmount
   |    payload = JSON.stringify({elements, canvasSettings:{zoom,panOffset,showGrid}, metadata:{version:"1.0.0",...}})
   v
 Convex whiteboards.content (string)  --- read ONLY to seed an empty room (controller.ts:336-352) and to restore the viewport
```
- Seeding: `parseSavedContent` -> `ok` with elements -> `seedElements` pushes them if the list is empty (`useLiveblocksM`, `list.length === 0` check). Autosave is not `ready` until `liveElements !== null && seedState === "settled"` (`controller.ts:322`), so an unsynced empty board never overwrites the snapshot. `corrupt` sets `seedState = "failed"` and leaves the stored text alone.
- Two stores, one direction: Convex is a write-behind backup; there is no reconciliation if the two diverge (for example after the room is reset). This is a decision to keep, but it is why the snapshot must stay readable by every future version.
- Writes: `addElement/updateElement/addElements/updateElements/reorderElements/deleteElementsLive` are Liveblocks mutations (`controller.ts:74-143`). `updateElement` scans the list per call; the batched variants build an id->index map once.

### 3.2 Render, hit-test and edit paths
- Render: `useCanvasEngine` (rAF, full redraw per change) -> viewport cull (120 screen px of padding) -> `drawElement` -> `renderShapeToCanvas` -> shape `renderToCanvas(shape, {ctx, zoom, panOffset, ...})`. Shapes convert world to screen themselves.
- Bounds: `getShapeBounds(shape, {textMeasureContext})`, memoised per element in `useWhiteboardUtils` (`boundsById`) and fed to a `SpatialHashGrid` (cell 220) that is rebuilt whenever `elements` changes (`use-whiteboard-utils.ts:37-64`).
- Hit-test: spatial candidates -> `shapeContainsPoint` -> shape `containsPoint`. Resize-handle hit-test uses `getShapeResizeHandles`; handle drawing does not (section 7, #8).
- Edit: double-click opens a DOM editor over the canvas. Shape labels: `ShapeLabelEditor` in `whiteboard-editing-overlays.tsx`, placed with `getShapeLabelRegion(shape.type, bounds)` and styled by `shape-label-editor-style.ts`. Standalone text: `canvas-text-block.tsx` + `text-block-style.ts`. Commit writes the whole element through `updateElement`.

### 3.3 AI pipelines

| | legacy (`AI_PIPELINE` unset or not `agent`) | agent (`AI_PIPELINE=agent`) |
|---|---|---|
| Entry | `features/ai/server/workflow.ts` LangGraph `StateGraph`, 12 agents (context retriever .. canvas compiler; `workflow.ts:12-24`) | `features/ai/diagram-agent/run.ts` + `agent-loop.ts` |
| Model I/O | JSON Schema in the prompt, reply parsed as text (`parseModelJson`), lenient normaliser, one corrective re-ask. Never provider-native structured output | model writes diagram code (the DSL) and may call `search_icons`, `check_diagram`, `finish`; transport `native` (bindTools) or `text` (always for Gemini, automatic fallback) |
| Output | `AIStreamEvent` (frame.created -> phase.* -> element.batch -> frame.done) | same events |
| Shared tail | both end in `compileAIDiagramDetailed` (`canvas-compiler.ts`): prepare -> place -> build. Route handler and client are identical | |
| Persistence | client records frame progress in Convex `aiFrames`; `finalGraph` is `v.any()` | |
| Evidence of quality | `npm run eval:ai` writes `docs/superpowers/reports/ai-eval-<date>.md`; no such report is committed | |

### 3.4 Diagram code round trip
```
text --parseDiagramCode--> ParsedDiagramCode --documentFromParsedCode--> AIDiagramDocumentV1
     --compileAIDiagramToCanvas(pins)--> DrawingElement[]  (semantic-node | diamond; frames + labels are isGuide elements)
canvas --graphFromElements--> SerializableGraph --serializeDiagramCode--> text
```
Applying code to an existing diagram is one undo step; nodes the user dragged are pinned (`pins.ts`) by recompiling the diagram's own graph and comparing centres. DSL support per shape is in the matrix in `docs/testing/canvas-regression-matrix.md`.

## 4. Contracts

### 4.1 Geometry contract (as it is today, with the places it is broken)
1. Stored space is world units at zoom 1. Zoom and pan are applied only when drawing. Nothing stored depends on zoom (`docs/superpowers/specs/2026-10-15-layout-and-routing-design.md`, "Measurement contract").
2. `points` is not one shape: box shapes (`rectangle`, `diamond`, `triangle`, `semantic-node`) = two opposite corners in any order; `circle` = centre then a point on the rim (`circle/geometry.ts:4-22`); `text` = one top-left anchor; `line`/`arrow`/`freehand` = a polyline. Any code that reads `points` as an AABB is wrong for circles: `features/diagram-code/canvas.ts` `boundsOf` does so for a type set (`NODE_TYPES`) that includes `circle`.
3. `getBounds` is the geometric box without stroke; selection chrome pads by `strokeWidth/2`; ink bounds for export come from the recording context, not from `getBounds`.
4. Anchors: four edge midpoints of the bounding box for every connectable shape (`core/anchors/anchor-geometry.ts:40-57`, `anchors.ts` identical in 5 shapes). The ids are `<elementId>-anchor-<side>`; `parseAnchorSide` reads the last `-` token. Correct for rectangle, circle, diamond, semantic-node; wrong for the left/right anchors of a triangle (the bbox midpoint at x = left is w/4 outside the slanted edge).
5. Hit-test tolerances are world units: line/arrow 10, freehand 8 (`line/interaction.ts:13`, `freehand/interaction.ts:13`); `ShapeHitTestOptions.zoom` exists but no shape definition reads it; magnetic snap radius is 20 world units (`use-whiteboard-page-controller.ts:206-210`). Handle hit size is 8 / zoom (`use-whiteboard-utils.ts:177`), the only zoom-aware tolerance.
6. Resize goes through `core/shapes/base/resize-box.ts` (`resizeBox`, `resizePaddedBox`; tested). Exceptions by design: `text` scales its font, `line`/`arrow` move endpoints, `freehand` cannot be resized, `circle` re-squares the box (radius = min(w,h)/2 about the box centre, `circle/interaction.ts:58`).
7. Connection: `ArrowConnection {elementId, anchorId?, handle?}`; `handle` is the legacy field, kept for old boards (`whiteboard.types.ts:31`).

### 4.2 Text-layout contract (what is true and what is not)
- Single sources: `typography.ts` (font stack, 1.2 line height, `MIN_FONT_SIZE=9`, `makeFontString`); `label-layout.ts` (`layoutShapeLabel`: world units, shrinks font to fit, never splits a word before the smallest size, `LABEL_PADDING=12`, max 4 lines); `node-size.ts` (`sizeSemanticNode` is the inverse of `getShapeLabelRegion` + `layoutShapeLabel`); `estimate.ts` (Inter advance table, 4% margin, no DOM); `baseline.ts` (CSS first-baseline offset).
- Order of authority for a label: stored box (world) -> `getShapeLabelRegion` -> `layoutShapeLabel` in world units -> scaled by zoom only at draw time -> DOM editor styled from the same numbers (`shape-label-editor-style.ts`, `text-block-style.ts`). Tests assert canvas ink and DOM ink agree within 2 px (`tests/browser/label-alignment.browser.test.ts`, `standalone-text.browser.test.ts`).
- The app does not load Inter, so users get their system font; exactness is guaranteed only for Inter (`CLAUDE.md`, text-foundation spec). Measured estimator error vs Chrome over a 46-label corpus is in the layout spec: Inter -0.85% to +4.0% (mean +0.3%), system San Francisco -2.3% to +7.6%, Helvetica/Arial -5.7% to +13.4%.
- Breaks in the contract (all in section 7): the label region is defined for `semantic-node` only; circle, diamond and triangle renderers hard-code their own regions while the editor, `metrics.ts` and `node-size.ts` use other numbers; `shape-label-renderer.ts:184` draws with `textBaseline = "top"` plus a measured offset while standalone text uses `firstBaselineOffset`; `core/shapes/text/geometry.ts:38-42` has a third width estimator (0.62 / 0.68 em per character) used when no canvas context is passed.

## 5. Export architecture (`features/whiteboard/export`)
```
exportScene({elements, selectedIds, options})
  pickElements -> selection-policy (selected + connectors with both ends selected + their labels)
  Pass 1: drawScene(asCanvasContext(new SvgContext(measurer)), elements, zoom 1)   // same drawElement, theme forced light
          -> svg.markup() (SVG text) and svg.inkBounds() (strokes, arrowheads, text)
          -> box = ink +- 24 units
  svg  -> wrap markup in <svg viewBox>, return
  png/pdf -> Pass 2: drawScene(realCanvas, elements, zoom = scale, pan = -min*scale), assert size limits first
          png -> canvas.toBlob ; pdf -> buildPdf (raster page, 0.75 pt per px, capped)
```
- One renderer: shapes are never re-implemented for export. `SvgContext` implements only the canvas calls the renderers use and throws on anything else, so a new drawing call fails loudly (`svg-context.ts` header, `:320`, `:338`). Output is built from escaped text and validated colours and numbers; no `<script>`, `<image>`, `href` or external `url()`.
- Theme: `withRenderTheme(false, ...)` wraps each `drawElement` call (`scene.ts:25`); exports are always light.
- Limits (`EXPORT_LIMITS`): 16,384 px per side, 64 MP (PNG), 24 MP (PDF), 50 M characters (SVG). PDF is a raster, single page. Real numbers and the unverified items are in `docs/testing/export-test-report.md`.
- Coupling to watch: `drawElement` is the editor's draw function (selection box, handles, remote selections and connection handles are in it, switched off by `isSelected=false` and by omitting `hoveredElementId`/`otherUsersSelections`); `asCanvasContext` is a cast (`svg-context.ts:437`), so type checking does not tell you when a renderer starts using a call `SvgContext` lacks; `scene.ts:6` calls `getShapeBounds(element)` without a measure context.

## 6. Persistence and migration decisions

What is versioned and what is not:

| Artifact | Where | Version marker | Read-time check | Notes |
|---|---|---|---|---|
| Board snapshot | Convex `whiteboards.content` (string) | `metadata.version: "1.0.0"` (write-only) | JSON parse only (`saved-content.ts:16-31`): `empty`, `ok`, `corrupt` | elements are cast, not validated (`controller.ts:350`) |
| Live document | Liveblocks storage | none | none | `DrawingElementJson` is a type, not a runtime check |
| Element shape | inside both of the above | none | none | evolution so far is by optional fields (`ai.icon`, `isGuide`, `arrowHeadStart`, ...) and read-time fallbacks |
| Connection | `ArrowConnection.handle` legacy vs `anchorId` | none | both accepted (`arrow-utils.ts:132`, `arrow/interaction.ts:18-23`) | |
| Icon reference | `ai.icon` / `ai.semanticKind` | none | `iconForNode` falls back to the kind, then to generic | "old boards need no migration" |
| AI document | `AIDiagramDocumentV1`, `aiFrames.finalGraph` (`v.any()`) | `schemaVersion: "ai-diagram-v1"` | Zod literal (`schemas.ts:581`) | the only versioned payload |
| In-app clipboard (copy/paste) | `sessionStorage` key `draw-anything:clipboard:v1` plus a module-level `memory` | key suffix | shape checked in `read()` (`clipboard.ts:14-23`) | |

Decisions (proposed unless marked "already true"):
1. Already true: never rewrite stored content on read; a snapshot that fails to parse pauses autosave (`corrupt`).
2. Additions are optional fields with defaults applied at read time. A change to a default geometry (the text line height 1.0 -> 1.2 change is the model) ships with a compatibility test (`core/text/compatibility.test.ts`).
3. Proposed: a pure `migrateSnapshot(raw): {elements, version}` with identity for `1.0.0`, called by the seeding effect; a stamped `SNAPSHOT_VERSION` written by autosave; a reader that meets a newer major version opens read-only instead of overwriting.
4. Proposed: `sanitizeElement(raw)` at seed time: drop nothing silently. An element with an unknown `type` or missing `points` is kept in storage untouched and skipped by render/hit-test, so a downgrade cannot destroy data.
5. Proposed: golden snapshot fixtures (one JSON per shape type plus an AI-generated board) that must round-trip `parse -> seed -> serialize` with equal geometry.
6. Proposed: a size guard on `content` before `update` (no check exists in `convex/whiteboard.ts`; Convex's per-document limit is documented as 1 MiB, unverified in this repo).
7. Compatibility rules for new shapes: a new `type` string is invisible to older clients (they draw nothing for an unregistered type, `shape-runtime.ts` returns early). Roll out the reader before the writer.

## 7. Real architectural problems found

Severity: H = can lose data or silently diverge, M = causes bugs or blocks change, L = cost only.

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 1 | H | No schema validation or migration for stored elements; `metadata.version` is write-only; `shape.validate` and `labelable.validate` exist but nothing calls them | `use-whiteboard-auto-save.ts:87`; `controller.ts:350`; grep for `.validate(` finds only `create-shape-definition.ts:49,54` |
| 2 | H | Seeding is guarded by a client-local `list.length === 0` check; two clients opening an empty room at once can both seed (runtime behaviour unverified) | `controller.ts:134-142` (`seedElements`), `:336-352` |
| 3 | M | Dependency direction inverted: 82 of 121 non-test `core/` files import `features/whiteboard/types`; five `core/` files import `features/whiteboard/utils` at runtime (seven import statements: `rich-text-renderer`, `canvas-render-utils`) from `core/text` and `core/shapes` | `core/text/estimate.ts:1`, `label-layout.ts:1-6`, `shapes/text/geometry.ts:8`, `shapes/text/renderer.ts:3-4`, `shapes/base/shape-label-renderer.ts:2-6` |
| 4 | M | Client code imports a directory named `server/`: diagram-code and the AI hook pull the compiler, validation and errors from `features/ai/server` | `diagram-code/canvas.ts:1-2`, `parse.ts:3`, `hooks/controller/use-ai-generation.ts:15` |
| 5 | M | 25-file import cycle: shape renderers -> `shape-label-renderer`/`text/renderer` -> `canvas-render-utils` (for `getAdaptiveColor`) -> `shape-runtime` -> `register-shapes` -> definitions -> renderers. `shape-runtime.ts:16` runs `initializeShapeRegistry()` at import time. Works only because renderers use each other inside function bodies. A second cycle: `orthogonal-router.ts` re-exports `route-engine.ts` (`:765-779`) which imports the router (`route-engine.ts:32`); counting type-only imports it grows to 6 files (`lane-manager`, `parallel-edge-manager`, `routing-guards`, `segment-conflict-resolver`). Found with a throwaway script over `@/` and relative imports (390 files, tests excluded); the 25-file group is the same with or without type-only edges | `canvas-render-utils.ts:8-11,14`; `shape-runtime.ts:14-16` |
| 6 | M | `drawElement` is shape drawing, selection chrome, remote selection, connection handles and colour adaptation in one function, with type branches and hard-coded colours (`#007bff`, `#38bdf8`) | `canvas-render-utils.ts:106-364` (branches at 160, 172-176, 225, 241, 306) |
| 7 | M | Label region is split: `getShapeLabelRegion` special-cases `semantic-node` only; circle uses 0.72 of the diameter, diamond 0.66 of each side, triangle 0.5 x 0.4 of the box at 60% height, but the editor takes the whole bounding box (`whiteboard-editing-overlays.tsx` `getShapeLabelRegion(shape.type, bounds)`) so the editor wraps to a different width than the canvas (by reading the code; not reproduced in Chrome). `0.66` is written in three places | `circle/renderer.ts:27`, `diamond/renderer.ts:42-43`, `triangle/renderer.ts:40-43`, `node-size.ts:49`, `layout/metrics.ts:209`, `label-region.ts` (`getShapeLabelRegion`) |
| 8 | M | Selection handles are drawn from geometry in `drawElement` (`:273-303`) but hit-tested from `getResizeHandles`: freehand draws 8 handles that do nothing (`freehand/interaction.ts:16-18` returns none); text has 8 active handles that are never drawn (`:306` skips text; `text/interaction.ts:19-36`) | as cited |
| 9 | M | Heterogeneous `points` contract (4.1 #2) plus copy-paste: `anchors.ts` is byte-identical in 5 shapes (hash-checked), resize-handle lists identical in rectangle/circle/diamond (hash-checked) and near-identical in triangle/semantic-node/text, box-bounds code written 4 times, polyline-bounds code 4 times | `core/shapes/*/anchors.ts`, `*/geometry.ts`, `*/interaction.ts` |
| 10 | M | Hit-test tolerance and snap radius are world units, not screen pixels; `options.zoom` is passed and ignored | `line/interaction.ts:13`, `freehand/interaction.ts:13`, `controller.ts:206-210`; no `options.zoom` read in `core/shapes/*` |
| 11 | M | Interaction state is an implicit machine: `isDrawing/isDragging/isResizing/isSelectingArea/connectionDraft` plus refs in an 892-line hook that branches on `currentTool` strings; the controller is 1143 lines and 28 imports (Convex I/O, Liveblocks mutations, selection, formatting, shortcuts, AI, export) | `use-whiteboard-drawing.ts:185-370,653-805`; `use-whiteboard-page-controller.ts` |
| 12 | L | Dead or inert abstractions: `BaseShapeDefinition.render` (every definition returns null, nobody calls it), `labelConfig.padding/verticalAlign` (layout uses the `LABEL_PADDING` constant; the semantic node's `padding: 16` is ignored), `capabilities` ids (never read), `rotatable`, `connectable(resolver)` ignores its argument; the semantic kinds are listed three times (`features/ai/types.ts:24` union, `schemas.ts:12` Zod enum, `server/tools/shape-registry-reader.ts:3` array, which does not read the shape registry despite its name) | `base-shape-definition.ts:46`; `capabilities/connectable.ts:14-18`; `capabilities/rotatable.ts` |
| 13 | M | Global mutable state: `core/theme/render-theme.ts:1` `let override` (a hidden input to every renderer; safe only because each `withRenderTheme` call is synchronous); `globalPathCache` (`core/routing/path-cache.ts:86`) is never cleared or invalidated by anyone (grep finds no caller), evicts by sorting 500 entries on every insert at capacity, and is keyed by arrow id + rounded endpoints + obstacle signature, not by board; `shapeRegistry` singleton + `initialized` flag; `clipboard.ts:11` `memory`; `shape-label-editor-style.ts:9` `labelOffsetCache` keyed by size/weight/style but not by which font the stack resolved to (a late font load leaves stale offsets); `icons/draw.ts:14` `pathCache` | as cited |
| 14 | M | Per-frame cost structure: bounds + spatial index rebuilt for all elements on every `elements` change; the draw loop does `selectedElements.includes` per element; the grid draws one `arc` per dot, loops over `ctx.canvas.width/height` (device pixels, after `setTransform(dpr)`) and `showGrid` defaults to true with `MIN_ZOOM=0.1`, i.e. a 2 px grid. Unmeasured | `use-whiteboard-utils.ts:37-64`; `use-canvas-engine.ts:105,136-139`; `canvas-render-utils.ts:65-104`; `use-canvas-viewport.ts:19`; `viewport-math.ts:6` |
| 15 | M | Arrow-tool arrows are created unattached: during the drag only `[start, point]` is kept; the comment there says full routing "runs only when the arrow is committed", but for a new arrow `stopDrawing` only calls `completeCurrentElement`, which adds the element (no routing, no binding); attachment exists for connector-handle drags (`buildConnectorArrow`) and for dragging an existing arrow's endpoint (`bindArrowEndpoint`, `use-whiteboard-drawing.ts:496`) | `use-whiteboard-drawing.ts:570-585`; `controller.ts:245-250` |
| 16 | L | Manual rectangle, circle and diamond are created with the label `"TEXT"`; the editor falls back to `"TEXT"` too | `use-whiteboard-drawing.ts:338`; `whiteboard-editing-overlays.tsx` (`editingShapeLabelDraft \|\| "TEXT"`) |
| 17 | L | `generateId` is `Math.random().toString(36).substr(2, 9)` (about 46 bits); `substr` is deprecated | `use-whiteboard-utils.ts:76` |
| 18 | M | Test harness fragility: `tests/browser/harness.ts:3` imports `esbuild`, which is not a declared dependency (it resolves through `convex`; `npm ls esbuild` marks the hoisted 0.25.4 as invalid for vite's requested range); browser suites use `describe.skip` when no Chrome is found, so a machine without Chrome reports green with zero browser coverage; root `vitest.config.ts` does not exclude `.claude/**`, so a git worktree under `.claude/worktrees/` is collected (observed with path-filtered runs: 7 failing files from the worktree copy and its `node_modules` until `--exclude '.claude/**'` was added) | `tests/browser/harness.ts:3`; `vitest.config.ts:9-10` |

## 8. SOLID, where it is actually satisfied or violated

| Principle | Verdict | Evidence |
|---|---|---|
| Single responsibility | Violated at the top, satisfied in the pure middle | Violated: `use-whiteboard-page-controller.ts` (1143 lines), `use-whiteboard-drawing.ts` (892), `drawElement` (`canvas-render-utils.ts:106-364`). Satisfied: `autosave-controller.ts` (pure, 17 tests), `gesture-history.ts`, `selection.ts`, `drag-session.ts`, `resize-box.ts`, `label-layout.ts`, `export/selection-policy.ts` |
| Open/closed | Partly | Adding a shape is "new folder + one line in `register-shapes.ts`" (`register-shapes.ts:17-27`). But type names are also switched on in `drawElement` (`:160,173-176,225,241,306`), `getShapeLabelRegion` in `label-region.ts`, `NODE_TYPES` (`diagram-code/canvas.ts:90`), `isConnector` (`selection-policy.ts:3`), the AI `shape` enum and `graphFromElements`. The in-flight `pill` shape touches at least `register-shapes.ts`, `label-region.ts`, `node-size.ts`, `ai/schemas.ts`, `ai/types.ts`, `canvas-compiler.ts`, `diagram-code/{canvas,parse,types}.ts` (from `git status` and grep) |
| Liskov | Violated in practice | `BaseShapeDefinition` implementers are not substitutable: `containsPointInText` returns false unless `options.bounds` is passed; freehand returns no handles while chrome draws them; `circle.points` is not a box; `resizeCircle` translates the circle when an edge handle is dragged outward (radius = min(w,h)/2 about the box centre; the same arithmetic re-run in a scratch script moved the centre 49.5 right and left the radius at 50 for `e` dragged from 251 to 350; not exercised through a repo test) |
| Interface segregation | Violated | One 15-member interface mixes geometry (`getBounds`, `containsPoint`), editing (`onMove`, `onResize`, `getResizeHandles`), rendering, UI config (`toolbarConfig.icon`, which makes `core/shapes/*/definition.ts` import `lucide-react`) and dead members (`render`, `labelConfig`) |
| Dependency inversion | Mixed | Done right: `MeasureContext` (a `Pick` of `font` and `measureText` from `CanvasRenderingContext2D`) lets layout run on a test double (`core/text/measure-context.ts`); `createAutosaveController({save, isFatal, onStatus})`; `buildConnectorArrow({route})`; `selectPipeline(env)`. Done wrong: `core` -> `features` imports (#3), client -> `server/` (#4), import-time registry side effect (#5), module-level globals (#13) |

## 9. Target architecture and migration order

Target is a tightening of what exists, not new packages. Dependency rule: `core/model` <- `core/*` <- `features/*` <- `app/*`; `features/ai/server` is never imported by browser code (move the pure compiler/validation to `features/ai/compile` or `core/diagram`).

| Step | Change | Compatibility guard | Removes |
|---|---|---|---|
| T1 | Move `Point`, `Bounds`, `DrawingElement` and friends to `core/model/element.ts`; keep `features/whiteboard/types/whiteboard.types.ts` as a re-export so the 82 imports change later | `tsc --noEmit` | #3 (types) |
| T2 | Split pure text primitives (span parse, `layoutRichTextLines`, `measureRichTextLineWidth`, `longestWordWidth`) from the DOM editor conversion (`markdownToEditableHtml`, `editableHtmlToMarkdown`); the first half moves to `core/text/rich-text.ts` | existing `rich-text-renderer.test.ts`, `text-foundation.test.ts`, browser text suites | #3 (runtime) |
| T3 | Split `drawElement`: `core/render/draw-element.ts` (shape + colour adaptation, no chrome) and `features/whiteboard/render/draw-chrome.ts` (selection, handles from `getShapeResizeHandles`, remote selection, connection handles). Move `getAdaptiveColor` to `core/theme`. Export imports only the first | export browser tests; add a handle-parity test per shape | #5, #6, #8 |
| T4 | Add `getLabelRegion(shape, bounds)` to `BaseShapeDefinition` (default: whole box); circle, diamond, triangle, pill and semantic node implement it; renderers, the editor, `node-size.ts` and `metrics.ts` read it; delete the three 0.66 literals | extend `label-alignment.browser.test.ts` to circle, diamond, triangle | #7 |
| T5 | Registry contract test suite parametrised over `shapeRegistry.list()` (section 10) | itself | #8, #9, LSP items |
| T6 | `core/model/snapshot.ts`: `SNAPSHOT_VERSION`, `migrateSnapshot`, `sanitizeElement`; golden JSON fixtures; size guard | golden round-trip tests | #1 |
| T7 | `theme` in `RenderContext`; keep `withRenderTheme` as a shim until no caller reads `isDarkRender()` | `render-theme.test.ts`, export theme-independence test | #13 (theme) |
| T8 | Tool FSM as a pure reducer (states `idle`, `drawing`, `dragging`, `resizing`, `marquee`, `connecting`, `panning`, `editingLabel`, `editingText`) with `cancel` and `commit` events; the hook only maps pointer events to events; tolerances passed in screen px and divided by zoom at the call site | reducer unit tests; later a harness-driven browser test | #10, #11, #15 |
| T9 | Delete or scope `globalPathCache` to the route engine state; delete dead members (`render`, `rotatable`, unused `capabilities` ids, `labelConfig.padding/verticalAlign`) after `grep` confirms no reader | `route-engine.test.ts` | #12, #13 |
| T10 | Declare `esbuild` as a devDependency; add a CI workflow running `tsc`, `lint`, `vitest run`, and the browser suite with Chrome required (fail instead of skip when `CI=1`) | n/a | #18 |

## 10. Contract test that would have caught most of section 7 (proposed, not written)
For every `type` in `shapeRegistry.list()`: `create({})` then `validate` is true; `getBounds` contains every `points` entry's neighbourhood; every anchor lies within one stroke width of the outline; every resize handle lies on the bounds (or the shape reports none and chrome draws none); `onResize` never yields bounds below the declared minimum and keeps the opposite edge fixed; `onMove` then inverse is identity; `containsPoint` is true at the centre of a filled shape and false 50 units outside; `JSON.parse(JSON.stringify(shape))` renders to identical ink in the browser harness.

## 11. Not assessed or unverified
- The live editor was not run (Clerk and a real Convex board id are required), so all interaction wiring above is read, not observed.
- Seeding race (#2), grid cost (#14), the late-font stale offset (#13) and the editor/canvas label-width mismatch (#7) are from reading code; none was measured or reproduced.
- Security was only mapped (subsystem 16); findings belong to `docs/audits/draw-anything-security-audit.md`.
- `pill` and the in-flight export/AI edits by other workers.
- Convex's 1 MiB document limit is from general knowledge, not from this repo.
