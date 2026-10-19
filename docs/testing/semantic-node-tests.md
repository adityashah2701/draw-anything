# Semantic node redesign: what was run, and what is not covered

Date: 2026-10-19. Design and decisions: `docs/superpowers/specs/2026-10-19-semantic-node-design.md`.

## Results (run in this change)

| Command | Before (commit `b963148`) | After (commit `e455be3`) |
|---|---|---|
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` | clean | clean |
| `npx vitest run` | 115 files, 1598 tests passed | 124 files, 1743 tests passed |
| `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx vitest run --config vitest.browser.config.ts` | not run before the change (see below) | 26 files: 25 passed, 1 skipped; 337 tests passed, 11 skipped, 0 failed |

Without `CHROME_PATH` the browser suites **skip silently and exit 0** (no Chrome at the default paths). The first run in this change did exactly that (7 files, 95 tests "skipped"), which says nothing; the numbers above are with Chromium found. The 11 skips are the pre-existing font-mode cases in `label-alignment.browser.test.ts`.

Failures seen on the way, all fixed in this change: `label-alignment.browser` (6 cases: the test's hand-built editor style did not pass the region's new `align`), `core/text/compatibility.test.ts` (one test asserted a label region wider than a 30px node), and the console errors from the corrupt glyphs (below).

## What the new tests cover

Unit (`vitest`, Node):

| Area | File | Covers |
|---|---|---|
| Model | `core/shapes/semantic-node/style.test.ts` | validation of every field, clamping, junk input, merge/reset (an untouched node stores no `nodeStyle`) |
| Layout | `core/shapes/semantic-node/layout.test.ts` | default 168x78 geometry, label region = text box + label padding, AI sizing still the exact inverse (7 labels incl. multi-line), stack/side/hidden/right placements, icon clamp and drop, minimum sizes, radius, zone for double-click, invariants over 10 styles x 11 widths x 9 heights (no NaN, nothing outside the node, icon and text never overlap), non-finite boxes |
| Rendering | `core/shapes/semantic-node/renderer.test.ts` | through the export recorder (the editor's renderer): icon where the layout says, left-aligned label, zoom and pan, kind fallback for old boards, `nodeStyle: {}` byte-identical to none, hidden icon, icon colour (brand marks keep theirs), corrupt style, degenerate box, clipping, dark/light tint, no-fill node on the dark canvas, contrast |
| Interaction | `core/shapes/semantic-node/interaction.test.ts`, `core/shapes/resize-handle-hit.test.ts` | handle list (4 visible corners + 4 edge zones, rotated), resizing, style-dependent minimum, an older node below the minimum is not pushed up, edge zones and rotated edge zones |
| Selection chrome | `core/shapes/semantic-node/selection.test.ts` | solid (never dashed) accent outline off the border, draws exactly the visible handles at 4 zooms, rotates, balanced `save`/`restore`, other shapes keep the generic chrome |
| Definition | `core/shapes/semantic-node/definition.test.ts` | creation stores no `nodeStyle`, capabilities, bounds/hit/anchors |
| Editing plans | `features/whiteboard/utils/semantic-node-edit.test.ts` | replace (metadata kept, first icon remembered, custom icon, hidden shown again), remove, restore (never loses an explicit icon, kind fallback, custom dropped), explicit-`undefined` removal, style, typography, label, the panel model (mixed values, locked, corrupt) |
| Icons | `features/whiteboard/utils/icon-picker.test.ts`, `core/icons/path-data.test.ts`, `core/icons/icons.test.ts` | recents (order, cap, stale ids, custom), custom icon storage form, **every vendored glyph is valid path data** |
| Copy | `features/whiteboard/utils/arrange.test.ts` | a copy deep-clones `nodeStyle` and custom icons, drops generation identity |
| Theme | `core/color/adaptive-color.test.ts` | `isDarkSurface` |

Browser (real Chrome): `tests/browser/semantic-node.browser.test.ts` renders the node through the real canvas renderer and measures pixels: for 9 cases (short, long wrapping, multi-line, narrow/tall stacked, minimum, wide, large icon, icon right, unfittable label) x 3 zooms, the icon and the label ink stay in their layout boxes, nothing is drawn outside the node, and icon and label never overlap; left alignment, icon size and vertical centring; dark theme (icon lightened with no fill and on a dark fill). `tests/browser/editor/semantic-node.browser.test.ts` drives the real editor with pointer and keyboard: panel controls, picker (search, categories, Escape, recents, Remove/Restore), change icon then undo/redo and save, double-click icon vs label, remove/show/restore as undo steps and restore to the byte-identical board, size/position/colour/radius and reset, multi-selection with a locked node, locked controls disabled, label (multi-line) and typography, Escape reverts, a legacy node with no `ai`, duplicate keeps icon and style and stays independent, reload round trip, Delete/undo and drag untouched, corner and edge resize, minimum size, the connector dot still starts a connector, stacked layout after resizing, solid outline, dark theme. `tests/browser/export.browser.test.ts` adds an edited-node export (replaced icon, colour, hidden icon, always light, vector glyphs).

## Found and fixed on the way

- Seven vendored glyphs (`package`, `navigation`, `inbox`, `package-*`) were malformed (`M3.29L7L12L12L20.71L7`); `generate-icon-glyphs.mjs` joined a flat `points` list with `L`. Regenerating with the fixed script reproduces the repaired files exactly.
- The inline label editor used a different colour rule from the canvas, so a label on a dark fill changed colour on entering edit mode.
- A removed field must be written as an explicit `undefined`; a merely absent key leaves the old value in the room (caught by the restore test).

## Not covered (be aware)

- No test against real Liveblocks (two clients, conflicts), real Convex or Clerk; the editor harness uses real `LiveObject`/`LiveList` in memory.
- The harness cannot open a read-only board (React error #185 in its fake room, pre-existing), so "viewers cannot edit nodes" rests on the `hasEditAccess` guard in `useSemanticNodeCommands` and the disabled panel, not on a browser test.
- Touch input and the picker's recents in a private window (localStorage unavailable) were not exercised; recents fail silently by design.
- Re-applying diagram code recompiles nodes, so `nodeStyle` does not survive it (positions do).
- Visual quality was reviewed from screenshots of the light and dark editor, the stacked layout and the selection chrome, not by an automated visual comparison.
