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
