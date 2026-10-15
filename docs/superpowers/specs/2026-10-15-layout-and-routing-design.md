# Sub-project B: Layout and routing quality (spec, not yet approved or implemented)

Revised after the Sub-project A verification pass. Fixtures and the text interfaces B depends on now exist.

Depends on Sub-project A (`docs/superpowers/specs/2026-10-15-text-foundation-design.md`).
Decision to make: keep and extend the in-repo layered layout, or adopt ELK.js / dagre. **Not decided here.**

## What the current engine does (read from code, 2026-10-15)
- `features/ai/server/layout/layered-order.ts` (272 lines): `orderRows` (barycentre sweeps, group-contiguous clusters, crossing counting) and `assignCenters` (per-row x placement, 4 sweeps). 12 tests.
- `canvas-compiler.ts` (545 lines): one top-down layered layout for every `diagramType`. `diagramType` only changes how depth is computed (`architecture` uses `LAYER_ORDER`; everything else uses longest-path from sources). No radial/tree layout for mind maps, no lane layout for sequence diagrams, no ER-specific layout.
- Node boxes: width from the A estimator (168-280); **height fixed at 78 (92 for decisions)**. With A's 12px padding and the renderer's `0.72*height` label region, a 17px label fits one line; a two-line label is shrunk to about 13px. This is a text/size interaction B must fix by sizing height from `estimateLabelBox`.
- Edges: `core/routing` orthogonal router (obstacle-aware A*, lane assignment, crossing minimiser). Edge labels are placed on the longest segment by `edgeLabelPosition` with no collision check against other labels or nodes.
- Group frames: `isGuide` rectangles around members, omitted when a non-member would be enclosed.

## Interfaces A provides (now verified in Chrome)
- `estimateLabelBox({label, fontSize, fontWeight, maxLines, minWidth, maxWidth, insetWidth})` -> `{width, height, lineCount, fits}`: node size from text with no DOM. Validated against Chrome over 138 measurements: Inter error -0.85%..+4.0%; includes a 2% margin, no Inter node in the corpus comes out narrower than its text.
- `layoutShapeLabel(ctx, ...)`, `getShapeLabelRegion(type, bounds)`: the same wrapping and label box the renderer and editor use. A node size B computes can be checked against the real renderer in a browser test.
- `estimateTextWidth(text, size, weight)`: edge-label boxes for collision avoidance.
- Text elements are `lines x fontSize x 1.2` tall, anchored top-left.
- **Caveat B must plan around:** the app does not load Inter, so on a system font widths are not linear in font size (up to ~12% across 0.5x-2x) and the estimate can be a few percent off either way. B should size nodes with a margin, and the font-loading decision recorded in the Sub-project A spec should be settled before B's pixel-level acceptance numbers are trusted.

## Fixtures (done, in `features/ai/server/layout/fixtures/`)
`LAYOUT_FIXTURES` = `architecture` (17 nodes, 19 edges, 2 groups, 5 layers, 15 node kinds (each draws an icon placeholder: a mapped abbreviation or the two-letter fallback), 12 edge labels, dashed edges, one multiline label and one 47-character label), `flowchart` (13 nodes, 15 edges, 4 decisions with yes/no branches, a retry back edge, 2 multiline labels, 46- and 56-character labels, 8 edge labels), `mind-map` (25 nodes, 24 edges, root fan-out 6, radial hints, labels 7-36 characters, every node kind `generic` so no icons, no edge labels). `fixtures.test.ts` checks they are valid and still contain each required case, so an edit cannot quietly weaken the comparison. Every engine under comparison must consume exactly these documents.

## Baseline for the current engine (measured with the estimator, fixed 78px node height)
Nodes whose label cannot be drawn at the requested 17px: architecture **5 of 17**, flowchart **5 of 13**, mind-map **8 of 25** (shrunk to 13-16px; none cut off). Examples: `Authentication service gateway` and `Primary PostgreSQL database cluster (eu-west-1)` -> 13px; `Lock account for 15 minutes and notify the user by email` -> 13px. This is the cost of fixed node height and a 280px width cap, and the main thing dynamic node sizing must remove. Re-measure with `DEBUG_BASELINE=1 npx vitest run features/ai/server/layout/fixtures`. Crossing, overlap and stability baselines are still to be measured (plan step 3).

## Evidence required before choosing ELK
Run **the current engine and every candidate (ELK.js, dagre if relevant) on the identical fixtures above**, with identical node sizes (from `estimateLabelBox`), identical group membership and the same routing stage, and report per fixture:
1. Connector crossings (edge-edge) and edge-through-node overlaps, counted geometrically on the compiled elements, not by eye.
2. Edge-label collisions: label-label, label-node and label-other-edge overlaps using `estimateTextWidth` and the 1.2 line height; count labels that cannot be placed without a collision.
3. Node-size correctness: nodes whose label shrinks below the requested size or is cut (baseline above); must be zero for multiline and long labels after dynamic sizing.
4. Layout stability: (a) same input, same output across runs; (b) add one node or edge, then measure how many existing nodes move and how far; (c) re-layout after manually moving a node keeps that node where the user put it.
5. Total edge length and bend count; compactness (bounding-box area).
6. Wall-clock for 20/50/100 nodes (Node, and in the browser if it would run client-side).
7. Integration cost: accepts our per-node sizes and ports, returns bends `core/routing` can refine, runs in the AI route, bundle size, **licence** (confirm before adopting: elkjs is EPL-2.0, dagre MIT).
8. Browser confirmation: render each result on the real canvas (Chrome harness from `tests/browser`) and check labels actually fit with Inter loaded.
Adopt a library only if it beats the current engine on 1, 2 and 4 for architecture and flowchart, is not worse on the mind map, and passes 3, 6 and 7. If the existing engine can reach the same numbers with dynamic sizing plus label placement, keep it.

## Likely scope (to be confirmed by the evidence)
- Dynamic node sizing: width and height from `estimateLabelBox` for multiline and long labels (replaces the fixed 78/92px height and the 280px cap), with decision-diamond text insets.
- Per-`diagramType` layout strategy (layered, tree/radial, sequence lanes) behind one `LayoutStrategy` interface.
- Ports as first-class (`ConnectionHandle` per edge) and fewer crossings.
- Edge-label placement with collision avoidance (label-label, label-node, label-edge) and an explicit "cannot place" outcome instead of overlapping.
- Stable layout and a re-layout command that preserves manually moved nodes (`ai.role`/`semanticId` identify generated elements).
- Not in B: icons (C), canvas UX (D), the app-wide font-loading change (decide under Sub-project A).

## Acceptance criteria
1. **Dynamic node sizing:** on all three fixtures no node's label is shrunk below its requested size or cut, including the multiline and 46-56 character labels; node boxes are never narrower than `estimateLabelBox` says the label needs; a Chrome check with Inter loaded confirms the real renderer draws each label at the requested size.
2. **Edge-label collisions:** zero label-label and label-node overlaps on the architecture and flowchart fixtures; labels that cannot be placed are reported, not overlapped. Test counts geometrically.
3. **Connector crossings:** crossings and edge-through-node overlaps on architecture and flowchart are strictly lower than the baseline measured in plan step 3; mind map is not worse.
4. **Layout stability:** deterministic output for identical input; adding one node or edge moves at most a stated fraction of existing nodes (threshold fixed from the baseline before implementing); a manually moved node survives re-layout.
5. **Engine comparison:** a committed report compares the current engine and ELK.js on the identical fixtures with the metrics above, including runtime and licence, and the choice is justified by it. No dependency is added without that report.
6. Existing `canvas-compiler`, `layered-order` and `fixtures` tests keep passing; saved diagrams still load (no stored-format change without a demonstrated need); all label boxes come from A's sizing functions; AI providers unaffected.
7. `tsc`, `vitest`, `npm run test:browser`, lint and build all run and are reported honestly, with anything unrunnable stated.

---

# Outcome (2026-10-16): implemented

Benchmark, evidence and decision: `docs/superpowers/reports/2026-10-16-layout-benchmark.md`.

## Decision
Keep the in-repo layered engine, improved; **ELK.js is not adopted** (it stays a dev dependency used by the
benchmark only). On identical input the improved layered engine matches or beats ELK on edge length,
drawing size, label collisions, group containment and stability, and is within a few crossings everywhere
except the flowchart, where ELK is better (1 vs 3). It stays synchronous with no new runtime dependency.

## Measurement contract
| Layer | Rule | Where |
|---|---|---|
| **World space** | Everything stored (node points, arrow points, text anchors) is world units at zoom 1. | element JSON |
| **Screen space** | Zoom only scales world geometry when drawing. No layout or wrapping decision depends on zoom. | `core/text/label-layout.ts` (Sub-project A) |
| **Server / compile (no DOM)** | A node's size is computed from its label by the deterministic estimator (Inter advance widths, 4% margin) and written into the stored points. The compiler never measures a font. | `core/text/node-size.ts`, `estimate.ts` |
| **Browser** | The renderer lays the label out inside the stored box with the real `measureText`; if it still does not fit it shrinks the text. It never changes stored geometry. | `layoutShapeLabel`, `renderShapeLabel` |
| **Selection / hit-testing** | Node boxes are the stored points; standalone text uses real-measured bounds. | shape definitions |
| **Estimator vs reality** | `estimateLabelBox` plus margin must hold the label under the real renderer; this is a test, not an assumption. | `tests/browser/layout-render.browser.test.ts`, `estimator.browser.test.ts` |

The estimator is per font; the table is regenerated from a font file with `GENERATE_ADVANCES=1 npm run test:browser`.

### Geist vs Inter (the brief's premise, checked)
**Geist is used only by the DOM UI** (`--font-sans`). Every canvas and editor font comes from the
`FONT_FAMILY` stack (`Inter, system`), so canvas text never renders in Geist; the stack is not changed here.
Measured in Chrome over the 46-label corpus (138 samples): Geist is on average **2.4% narrower than Inter**
(range -8.5% to +3.9%). The Inter estimate against each font: Inter -0.85% to +4.0% (mean +0.3%), Geist
-3.6% to +10.1% (mean +2.8%), system San Francisco -2.3% to +7.6%, Helvetica/Arial -5.7% to +13.4%.
The box margin was raised from 2% to **4%** to cover the narrowest of Inter, San Francisco and Geist.
Switching the canvas to Geist (or loading Inter) is a typeface change and is left to a separate decision; if
taken, regenerate the advance table from that font so the server estimate matches what is drawn.

### Verified in Chrome with the real renderers
All four fixtures compiled and drawn with `drawElement`: **0 labels shrunk and 0 cut** under both Inter and the
system font. The tightest node fills 96.6% of its wrap width under Inter and 98.8% under the system font
(`tests/browser/layout-render.browser.test.ts`; `SAVE_LAYOUT_PNG=<dir>` keeps pictures for inspection).

## What changed (files)
- `core/text/node-size.ts` (new), `label-region.ts` (region = whole node height, up to 4 lines), `estimate.ts` (4% margin).
- `core/routing/grid-route.ts` (new), `obstacle-avoidance.ts` (search before the intersecting last resort),
  `orthogonal-router.ts` (stub pinning no longer overwrites bends).
- `features/ai/server/canvas-compiler.ts`: prepare -> place -> build pipeline, dynamic sizing, cycle-aware layering,
  geometry-based connection handles, `compileAIDiagramDetailed` with diagnostics, pins and a grid fallback.
- `features/ai/server/layout/`: `types`, `layered-placement` (components, row heights), `layered-order`
  (nested group contiguity, label room), `group-separation`, `bus`, `edge-labels`, `pins`, `grid-placement`,
  `geometry`, `metrics`, `frame-constants`, fixtures incl. `stress`, `benchmark/` (ELK engine and the benchmark).
- `features/diagram-code/pins.ts`, `canvas.ts` and the editor/controller: manual positions survive regeneration.
- `features/ai/server/agents/canvas-compiler-agent.ts`: uses the detailed result and logs diagnostics (ids and counts only).

## Dynamic sizing behaviour
Width: the fewest lines (up to 4) that fit within 168-280 px (150/190 for compact/spacious density), then the
narrowest width for that many lines. Height: lines x 20.4 + 24 px padding, never below 78 px (92 for decisions).
`sizeSemanticNode` is the exact inverse of `getShapeLabelRegion` + `layoutShapeLabel`, so the renderer produces the
line count that was sized for. Optional metadata / secondary labels: the semantic-node renderer draws only the
label and icon, so there is nothing to size; add it when the renderer draws secondary text (Sub-project C).
Existing nodes saved at 78 px now show 2-line labels at full size (the old region was 72% of the height).

## Manual positions and regeneration
Applying edited diagram code to an existing diagram keeps nodes the user dragged where they put them, with no
stored-format change. Moved nodes are found by recompiling the diagram's own graph (the layout is
deterministic) and comparing node centres after removing any common shift (so dragging the whole diagram is not
a manual choice); those nodes are pinned, everything else is laid out around them and overlaps are resolved
sideways. A board laid out by another engine version looks "all moved", so every position is kept: wrong in the
safe direction. Detection runs at apply time on the current elements. Layout is pure and synchronous, so a late
layout result cannot overwrite a newer edit; the apply is one undo step (unchanged). AI generation adds a new
frame and does not touch existing elements; regenerating from the AI prompt is unchanged.

## Acceptance criteria against evidence
| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Dynamic sizing: no label shrunk or cut on the fixtures incl. multiline and 46-56 char labels; boxes never narrower than the estimate; real renderer confirms | `compile-regressions.test.ts`, `node-size.test.ts`, `layout-render.browser.test.ts` (Chrome, Inter and system) | met |
| 2 | Edge-label collisions: zero on architecture and flowchart; unplaceable labels reported | benchmark guarantees (0 on all four fixtures), `edge-labels.test.ts` | met (0 on all four) |
| 3 | Crossings and pass-throughs lower than baseline on architecture and flowchart; mind map not worse | baseline 5 / 8 / 3 -> 4 / 3 / 0; pass-throughs 0 / 0 / 0 (stress 2 -> 1) | met |
| 4 | Stability: deterministic; adding a node moves few nodes; manual node survives relayout | determinism asserted for all engines; stress 51 px / flowchart 66 px mean shift; pin tests | met for determinism and pins; "moves few nodes" is relative: see report |
| 5 | Engine comparison report incl. runtime and licence; choice justified | `2026-10-16-layout-benchmark.md` | met |
| 6 | Existing tests pass; saved diagrams load; no stored-format change | 469 unit tests; round-trip and field-set tests | met |
| 7 | tsc, vitest, test:browser, lint, build reported honestly | see final report | see below |

## Known limitations
- Flowchart crossings: ELK network simplex reaches 1 where layered has 3.
- Dense graphs (stress, 39 crossings) are readable but busy; the layered engine does not add long-edge dummy nodes.
- Mind maps are a top-down tree and become very wide (18 leaves in a row); a radial layout would fix that.
- The server estimate is for Inter; other fonts differ by a few percent either way (4% margin; browser shrink is the net).
- Fan-out bundling and the grid search only run at compile time and when a user later drags a connected node;
  interactive routing is otherwise unchanged.
- The full editor was not exercised end to end: the whiteboard needs a signed-in Clerk user and a real Convex id.
  The app boots and serves in Chrome; the editor flows are covered through extracted modules and real-Chrome tests.
