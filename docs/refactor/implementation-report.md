# Implementation report (2026-10-16, first pass)

## Baseline (before changes)
- `npx tsc --noEmit`: clean. `npm run lint`: clean (CLAUDE.md's "32 errors" is stale). `npx vitest run`: 59 files, 643 tests pass.
- `REFACTOR.md` was already deleted in the working tree before this pass; left as is.
- Not run: `npm run build` (needs Clerk and Convex keys), `npm run test:browser`, `npm run eval:ai` (live provider keys).

## Changes
1. Security: DA-001 and DA-002, see `docs/audits/draw-anything-security-audit.md`.
2. AI flowcharts (handoff note `docs/superpowers/notes/2026-10-16-handoff-ai-shapes-colors.md`, items 2 and 4):
   - Root cause of the pink "Start"/"Dashboard": the worked example in `diagram-agent/prompt/examples.ts` tagged `Start` as `kind: decision`, and the model copied it. Example corrected.
   - Flowchart playbook now says `decision` only for branching questions.
   - `workflow`, `parallel`, `retry`, `loop` had no entry in `KIND_COLORS` (rendered plain white); added.

3. Real decision diamonds (handoff item 1): the compiler emits `type: "diamond"` for `kind: decision` (no icon tile). `sizeDiamondNode` (`core/text/node-size.ts`) sizes it so the text block fits the rhombus (w/W + h/H <= 0.95), not just its bounding box. `isNodeElement` (`layout/metrics.ts`) lets metrics treat diamonds as nodes, and `diagram-code/pins.ts` now pins them. Connectors attach to the diamond's four vertices. 6 new tests; `fixtures.test.ts` now counts nodes with `isNodeElement` (same expected count). Not checked visually in a browser.

## After
`tsc` shows only stale `.next/types` include errors (build-cache files, not source), lint clean, 643 of 643 tests pass.

## Not done in this pass (nothing here is claimed as done)
- Pill/ellipse start and end nodes (no pill shape exists; the circle shape is centre plus radius). Process steps stay rounded semantic nodes.
- Shrinking the agent prompt for the Groq token limit (item 3).
- Eraser feature matrix, canvas regression matrix, target-architecture doc, visual regression, performance benchmarks, export audit, draw.io export.
- Dependency upgrades (DA-003) and CSP (DA-004).
- Browser verification of any change. No test covers DA-001.

## Suggested next order
DA-003 dependency bump with a real build, then a Chrome test for DA-001, then handoff items 1 and 3.

---
# Pass 2 (2026-10-16): Eraser research, diagram code, export

## Changes
- **Eraser matrix** (`docs/audits/eraser-feature-matrix.md`): evidence-labelled comparison from Eraser's public docs.
- **Diagram code**: `-` and `--` lines, connection `[color: x]`, node `shape: diamond` and `color`, warnings for `---`-style tokens, unterminated edge colours and bad colours (functions with commas no longer split into several warnings). Behaviour change: a standalone ` - ` in an unquoted name now means a line; the serializer quotes such names.
- **Export system** (`features/whiteboard/export/`, `use-board-export.ts`, `export-dialog.tsx`): PNG 1-3x, SVG, PDF (raster), transparency, selection-only, copy as image, limits, cancel, typed errors. See `docs/testing/export-test-report.md`.
- **Render theme** (`core/theme/render-theme.ts`): the five render paths that read the page's `dark` class now go through one function, so exports are always light.
- **Icons**: `drawIconTile` can hand each glyph path to a vector context (`PathDataSink`, explicit `isPathDataSink` marker).
- **Tests**: unit 643 -> 742, browser export 29, XSS regression 2; `harness.ts` gained `secure` (localhost origin for the Clipboard API) and `ui` (real React components) options.

## Real defects found by verifying in Chrome (all fixed)
1. SVG text sat 2-3 px low (canvas `middle` baseline vs SVG `dominant-baseline`).
2. Some SVG icons were wrong: separate glyph paths joined into one path string.
3. My icon change broke three existing icon tests (a test double that answers to any method name looked like a vector context); found by the full unit run, fixed with an explicit marker, regression tests added.
4. PDF shared the PNG's 64 MP limit though it holds the pixels about three times.

## Pre-existing issues found (not fixed)
- Malformed board id crashes the board page (DA-006).
- Multi-line labels lose their line breaks in the code view.
- Fixtures over the 40-node limit lose nodes in the code path, with a warning (by design).

## Not done
Signed-in editor test of the export wiring (needs a Clerk login), Safari/Firefox, vector PDF, copy-as-SVG, a shortcut for copy-as-image, DA-003 dependencies, DA-004 CSP, BPMN lanes, image-to-diagram, templates, comments, version history.
