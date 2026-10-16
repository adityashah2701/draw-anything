# Canvas regression matrix: what is tested today and what is not

Date: 2026-10-16. Serves MASTER_PROMPT deliverable 4 and the shape capability matrix of its section B (both from `git show HEAD:MASTER_PROMPT.md`; the working-copy file is a different, shorter brief).
Evidence rule: every row was confirmed by reading the cited file or by a command listed in section 0. "Unverified" means it was not. Counts are test cases as Vitest reports them (an `it.each` row counts once per row), not `it(` declarations. The `pill` shape and `tests/browser/baseline*.ts`, `tests/browser/pill-shape.browser.test.ts`, `core/shapes/pill/` are being written by another worker and are not assessed.

## 0. What I ran, and how the suites are wired

| Command | Result |
|---|---|
| `npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' --exclude '**/*.browser.test.ts'` | 66 files, 752 tests: 750 passed, 2 failed. Failure 1: `compile-regressions.test.ts:303` expects a `semantic-node` and gets `pill` (`canvas-compiler.ts` shows as modified in `git status`; this looks like the in-flight `pill` change, which I did not confirm with the other worker). Failure 2: `drag-session.test.ts:52` wall-clock budget, 5.71 ms against `< 4` ms, while other workers were running (a timing assertion, not a logic failure) |
| `npx vitest run --config vitest.browser.config.ts <8 files>` (estimator, label-alignment, standalone-text, editing, icons, canvas-ux, layout-render, rich-text-xss) | 102 tests: 92 passed, 10 skipped, 0 failed, real Chrome (`/Applications/Google Chrome.app`) |
| Not re-run | `export.browser`, `export-dialog.browser` (being edited by another worker). Last recorded numbers are in `docs/testing/export-test-report.md`: whole browser suite 120 passed, 11 skipped; unit suite 742 passed at that time |

Wiring (`vitest.config.ts`, `vitest.browser.config.ts`, `tests/browser/harness.ts`):
- Unit tests: Node environment, `**/*.test.ts` beside source, no DOM, no React renderer. Hooks and components are covered only through the pure modules they call.
- Browser tests: `esbuild` bundles real modules from `tests/browser/entry.ts` onto a blank Chrome page as `window.T`; Inter is loaded from `tests/browser/fixtures/inter-latin-var.woff2` for the "inter" mode and not loaded for the "system" mode. `ui-entry.tsx` mounts the real export dialog with React. **No test boots Next.js, Clerk, Convex or Liveblocks, and none opens `/whiteboard/[id]`.** Every "browser" result below is "real Chrome, real modules, blank page".
- Suites become `describe.skip` when no Chrome is found (`const suite = findChrome() ? describe : describe.skip`), so a machine without Chrome passes with zero browser coverage.
- No CI configuration exists in the repo (`.github` is absent).

## 1. Shape capability matrix

Types are the ten registered in HEAD (`core/shapes/register-shapes.ts`). The bidirectional arrow's type string is `arrow-bidirectional`; its folder is `bidirectional-arrow`. Toolbar shortcuts: rectangle R, circle C, diamond D, triangle G, arrow A, line L, text T, pen P; bidirectional arrow and semantic node have none.

### 1a. Geometry and interaction

| Shape | `points` | Bounds | Hit test | Resize handles and minimum | Anchors | Evidence |
|---|---|---|---|---|---|---|
| rectangle | 2 opposite corners, any order | min/max of the 2 points, stroke excluded | box + tolerance; an unfilled `isGuide` frame is hit on its border band only | 8 handles at bounds +- stroke/2; min 10 x 10; shared `resizePaddedBox` | 4 bbox edge midpoints | `rectangle/{geometry,interaction}.ts:33-41` |
| circle | centre, then a rim point | square of side 2r about the centre | disk `hypot <= r + tolerance`, fill ignored | 8 handles at bbox +- stroke/2; min diameter 10; always re-squared: radius = min(w,h)/2 about the box centre | 4 bbox midpoints (all on the circle) | `circle/{geometry,interaction}.ts:44-67` |
| diamond | 2 opposite corners | bbox | rhombus test: normalised x distance plus normalised y distance <= 1, tolerance added to the half axes | 8 handles; min 10 x 10 | 4 bbox midpoints = the 4 vertices | `diamond/interaction.ts:8-28` |
| triangle | 2 opposite corners; isosceles, apex top-centre | bbox | **bbox only** (corners and the empty area beside the slopes hit) | 8 handles; min 10 x 10 | 4 bbox midpoints: top is the apex, **left and right are w/4 outside the slanted edge** | `triangle/interaction.ts:8-25`, `triangle/anchors.ts` |
| line | 2+ points; drawn first to last only | min/max over all points | polyline distance <= 10 + tolerance (world units) over all points | 2 handles (start, end); no minimum | none | `line/renderer.ts:10-14`, `line/interaction.ts:13` |
| arrow | 2+ points (orthogonal polyline or straight) | min/max over all points | polyline distance <= 10 + tolerance (world units) | start, end and per-segment handles (bends filtered); dragging a segment sets `isManuallyRouted` | none (a connector, not a target) | `arrow/interaction.ts:25-159` |
| arrow-bidirectional | as arrow | as arrow | shares the arrow test | shares `resizeArrowElement` | none | `bidirectional-arrow/*` delegates to arrow |
| freehand | 1+ points (draws only with 2+) | min/max over all points | polyline distance <= 8 + tolerance | **none** (`resizeFreehand` is the identity); the canvas still draws 8 handles | none | `freehand/interaction.ts:13-25`, `canvas-render-utils.ts:273-303` |
| text | 1 point, top-left | measured with a canvas context, else a 0.62/0.68 em-per-character estimate; `null` when the text is empty | box of the bounds, needs `options.bounds` | 8 handles that hit-test but are never drawn; resize scales `fontSize` (12 to 200) and keeps the opposite edge | none | `text/{geometry,interaction}.ts`, `canvas-render-utils.ts:306` |
| semantic-node | 2 opposite corners | bbox | bbox (the 8 px corner radius is ignored) | 8 handles at the bbox (no stroke padding); min 96 x 56; not content-aware | 4 bbox midpoints | `semantic-node/{interaction,definition}.ts` |

Hit-test tolerances are world units: `ShapeHitTestOptions.zoom` is passed but no shape definition reads it.

### 1b. Appearance, content and integration

| Shape | Fill / stroke / style | Label or text | Icon | Created with | Diagram code | Export |
|---|---|---|---|---|---|---|
| rectangle | `color`, `strokeWidth` (2), optional `fill`; sharp corners (`strokeRect`, no radius) | `label` through `renderShapeLabel` into the whole box: padding 12, up to 4 lines, font shrinks to 9 px minimum | no | label `"TEXT"` (`use-whiteboard-drawing.ts:338`) | not emitted for nodes (the compiler draws rectangles only as group frames); `shape: rectangle` is accepted and ignored; read as a node by `graphFromElements`, returned as `semantic-node` | yes (`export.browser` mixed board: 3-line label and a long wrapped label) |
| circle | as rectangle; a true circle | label box 0.72 of the diameter, up to 3 lines | no | label `"TEXT"` | not emitted; read as a node (`canvas.test.ts:105`) | yes (mixed board) |
| diamond | as rectangle | label box 0.66 x 0.66 of the bbox, up to 3 lines | no | label `"TEXT"` | yes: `kind: decision` or `shape: diamond`; parse, serialize, compile, read back | yes (mixed board, flowchart fixture) |
| triangle | as rectangle | box 0.5w x 0.4h centred at 60% height, up to 2 lines | no | no default label | no (read as a node) | yes (mixed board) |
| line | `color`, `strokeWidth`; no dash, no fill | none | no | none | no | yes (mixed board) |
| arrow | `color`, `strokeWidth`, `dashed` (one pattern), `arrowHeadStart/End`, `routingMode`, `routePreference` | **no label on the element**; connector labels exist only as separate `text` elements (`ai.role = "edge-label"`) made by the compiler | no | orthogonal, head at the end, **unattached** (`use-whiteboard-drawing.ts:570-585`) | yes: `->`, `-->`, `-`, `--`, edge colour, label after `:` | yes (orthogonal, straight dashed) |
| arrow-bidirectional | as arrow, heads at both ends by default | as arrow | no | no shortcut | yes (`<>`) | yes (mixed board) |
| freehand | `color`, `strokeWidth`; no fill; no smoothing | none | no | `P` tool | no | yes (mixed board) |
| text | `color`, `fontSize` (20), `fontWeight`, `fontStyle`; markdown subset `**bold**`, `*italic*`; multi-line | the `text` field | no | `T` tool | group titles and edge labels compile to `text` elements; free text is not part of the language | yes (CJK, Arabic, emoji in the mixed board) |
| semantic-node | `color`, `strokeWidth`, `fill` default `#eef2ff`, rounded corners `8 * zoom` | label right of the icon, up to 4 lines, default 17 px / 600 | yes: `iconForNode(ai)`, 74 registered icons, generic fallback | label `"Node"` | yes: the primary node type | yes (icons as vector glyph paths) |

### 1c. Test coverage and known defects

| Shape | Unit tests | Browser tests (blank Chrome page) | Known defects (evidence) |
|---|---|---|---|
| rectangle | `rectangle/interaction.test.ts` (11: area, tolerance, guide frame interior/border/small/filled, degenerate); `resize-box.test.ts` (clamping). Nothing for bounds, anchors, handles, render | `label-alignment` (3 label cases x 3 zooms x 2 fonts); `export` mixed board | default label `"TEXT"` instead of blank; no corner-radius token; manual shapes made by `createShape` drop `ai` and `isGuide` because `create()` whitelists fields |
| circle | `resize-box.test.ts` (1 case: west handle dragged past the east edge); `canvas.test.ts:105-120` (read back from the canvas). Nothing for bounds, hit, anchors, render | `export` mixed board only | an edge handle dragged outward moves the circle instead of growing it (arithmetic re-run in a scratch script: `e` from 251 to 350 gives centre +49.5, radius 50); the editor wraps to the whole bbox while the canvas uses 0.72 of it; `diagram-code/canvas.ts` `boundsOf` treats `points` as a box, wrong for circles |
| diamond | `resize-box.test.ts`; `parse.test.ts` (shape diamond, case, warnings); `serialize.test.ts:127-140`; `compile-regressions.test.ts:241-264` (decisions draw as diamonds, connectors attach to the 4 vertices); `canvas.test.ts`. `sizeDiamondNode` has no direct test | `export` mixed board; the flowchart fixture is drawn, but `layout-render` asserts label fit for `semantic-node` only, so diamond label fit is not asserted in Chrome | editor wraps to the whole bbox, canvas to 0.66; the 0.66 constant is written in `diamond/renderer.ts:42`, `node-size.ts:49`, `layout/metrics.ts:209`; default label `"TEXT"` |
| triangle | `resize-box.test.ts` only | `export` mixed board only | bbox hit-test (`triangle/interaction.ts:8-25`); left/right anchors off the outline; `triangle/renderer.ts:40-43` hard-codes its own label box |
| line | none | `export` mixed board only | no dash support; renders first-to-last but hit-tests every point; tolerance not zoom-aware |
| arrow | routing is well covered (section 2). `arrow/interaction.ts` (resize, handles, hit) and `arrow-utils.ts` (heads, edit handles, `drawArrow`): no test references them | `export` (orthogonal and straight dashed); fixtures are drawn in `layout-render` | arrow-tool arrows are created unattached; no manual connector label; tolerance not zoom-aware |
| arrow-bidirectional | `parse.test.ts` (`<>`), `serialize.test.ts:41`, `roundtrip.test.ts:80` (bidirectional edge survives the DSL) | `export` mixed board | no keyboard shortcut |
| freehand | none | `export` mixed board only | 8 handles drawn that do nothing |
| text | `text-foundation.test.ts` (19), `compatibility.test.ts` (11), `rich-text-renderer.test.ts` (6) | `standalone-text` (4 cases x 3 zooms x 2 fonts: 25 pass, 1 skip), `editing` (13), `rich-text-xss` (3), `export` mixed board | handles hit-test but are not drawn; empty `text` has `null` bounds (`text/geometry.ts:69`) so such an element could not be hit-tested (creation refuses empty text, `use-whiteboard-drawing.ts:823-841`; the edit-to-empty path was not checked); third width estimator; minimum font 9 (`text-metrics.ts:45`) vs 12 on resize |
| semantic-node | `node-size.test.ts` (19), `compatibility.test.ts`, `icons.test.ts` (22), `compile-regressions.test.ts` (46), `placement`, `layered-order`, `bus`, `edge-labels` | `label-alignment` (canvas vs DOM at 3 zooms, both fonts), `layout-render` (5 fixtures x 2 fonts), `icons.browser`, `export` fixtures | `labelConfig.padding: 16` is ignored (layout uses 12); `create()` default `points: []`; resize minimum 56 high is below the compiler minimum 78 |

## 2. Connector and routing coverage

| Capability | Tested by | Not tested |
|---|---|---|
| Orthogonal route search (fixed shapes, then Hanan-grid search, then last resort) | `stub-pinning.test.ts` (5), `grid-route.test.ts` (6: straight, around a wall, several rows, deterministic, walled-in, never ends inside a box) | `obstacle-avoidance.ts` (529 lines) has no dedicated suite (3 test files import it); `path-scoring`, `port-resolver` (372), `cluster-aware-router` (311), `lane-manager`, `segment-conflict-resolver`, `congestion-map`, `obstacle-detector`, `spatial-hash-grid`, `adjacency-map`: no test imports them. They run inside `route-engine` tests; with no coverage tool installed, how much is exercised is unverified |
| Incremental engine state | `route-engine.test.ts` (18: cache reuse, dirty on endpoint or mode change, prune, partial input, straight mode, repeat-call stability, 300-case seeded fuzz for no-throw and determinism) | interleaving with the React hook |
| Normalisation and crossings | `path-normalizer.test.ts` (8: 4 golden SHA-1 digests, per-arrow vs global crossing delta, endpoints and obstacle clipping, determinism, 1000 routes under a 2000 ms budget) | |
| Creating a connector from a handle | `connector-arrow.test.ts` (4: bound to both shapes, uses the obstacle-aware router, falls back if it returns nothing or throws) | the pointer flow in `use-whiteboard-drawing.ts` |
| Anchors, magnetic snap | none. `core/anchors` (175 lines), `core/snap` (189: radius 20 world units, hysteresis 1.35x, direction penalty), `core/collision` (103) have zero test files | snap at zoom != 1, hysteresis, excluded ids, grid index above 200 shapes |
| Rebind and reroute when shapes move, delete cascade, disconnect, change endpoint | none. `core/arrow/use-arrow-connections.ts` (573 lines), controller `deleteElementsWithConnectedArrows`, `bindArrowEndpoint` | all of it, including `globalPathCache` interaction |
| Segment drag, bend insert/remove | none direct (`resizeArrowElement`, `insertBendPoint`) | |
| Parallel edges, fan-out bus, edge labels | `route-engine.test.ts` (`computeParallelOffsets`), `bus.test.ts` (5), `edge-labels.test.ts` (6) | |
| Layout-level connector quality (crossings, shared-line overlaps, through-node) | `layout-benchmark.test.ts` (24) asserts the guarantees; numbers in section 6 | on user-edited boards |
| Arrow heads and dashes | pixels only indirectly through export tests | any direct assertion on head size or dash pattern |
| Connector hit-testing at other zooms | none | the tolerance is 10 world units regardless of zoom |
| Pointer-driven connector workflow (hover indicator, snap, drop, Escape cancel) | none | needs the live editor |

## 3. Text edge cases

| Edge case | Covered by | Status |
|---|---|---|
| One font stack and one line height, no derived line heights (source scans) | `text-foundation.test.ts:178-197` | covered |
| Wrap and size independent of zoom | unit at 0.25, 0.5, 2, 3 (`text-foundation.test.ts:69`); Chrome at 0.5, 1, 2 (`label-alignment`, `standalone-text`) | covered; 0.1 and 5 (the app's limits) not tested |
| Canvas ink equals DOM editor ink within 2 px | `label-alignment` (rectangle, semantic node), `standalone-text` (single line, multiline, bold heading, italic) | covered for those; **not** circle, diamond, triangle; 9 + 1 system-font cases are skipped on purpose (DOM re-wraps at screen size, canvas wraps in world units) |
| Explicit newlines | `standalone-text` multiline, `label-alignment` "explicit newline", `node-size.test.ts:31`, `editing` | covered |
| Long labels; a word is never split before the smallest size | `node-size.test.ts:58-91` ("Authentication Service", "Internationalization", "Pneumonoultramicroscopic issues"), `layout-render` (5 fixtures), `text-foundation.test.ts:160-176` | covered for compiler-sized nodes. A user-shrunk shape under about 32 px gets no label at all (`label-layout.ts:73` returns `null`); not tested |
| Resize keeps the opposite edge fixed | `text-foundation.test.ts:77-98`, `standalone-text` (w, nw, se; Inter only) | covered; font clamps 12 and 200 not tested |
| Unicode | `editing` round trips "emoji 🙂 and 日本語 and é"; `estimator` corpus has 4 CJK/accent labels; `export` mixed board draws CJK, Arabic, emoji, `café – naïve` and checks the SVG labels | partial: no bidirectional layout check, no ZWJ or combining-mark cases, Arabic never enters the editor tests |
| Markdown specials and angle brackets | `rich-text-renderer.test.ts` (`5 * 3 = 15`, `a ** b`, `<b>`, `<br>`), `editing` (`5 * 3 = 15`, `AT&T "quotes" < 5 > 3`, leading spaces, blank line) | covered |
| Hostile label HTML (DA-001) | `rich-text-xss` (5 inputs incl. `onerror`, `javascript:`, `srcdoc`), `export` hostile board | covered |
| IME composition | `editing` via CDP `Input.imeSetComposition` (one sequence) | covered once |
| Caret by click, Shift+Enter | `editing` (caret at 0.5, 1, 2; Shift+Enter) | covered. Plain Enter committing, Escape cancelling, Enter inside a shape: not tested |
| Saved boards and the 1.0 to 1.2 line-height change | `compatibility.test.ts` (anchor kept, hit-test uses the same box, AI diagram survives save and reload) | covered |
| Estimator accuracy | `estimator.browser` (46 labels x 3 sizes x 4 fonts). Asserted: Inter mean error under 2%, min above -5%, max under +5%; others min above -8% and under 10% undersized | covered; measured distribution in section 6 |
| No label shrunk or cut on compiled fixtures | `layout-render` (Inter: zero shrunk; system font: at most 10%) | covered for semantic nodes only |
| Font arrives late or changes | none (`measureLabelEditTopOffset` caches by size/weight/style, not by resolved font) | not covered |
| Dark-mode text colour and contrast (`resolveTextColor`, `getAdaptiveColor`) | none (grep finds no test) | not covered |

## 4. Fixtures

| Fixture | Where | Content | Used by |
|---|---|---|---|
| Layout documents (5) | `features/ai/server/layout/fixtures/{architecture,flowchart,mind-map,stress,auth-flow}.ts`, index `LAYOUT_FIXTURES` | architecture 17 nodes, 2 groups, 12 edge labels; flowchart 13 nodes, 4 decisions, retry loops; mind-map 25 nodes, fan-out 6; stress 41 nodes, 51 edges, 5 groups (nested and side by side), cycles, parallel and opposite edges, 3 components, long and multiline labels; auth-flow 12 nodes, 19 edges, 3 groups, kept verbatim as DSL from a real app diagram | `fixtures.test.ts` (18), `layout-benchmark.test.ts`, `compile-regressions.test.ts`, `compatibility.test.ts`, `icon-integration.test.ts`, `roundtrip.test.ts`, `eval/score.test.ts`, `layout-render.browser`, `export.browser`, `export-dialog.browser` |
| Fixture helper | `fixtures/base.ts` `fixtureDocument` | a valid `ai-diagram-v1` document around a graph | fixtures, in-flight baseline fixtures |
| Inter font | `tests/browser/fixtures/inter-latin-var.woff2` (+ README: OFL 1.1, Latin subset, weights 400 to 700) | stable metrics on any machine | every "inter" browser run |
| Calibration corpus | `tests/browser/calibration-corpus.ts` | 46 labels (short, long, mixed case, digits, CJK, accents) | `estimator.browser`, `calib.browser` (regenerates `core/text/inter-advances.ts` with `GENERATE_ADVANCES=1`) |
| Mixed-shape board | `export.browser.test.ts` `H.mixed()` | 11 elements: rectangle (3-line label), circle, diamond, triangle, freehand, line, text (CJK/Arabic/emoji), long label, orthogonal arrow, straight dashed arrow, bidirectional arrow | export suites |
| Generated large boards | `export.browser.test.ts` | 2,370 and 4,000 elements; two shapes 40,000 px apart; hostile colours, fills and labels | export suites |
| Router scenarios | `path-normalizer.test.ts` `buildScenario(seed, cols, arrows)` | seeded grids; 4 golden digests (seeds 11, 22, 33, 44) captured from the pre-optimisation implementation | routing tests |
| Text double | `text-foundation.test.ts` `fakeCtx` | width linear in font size | text unit tests |
| Baseline set (in flight) | `tests/browser/baseline-fixtures.ts`, `baseline.browser.test.ts` | 7 more diagrams (simple flow, database schema, sequence, mixed icons, nested groups, unicode, bidirectional); untracked at the time of reading | not assessed |
| **Absent** | | a saved-board JSON per version or per shape type; a pre-`ai.icon` or pre-1.2-line-height board; Liveblocks storage dumps; committed PNG/SVG goldens; a board with unregistered element types | |

## 5. Browser workflows

### 5a. What exists (all on a blank page, no signed-in session)

| File | Tests | Drives |
|---|---|---|
| `estimator.browser.test.ts` | 5 | `estimateTextWidth` / `estimateLabelBox` against `measureText` for Inter, system, Helvetica, Arial |
| `label-alignment.browser.test.ts` | 42 (33 pass, 9 skip) | `renderShapeLabel` vs a DOM element styled by `shapeLabelEditorStyle`; real `renderSemanticNodeToCanvas` panned and zoomed |
| `standalone-text.browser.test.ts` | 26 (25, 1 skip) | `renderTextToCanvas` vs `textBlockEditorStyle` vs `getTextBounds`; `resizeText` edge anchoring |
| `editing.browser.test.ts` | 13 | contentEditable round trips, Shift+Enter, caret placement, IME (the editor element is rebuilt from the style helpers; the real `ShapeLabelEditor` and `CanvasTextBlock` components are never mounted) |
| `layout-render.browser.test.ts` | 10 | each layout fixture compiled and drawn with `drawElement`; labels fit |
| `icons.browser.test.ts` | 1 | all registered icons (more than 60 asserted; 74 `add(...)` registrations in `core/icons/registry.ts`) draw ink inside the tile at 56 and 112 px, aspect drift under 0.15 |
| `canvas-ux.browser.test.ts` | 2 | alignment guides are a crisp 1 px at zoom 0.5, 1, 2.25 with a pan; cursor-anchored zoom drift under 1e-6 over 400 steps |
| `rich-text-xss.browser.test.ts` | 3 | hostile label strings run nothing |
| `export.browser.test.ts`, `export-dialog.browser.test.ts` | 21 and 12 declared; 19 and 10 in the export report | all export formats, selection, limits, clipboard, cancellation, security; the real `ExportDialog` and `useBoardExport` mounted with React and files caught from real downloads. Not re-run by me |
| `calib.browser.test.ts` | 0 (generator, skipped unless `GENERATE_ADVANCES`) | |

### 5b. Against the Phase 6 browser list (HEAD brief)

| # | Workflow | Status |
|---|---|---|
| 1 | Create a board | not covered (Clerk + Convex) |
| 2 | Add several shapes | not covered through the UI; shapes render in export tests |
| 3 | Add and edit multiline labels | partial: DOM editing and ink alignment on a blank page; the real editors and the double-click path are not exercised |
| 4 | Resize nodes | math only (`resize-box.test.ts`, `resizeText` in Chrome) |
| 5 | Move connected nodes | engine level only (`route-engine.test.ts`) |
| 6 | Change connector routes and labels | engine level; labels only via compile |
| 7 | Zoom and pan | math only (`viewport-math.test.ts`, 10; `canvas-ux`, 2); no wheel or pinch through the stage |
| 8 | Select multiple | `selection.ts` rules (7) and `arrange` (11); marquee and `getElementsInBounds` untested |
| 9 | Undo and redo | `gesture-history.test.ts` (4) with a fake history; real Liveblocks history never run |
| 10 | Save and reload | `autosave-controller.test.ts` (17), `saved-content.test.ts` (12), `compatibility.test.ts` round trip through `JSON`; no real Convex write or reload |
| 11 | Generate with the existing AI workflow | doubles only (`workflow.test.ts`, `generate-diagram-handler.test.ts`, `agent-loop.test.ts`); no live provider run committed |
| 12 | Refine through a follow-up prompt | no test found; whether the feature exists was not checked |
| 13 | Export the result | covered from module level and the real dialog; not from the live editor (the Cmd/Ctrl+Shift+E mapping is unit-tested in `keyboard-policy.test.ts`, but pressing it in the canvas, the board title in the file name and the selection coming from the canvas are not) |
| 14 | Long text, missing icons, invalid input | covered at module level (section 3, `icons.test.ts` fallbacks, `parse.test.ts` errors) |
| 15 | Authorization boundaries | rule functions only (`access-rules.test.ts` 16, `room-access.test.ts` 17, `whiteboard-access.test.ts` 3); no Convex function tests (no test file under `convex/`), no live auth |

### 5c. Not testable today without a signed-in Clerk session and a real Convex board id
Opening `/whiteboard/[id]`; every pointer, keyboard and context-menu interaction on the stage; double-click label editing through the real components; connector snapping and attachment; drag, resize, copy, paste, align, z-order; minimap; autosave and reload; the AI panel (also needs provider keys); diagram-code apply; export from the editor; two-client collaboration and cursors; organisation and billing pages; permission denial UI. Pre-existing and noted in `docs/testing/export-test-report.md`: a malformed board id crashes the page with an unhandled Convex `ArgumentValidationError`.

## 6. Visual and performance baselines

### Exist (all single-machine, single-run unless stated)

| Baseline | Source | Numbers |
|---|---|---|
| Large-board export (2,370 elements, 8810 x 3610 px) | `docs/testing/export-test-report.md` | SVG 157 ms, PNG 559 ms, longest event-loop stall 140 ms, SVG 2.2 MB, PNG 2.2 MB, JS heap +129 MB |
| Export fidelity | same | SVG vs PNG of one board: under 12% of inked pixels differ by more than 96/255; PDF page 681.75 x 457.5 pt holding a 1818 x 1220 RGB image |
| Production build | same (not re-run by me) | `/whiteboard/[id]` 187 kB, first load 361 kB |
| Layout quality, layered engine (crossings / shared-line overlaps / through-node / bends / edge length px / area M px2 / ms / mean shift when one node is added) | `docs/superpowers/reports/2026-10-16-layout-benchmark.md` | architecture 4 / 1 / 0 / 36 / 8582 / 1.8 / 25 / 102; flowchart 3 / 5 / 0 / 26 / 3699 / 1.0 / 14 / 66; mind-map 0 / 0 / 0 / 48 / 13971 / 2.0 / 11 / 188; stress 36 / 24 / 1 / 105 / 31822 / 4.5 / 45 / 51; auth-flow 4 / 9 / 0 / 44 / 8792 / 0.9 / 10 / 76. ELK (network simplex) runs 28 to 170 ms. The old compiler: 5, 8, 3, 62 crossings and 3, 1, 0, 10 colliding labels on the first four fixtures. Inconsistency inside that report: the table gives 36 crossings for stress, the prose says 39 |
| Label fit with the real renderer | `docs/superpowers/specs/2026-10-15-layout-and-routing-design.md` | 0 labels shrunk or cut on the fixtures; tightest node fills 96.6% of its wrap width with Inter, 98.8% with the system font |
| Estimator vs Chrome (46 labels, 138 samples per font) | same spec | Inter -0.85% to +4.0% (mean +0.3%); Geist -3.6% to +10.1% (mean +2.8%); system San Francisco -2.3% to +7.6%; Helvetica/Arial -5.7% to +13.4% |
| Route normalisation | comment above `PERF_BUDGET_MS` at the end of `path-normalizer.test.ts` | about 85 ms for 1000 routes after the fix, about 16.5 s before; test budget 2000 ms |
| Wall-clock budgets in unit tests | `drag-session.test.ts:52` (mean `< 4` ms for 2,000 targets), `compile-regressions.test.ts:182` (120 nodes, 240 edges, `< 20 s`), `json-extract.test.ts:36` (`< 500` ms) | the first failed once under load in my run (5.71 ms) |
| Test-count history | export report; this run | 643 unit tests (before export work), 742 (export report), 752 (this run); browser 120 passed, 11 skipped (export report) |

### Missing
- Committed visual goldens: no PNG or SVG snapshots, no `__snapshots__`; pictures are written only on request (`SAVE_LAYOUT_PNG`, `SAVE_EXPORT_DIR`). Visual checks are ink-bounding-box comparisons and statistical diffs.
- Render cost: frame time of `drawElement` for N elements, grid draw at zoom 0.1 (a 2 px grid is still drawn with one `arc` per dot), full-redraw cost while dragging, rebuild cost of bounds and spatial index per `elements` change.
- Interaction latency: pointer-move to paint, hit-test cost, snap search, interactive reroute.
- Memory growth over a long session; autosave payload size and frequency; Convex document size margin.
- AI: latency, retries, cost, quality. `npm run eval:ai` is the intended source and no `ai-eval-*.md` report is committed.
- Cross-browser (Chrome only), device pixel ratio other than 1 and 2, touch and pen input.
- Baselines from before the refactor for the editor itself (none were recorded; see "Baseline before this work" in the export report, which has unit counts only).

## 7. Prioritised coverage gaps

| Pri | Gap | Why it matters (evidence) | First test to write |
|---|---|---|---|
| P0 | No test drives the real editor | the interaction defects in `docs/architecture/draw-anything-target-architecture.md` section 7 (#8 handles, #10 tolerances, #11 pointer state machine, #15 unattached arrows, #16 default label) are reachable only there; all wiring is verified by type check and lint only | A harness page that mounts `WhiteboardCanvasStage` over an in-memory element store (no Clerk, Convex or Liveblocks), driven by Playwright pointer events. First flows: draw rectangle, double-click, type two lines, Escape; connector from handle to second shape then move the shape; reload from a snapshot string |
| P0 | No generic shape contract suite | circle, triangle, line, arrow, freehand have no bounds, hit, handle or anchor test; defects found by reading are uncaught (triangle bbox hit-test, triangle left/right anchors, freehand dead handles, text invisible handles, circle edge-resize translation) | One parametrised suite over `shapeRegistry.list()` (see architecture doc section 10) |
| P0 | Connector stack untested | `core/anchors`, `core/snap`, `core/arrow/use-arrow-connections.ts`, `arrow/interaction.ts`, `arrow-utils.ts`, controller delete cascade: 0 tests for about 1,360 lines | Unit tests for `generateAnchorsForShape`, `findNearestSnap` (radius, hysteresis, exclusion), `resizeArrowElement` (start, end, segment), `rerouteConnectedArrowsForChanges` with a fake obstacle index |
| P0 | Persistence compatibility | `metadata.version` is never read, nothing validates elements, no golden boards, no migration seam, seeding race and size limit unguarded | Golden snapshot per shape type plus an AI board: `parse -> seed -> serialize` keeps geometry; a snapshot with an unknown element type is preserved; a newer `version` is refused for writing |
| P1 | Label parity for circle, diamond, triangle | the editor uses the whole bbox, the canvas 0.72 / 0.66 / 0.5 x 0.4; `label-alignment` covers rectangle and semantic node only | Extend `CASES` in `label-alignment.browser.test.ts` with the three types once a shared label-region provider exists; until then the test documents the mismatch |
| P1 | No CI; silent skips; hidden dependency | `.github` absent; browser suites skip without Chrome; `esbuild` is not in `package.json` (it resolves through `convex`; `npm ls esbuild` marks the hoisted 0.25.4 as invalid for vite's requested range); `vitest.config.ts` does not exclude `.claude/**` | CI workflow running tsc, lint, unit and browser suites; fail instead of skip when `CI=1` and no Chrome; declare `esbuild`; add `.claude/**` to `exclude` |
| P1 | No visual goldens | export fidelity is compared statistically (12% threshold); layout is judged by metrics | Commit small SVG goldens for the mixed board and 2 fixtures and diff geometry (not pixels); keep PNG diffs advisory |
| P1 | No performance benchmarks | structural hot spots (grid loop, per-change index rebuild, full redraw) have no numbers; the only timing assertions are wall-clock budgets that fail under load | A node-side bench for `getShapeBounds` + index build at 1k, 5k elements; a Chrome bench for `drawElement` frame time with and without grid at zoom 0.1; replace the `< 4` ms assertion with a relative or recorded bound |
| P1 | AI quality has no recorded baseline | eval harness exists, no report; legacy pipeline tested with doubles | Run `npm run eval:ai` with keys, commit the generated report as the baseline |
| P2 | Dark theme and contrast | `resolveTextColor`, `getAdaptiveColor`, chrome colours untested; only `render-theme.test.ts` (4) and the export theme-independence test | Unit tests for contrast selection; a Chrome check of dark-mode label ink |
| P2 | Weak or skipped assertions | `fixtures.test.ts:104` asserts `shrunk + dropped <= elements.length` (always true); 10 system-font tests skipped; `drag-session` timing flake | Assert the recorded baseline counts; make the system-font cases compare against the DOM at the same screen size |
| P2 | Zoom limits and DPR | text and labels tested at 0.25 to 3 (0.5 to 2 in Chrome); the app allows 0.1 to 5; DPR 1 and 2 only in export | Add 0.1 and 5 to the zoom lists; one DPR 3 run |
| P2 | Collaboration, permissions, Convex functions | rules unit-tested; no Convex function test file; no two-client test | Convex function tests with a mock ctx for `whiteboard.update/getById`; a two-page Liveblocks test once the harness exists |
| P3 | Accessibility and keyboard reachability | the stage has no `role`, label or `tabIndex` (grep of `whiteboard-canvas-stage.tsx`); no test | Keyboard-policy tests exist (24); add focus-order and screen-reader smoke checks in the harness |
| P3 | Other browsers, touch and pen | Chrome only | Run the browser suites with Firefox and WebKit through `playwright-core` once the harness exists |

## 8. Not verified here
- Which lines of the untested routing files run under `route-engine` tests (no coverage provider installed).
- The live editor, collaboration, autosave against real services, AI against real providers.
- Browser results for the export suites (not re-run) and for the in-flight `pill` and baseline tests.
- Whether a follow-up-prompt feature exists (workflow 12).
