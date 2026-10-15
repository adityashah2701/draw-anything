# Sub-project A: Text foundation

Status: approved by the user to implement directly (REFACTOR.md, "do not stop at planning").
Scope source: `REFACTOR.md` §5. Siblings: B layout/routing, C icons/nodes, D canvas/UX.

## Reference check
`morluto/rea` is a reverse-engineering MCP server. Searched for `measureText`, `fillText`, `<canvas`,
Konva/Excalidraw/Fabric/textarea: one hit in the whole repo (`website/public/assets/dino-demo.js`, a game).
It contains no text-layout or diagram code, so nothing was reused from it.

## How text works today (traced)
| Stage | Where | Behaviour |
|---|---|---|
| AI/DSL -> element | `features/ai/server/canvas-compiler.ts`, `features/diagram-code/canvas.ts` | Node width from `estimateWidth` (longest word * 4); edge-label width `len * 13 * 0.56`; fixed `fontSize: 17/13` |
| Standalone measure | `core/shapes/text/geometry.ts` | Real `ctx.measureText` when a context exists, else `0.62 em/char` guess |
| Standalone render | `core/shapes/text/renderer.ts` | line height 1.0 |
| Standalone edit | `canvas-text-block.tsx` | CSS line height 1.2 |
| Standalone resize | `core/shapes/text/interaction.ts` | re-measures with **no** context (the guess) |
| Shape label | `core/shapes/base/shape-label-renderer.ts` | works in screen px: font = `size*zoom`, padding `clamp(12*zoom,8,24)`, min font 9 screen px |
| Shape label edit | `whiteboard-editing-overlays.tsx` | calls the same `measureShapeLabel` in screen px |
| Persist | element fields `text`/`label`, `fontSize`, `fontWeight`, `fontStyle` | no layout stored; recomputed on load |

## Confirmed root causes (reproduced by `core/text/text-foundation.test.ts`)
1. **Label layout is a function of zoom.** Wrapping, font size and padding are decided in screen px with a 9px floor. At 25% a label returns `null` (vanishes); at 50% the same label ellipsizes to `Authenticatio…` where 100% wraps to two lines.
2. **Two line heights.** Standalone text draws and measures at 1.0 but edits at 1.2, so entering edit mode shifts glyphs by `0.1*size` and the selection box is shorter than the editor.
3. **Two font stacks.** `text-metrics.ts` says `Inter, sans-serif`; labels, editors and `rich-text-renderer.ts` use the full stack. A third copy is hard-coded in the semantic-node renderer.
4. **Resize measures with a guess.** `resizeText` re-measures without a context, so with a west/north handle the opposite edge drifts by `(realWidth - guess)`.

Non-bug (checked): north-handle resize already holds the bottom edge.

## Design
New framework-free module `core/text/`:
- `typography.ts` - the only definition of font family, line-height ratio, weight defaults, font string.
- `measure-context.ts` - `MeasureContext = Pick<CanvasRenderingContext2D, "font" | "measureText">`. The rich-text wrapper only uses those two members, so it, and tests, accept any such object.
- `label-layout.ts` - `layoutShapeLabel(ctx, input)` computes wrapping, font fit and block size **in world units**. Renderers multiply by zoom afterwards. Same input -> same line breaks at every zoom.
- `estimate.ts` - `estimateTextWidth` / `estimateLabelBox`: deterministic, canvas-free sizing for server code (the AI compiler). Documented as an estimate.

Existing modules stay as thin callers: `text-metrics.ts` and `shape-label-renderer.ts` re-export from `typography.ts`, and `measureShapeLabel` / `renderShapeLabel` keep their signatures (they convert screen -> world -> screen), so the five shape renderers and the editor need no change.

`resizeText` takes the original size from `originalBounds` (already measured with the real context) and scales it by `nextFontSize / fontSize`; width is linear in font size for single-font text.

### Compatibility
No stored field changes, so no migration. Standalone text height grows 20% (1.0 -> 1.2 line height); the stored top-left anchor is unchanged, so only selection boxes and connector anchors on text move by that amount. Shape-label font choices at 100% zoom are unchanged.

### Non-goals (with reason)
- Per-element horizontal alignment / fixed-width text boxes: needs a new stored field; no bug depends on it. Shape labels stay centred, standalone text left.
- IME/caret: left to the browser's contenteditable; no logic of ours to test without a DOM.
- Embedded font metrics table: estimate only; see "Interfaces for B".

## Acceptance criteria
1. One font family and one line-height ratio exported from `core/text/typography.ts`; no other literal copies in text code.
2. `layoutShapeLabel` output (lines, world font size) is identical for zoom in {0.25, 0.5, 1, 2, 3}.
3. A label that fits at 100% never disappears or ellipsizes at lower zoom.
4. Standalone text bounds height = `lines * size * 1.2` and equals the editor's CSS line height.
5. West/north/corner resize keeps the opposite edge fixed to 1e-3.
6. `estimateLabelBox` returns a box in which `layoutShapeLabel` (using the same estimator as its measurer) neither truncates nor shrinks.
7. Legacy elements (no new fields) layout and measure without error.
8. `npx tsc --noEmit`, `npx vitest run`, `npm run lint` (no new errors), `next build` results reported honestly.

## Interfaces Sub-project B needs (provided here)
- `estimateLabelBox({label, fontSize, fontWeight, maxWidth, maxLines, padding}) -> {width, height, lines}`: node size from text before layout, no DOM.
- `layoutShapeLabel` with an injected `MeasureContext`: the same wrapping the renderer uses, so B can verify a computed node size against the real renderer in tests.
- `estimateTextWidth(text, fontSize, weight)`: edge-label boxes for collision avoidance.
Open for B: the estimate error versus real Inter metrics (needs a measured table or a headless-browser calibration) decides whether ELK needs real measured sizes.

---

# Verification and hardening pass (2026-10-15)

## Environment
System Chrome 155 driven by `playwright-core` (the only added dependency; no browser download). `npm run test:browser` bundles the real modules with esbuild (`tests/browser/harness.ts`) and runs each check twice where fonts matter: **inter** (real Inter from `tests/browser/fixtures`, OFL) and **system** (what this OS resolves for the app's font stack). The ordinary `npx vitest run` excludes `*.browser.test.ts`. If no Chrome is found the browser suites skip; set `CHROME_PATH` to point at one.

## Finding that changes the premise: the app never loads Inter
`app/layout.tsx` loads Geist only, yet every canvas and editor font stack starts with `Inter`. Unless the user has Inter installed, text renders in the system fallback (San Francisco on macOS, Segoe UI on Windows). Measured in Chrome: canvas and DOM agree *at a given size*, but system-font width is **not linear in size** (`Hello world`, 20px: 108.3 / 97.8 / 95.4 px per 1x at 0.5x / 1x / 2x, about 12% spread; Inter is exactly linear). Consequences with a system font: bounds and wrapping decided at 1x differ from what is drawn at other zooms, the DOM editor can re-wrap a label the canvas wrapped differently, and resizing drifts the opposite edge by a few pixels. **Decision needed (not made here):** load Inter in the app (self-hosted `@font-face` plus `document.fonts.load` before first draw and a redraw on `document.fonts.ready`), or draw and edit text at the world font size under a scale transform so metrics stay linear whatever the font. Until then criteria 2 and 5 hold exactly for Inter and approximately for system fonts. Wrap-sensitive browser cases and resize are therefore asserted under Inter only and skipped for the system font, with the reason in the test.

## Bugs the browser tests found and this pass fixed
| # | Bug | Evidence | Fix |
|---|---|---|---|
| 1 | Shape-label editor 2-3px below the canvas label at zoom >= 1 | ink boxes, `label-alignment.browser.test.ts` | Probe measured the wrong baseline (integer `fontBoundingBoxAscent`); now `alphabeticBaseline` from a `top` baseline minus half-leading, fractional (`shape-label-editor-style.ts`) |
| 2 | Standalone text drawn ~0.1em higher than its editor (jumps on edit) | ink boxes, `standalone-text.browser.test.ts` | Canvas used `textBaseline: "top"` (em-square top); now draws on the CSS first baseline (`core/text/baseline.ts`) |
| 3 | Semantic-node label editor centred on the whole node, not beside the icon; uncapped lines | spec item 4; mutation check: test fails at 0.5/1/2x when reverted | One `getShapeLabelRegion` shared by renderer and editor (`core/text/label-region.ts`) |
| 4 | Wrapped lines centred including the trailing space (3px sideways shift) | ink boxes | trailing whitespace trimmed in `layoutShapeLabel` |
| 5 | Unmatched `*` in a stored label (AI/imported text like `Rate * Limit`) lost its asterisk and italicised the rest; opening the editor appended a closing `*` | `editing.browser.test.ts` | unmatched `*`/`**` stay literal (`rich-text-renderer.ts`); unit tests |
| 6 | Editor opened with 20px / weight 600 while the canvas drew 16px / 500, then wrote those values back | code reading | shared defaults (done in the first pass) |
| 7 | Default label weight changed when a label shrank across 18px | unit test | weight resolved from the requested size |
| 8 | A fourth, zoom-dependent label renderer (`drawShapeLabel`) with its own font and line-height copies | grep; zero callers | deleted (121 lines) |

## Standalone text +20% height (item 5)
Stored data is `points[0]` (top-left), `text`, `fontSize`, `fontWeight`, `fontStyle`; none changed, none migrated. The box grows downward from the same anchor. Consumers of the bounds: selection outline, hit-test (same box), and routing obstacles (`isRoutingObstacleElement` treats text as an obstacle, so arrows keep 0.2em more clearance below text). **Text has no connector anchors** (`getTextAnchors` returns `[]`), so no connection can move; the earlier claim that "connector anchors move" was wrong. The AI compiler placed edge labels assuming height = font size; it now uses the line height. Tests: `core/text/compatibility.test.ts` (legacy element read back unchanged, JSON snapshot round trip with identical geometry, hit-test band, no anchors, edge-label height) and the browser check that the selection height equals the editor's height at 0.5/1/2x.

## Estimator validation (item 6)
138 measurements (46 labels x 3 size/weight pairs) against Chrome `measureText`, error = estimate / real - 1:

| font | before (char classes) | now (Inter advance table) |
|---|---|---|
| Inter | -10.3% .. +23.9%, mean +2.5% | **-0.85% .. +4.0%, mean +0.3%** |
| system (SF) | -7.5% .. +30.2% | -2.3% .. +7.6%, mean +3.2% |
| Helvetica / Arial | -4.5% .. +35.0% | -5.7% .. +13.4%, mean +4.3% |

The old table undersized wide-letter labels by up to 10% (a node sized from it would wrap or shrink). `estimateLabelBox` now also keeps text within 98% of the line, and no Inter-sized box in the corpus is narrower than the real text. Remaining weakness: no kerning, Latin-1 accents by base letter, CJK as 1em, other scripts a flat average. On Helvetica/Arial a few labels come out up to 5.7% narrower than the real text (under 10% of the corpus). The estimate stays a fallback for code without a DOM; it is not ground truth. Test: `tests/browser/estimator.browser.test.ts`; regenerate the table with `GENERATE_ADVANCES=1 npm run test:browser`.

## Acceptance criteria against evidence
| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | one font stack, one line-height ratio | source-scan test (font stack in exactly one file; no `fontSize * 1.2` copies) | met |
| 2 | label layout identical at all zooms | unit (zoom 0.25-3, linear fake font); browser Inter 0.5/1/2x pixel match | met for Inter; approximate for system fonts (see finding) |
| 3 | a label that fits at 100% never vanishes or ellipsizes at lower zoom | follows from 2; zoom 0.25 case was returning `null` before | met for linear fonts |
| 4 | standalone height = lines x size x 1.2 = editor height | unit; browser selection height vs `getBoundingClientRect` at 3 zooms, both fonts | met |
| 5 | resize keeps the opposite edge fixed to 1e-3 | unit (west/north); browser Inter drift 0 and 1.4e-14 | met for Inter; system fonts drift by a few px |
| 6 | `estimateLabelBox` result holds the label under the real layout | unit; browser: no Inter node undersized across the corpus | met for Inter; <10% of labels slightly narrow on Helvetica/Arial |
| 7 | legacy elements work, no migration | compatibility tests (stored element deep-equal after parse, same geometry) | met |
| 8 | checks run | tsc, vitest (366), browser (76 pass, 11 skipped by design), lint, build | all run and passing (see report) |

## Not verified
The whole Next.js app in a browser (needs Clerk, Convex and Liveblocks credentials), so the React components themselves (focus handling, drag, toolbar) are exercised only through their extracted style/position functions; Safari and Firefox; Windows and Linux system fonts; devicePixelRatio other than 1; a real OS input method (IME is simulated through Chrome's `Input.imeSetComposition`); touch input.

## Known edge
`normalizeRichTextInput` treats a label that looks like HTML (`<b>x</b>`) as HTML when the editor opens, converting it to markdown. Looks deliberate (paste support), so it is left alone.
