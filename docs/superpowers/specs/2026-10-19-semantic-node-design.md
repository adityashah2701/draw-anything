# Semantic node redesign — design

Date: 2026-10-19. Status: implemented. Test results and known gaps: `docs/testing/semantic-node-tests.md`.

## 1. Diagnosis (traced, not assumed)

| Complaint | Where it came from |
| --- | --- |
| Whitespace, label "floating" | `getShapeLabelRegion` gave the label what was left of the node after the icon (`W - 66`), then `layoutShapeLabel` subtracted its own 12 px padding again from both sides: text wrapped in 78 px of a 168 px node, and was centred in that leftover box, so the gap between icon and text and the gap on the right were both arbitrary. |
| Tiny icon | `semanticIconSize = min(28, 0.42 * height)`: a 28 px tile, whose glyph is 62% of it, about 17 px. Pinned 14 px from the left edge whatever the node's size. |
| "Stretched rectangle" | No layout logic: one fixed row for every size, no adaptation when resized (narrow or tall nodes kept the same row), minimum 96 x 56 whatever the content. |
| Cannot change the icon | The model had no way to edit an icon on a node: `ai.icon` could only be set by the AI; the picker only inserted new standalone `icon` elements (`onInsert`); no remove, no restore, no size, colour or placement. |
| Selection dominates | The generic chrome in `drawElement`: a dashed box 5 px outside the border plus eight 10.7 px white dots centred on the border, so on a 168 x 78 node the dots cover the rounded corners and the edge midpoints, and the dashed line shimmers against the node's own border. |
| Dark theme | Label colour was contrast-resolved against the fill, but a node with no fill kept `#1f2937` text and border on the dark canvas (unreadable); the icon tint was never lightened. The inline editor used a different colour rule from the canvas (`getAdaptiveColor` vs `resolveTextColor`), so the text could change colour on entering edit mode. |
| Edge resizing never worked | The edge-midpoint handle sits exactly on the connector dot, and a hovered shape's connector dot wins the pointer-down (`use-whiteboard-drawing.ts`). Checked with a plain rectangle: dragging its east handle starts a connector. Pre-existing for every shape. |
| Corrupt glyphs | Found while opening the picker in the real editor (console errors): seven vendored glyphs (`package`, `navigation`, `inbox`, ...) had path data like `M3.29L7L12L12L20.71L7`. `scripts/generate-icon-glyphs.mjs` joined a flat `points="x y x y"` list with `L`. |

Reusable as they were: the label pipeline (`layoutShapeLabel` / `renderShapeLabel`), the icon registry and custom icons, `drawIconTile`, the history (`updateElements` = one undo step), `cloneElements` (a `structuredClone`), `useSelectionStyle`, `NumberField`, `isEffectivelyLocked`, the shape-definition registry.

## 2. Model

Icon identity stays where every consumer already reads it: `ai.icon` / `ai.customIcon` (resolved by `iconForNode`, so diagram code, the AI and older boards keep working). Everything else is one optional object on the element:

```ts
nodeStyle?: { iconHidden?, iconSize?, iconPlacement?: "left"|"right"|"top", iconColor?, cornerRadius?, originalIcon?: string|null }
```

* Every field optional; absent = the design default, so a board saved before this existed draws the default look and a node the user resets is stored with no `nodeStyle` at all (`mergeNodeStyle` returns `undefined`).
* Every read goes through `normalizeNodeStyle` (types, NaN, ranges, hex colour); a corrupt value is ignored, never trusted.
* `originalIcon` makes "restore default" exact: the first icon the node had, or `null` for "its kind's icon". Restoring a node that was only hidden never changes which icon it is.
* A removed field is written as an explicit `undefined`: the storage write is `LiveObject.update`, a merge, and only the page controller's `writeElement` turns an explicit `undefined` into a delete (found by the browser test: a plain absent key left the stale `nodeStyle` in the room).

## 3. Layout

`core/shapes/semantic-node/layout.ts` is the single source. Padding 12, icon-to-text 10 (6 stacked), icon tile up to 40 (glyph about 25), minimum text box 48, icon dropped below 16.

* Side by side (default): icon vertically centred, text left-aligned beside it, so a column of nodes lines icons and labels up.
* Stacked: icon centred over centred text, chosen automatically when the node is narrower than 120 and at least 72 tall (or explicitly with `iconPlacement`).
* The icon yields before the text box does: a requested size is clamped to the node, then the icon is dropped and the label takes the node (centred).
* The label region is the text box grown by the label layout's own 12 px padding, so `layoutShapeLabel` lands exactly on the box and the old double padding is gone.
* `sizeSemanticNode` (AI) stays the exact inverse: `SEMANTIC_INSET_WIDTH` is the widest automatic icon plus its gap (50, was 66), so AI nodes with long labels are 16 px narrower for the same text.

Minimum sizes depend on what is shown (`semanticMinSize`): 112 x 56 with an icon, 88 x 80 stacked, 72 x 40 without. A node already smaller than its minimum (older boards) is not pushed up by merely grabbing a handle.

## 4. Editing

* Inspector "Node" section: label (multi-line, commits on Enter/blur, Escape reverts), current icon with Change / Remove (Show) / Restore default, icon size (Auto, S, M, L, XL), position (Auto, Left, Top, Right), colour (Auto + 8 swatches), corner radius, font weight and italic. Fill, outline, stroke width and font size stay in the existing floating bar and Style section, which already apply to any selection. All of it is multi-selection aware, lock aware and one undo step.
* Icon picker in "replace" mode: same search, categories, keyboard navigation and custom icons, plus a "Recent" row (localStorage, per browser) and Remove / Restore buttons.
* Double-click on the icon opens the picker for that node; anywhere else edits the label inline (`semanticZoneAt`). Enter on a selected node still edits it.
* Inline editor: aligned like the canvas (`LabelRegion.align`), same colour rule as the canvas (`resolveTextColor`).

## 5. Selection chrome

An optional `renderSelection` on a shape definition replaces the generic box and dots; only semantic nodes use it. A thin solid outline sits just outside the border (the node's own border stays visible), and four small corner squares sit on the border. The four edges are grab zones along their whole length (`ShapeResizeHandle.span`, `visible: false`, hit-tested by `resizeHandleAt`, turned with a rotated node), so no handle competes with the connector dot at the edge midpoint.

## 6. Decisions that were not obvious

* **Icon stays in `ai`, presentation in `nodeStyle`.** Putting the icon in `nodeStyle` would have hidden the user's choice from diagram code and the AI.
* **Left-aligned text beside the icon, not centred.** Centring made the group move while typing in the inline editor and left the icon at a different x in every node; left alignment keeps the caret and the icon column still.
* **Edges as zones, not handles.** Moving the connector or hiding it on selection changes behaviour for every shape; changing the node's own handle set does not.
* **Fills are not theme-adapted.** Every shape in the app uses its stored fill on both themes (labels adapt for contrast); a semantic node follows that. Only things with no surface behind them (a node without fill, an icon on a dark fill) are lightened.
* **`SEMANTIC_DEFAULT_RADIUS` is the existing token** (`CORNER_RADIUS.semanticNode`, 8 to 10).

## 7. Not done

* Re-applying diagram code recompiles the nodes, so `nodeStyle` (like any other per-node presentation edit not in the DSL) does not survive it; node positions do (pins).
* Fill, outline and stroke stay in the floating bar rather than the inspector.
* Edge resize handles on the generic shapes are still shadowed by the connector dots (pre-existing, unchanged).
