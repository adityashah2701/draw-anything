# Sub-project D: canvas and UX polish (spec)

## State of A, B, C (verified in the tree)
A (text foundation) and B (layout/routing) are committed (`758c54a`, `5073981`). C (icon registry) is implemented but uncommitted. D must not touch their contracts: element `ai.*` fields, `core/text`, the compiler, `core/icons`.

## Audit: how the canvas works today
- Live document: Liveblocks `elements: LiveList<LiveObject>`; array order is z-order. Mutations in `use-whiteboard-page-controller.ts` (`addElement`, `updateElement` one element per call, `deleteElementsLive`). One undo step per gesture via `gesture-history.ts`.
- Input: pointer events in `whiteboard-canvas-stage.tsx`; move/resize/marquee logic in `use-whiteboard-drawing.ts`; shortcuts in `use-whiteboard-keyboard.ts`; viewport in `use-canvas-viewport.ts`.
- Not available in this environment: the whiteboard route needs a signed-in Clerk user and a Convex id, so **full-app interaction testing is not possible here**. Pure modules are tested in vitest and (where geometry/DOM matters) in real Chrome; wiring is verified by type check, lint and build only, and reported as such.

## Defects found by reading the code (reproduction = a failing test on the extracted logic)
1. Ctrl+A / Ctrl+Z / Ctrl+S are handled *before* the "typing in an input" guard, so they select-all / undo the canvas while editing a label or the Code tab text. `?` opens the command menu while typing a label.
2. Zoom buttons and Ctrl+/- zoom about the world origin, so content slides away; keyboard and buttons disagree with the wheel (cursor-anchored).
3. Fit-to-content zooms up to 5x on a small diagram.
4. Plain mouse-wheel always zooms, so two-finger trackpad panning is impossible.
5. Dragging has no alignment guides or snapping (only arrow anchors snap). Each move frame applies an incremental delta to whatever `elements` is at that render; nothing anchors a gesture to where it started.
6. Each moved element is a separate storage mutation (`updateElement` scans the list), so moving many elements on a large board is O(selected x total) writes.

## Missing features (priority order)
Copy/cut/paste/duplicate, arrow-key nudge, z-order, align/distribute, context menu, minimap, empty state. **Not doing:** true grouping (needs a new stored `groupId`; AI group frames already exist), rotation, multi-resize of mixed selections, responsive redesign of toolbars (cannot verify without the full app).

## Design
Pure modules (no React, no Liveblocks) with one job each, wired by thin hooks:
- `utils/viewport-math.ts`: `zoomAtPoint`, `fitView` (cap 1x), `wheelIntent` (ctrl/meta = zoom, else pan; deltaMode normalised). Viewport hook delegates.
- `interaction/keyboard-policy.ts`: `isTextEntryTarget`, `resolveShortcut(event, context)` -> command. The hook only dispatches. Text entry blocks every canvas shortcut (including Ctrl combos and `?`).
- `interaction/drag-session.ts`: snapshot of the dragged elements at pointer-down; every move computes position = origin + total delta (+ snap), so it cannot drift; alignment snapping of the selection's edges/centres to other nodes within 6 screen px, returning guide lines; Alt disables.
- `utils/arrange.ts`: align, distribute, z-order permutation, clone-for-paste (new ids, offset, connection remap, generation metadata dropped so a copy is a plain user node and never collides on `ai.semanticId`).
- `hooks/interaction/use-element-commands.ts`: copy/cut/paste/duplicate/nudge/z-order/align on top of three batched storage mutations (`addElements`, `updateElements`, `reorderElements`), each one undo step.
- `utils/minimap-math.ts` + `minimap.tsx`; `canvas-context-menu.tsx` (existing shadcn ContextMenu); `canvas-empty-state.tsx`.

Compatibility: no stored-format change. Z-order is the existing array order. Pasted elements are ordinary elements.

## Behaviour change to flag
Plain wheel now pans; Ctrl/Cmd+wheel (and trackpad pinch) zooms. Documented in the shortcuts dialog.

## Verification contract
vitest for every pure module (incl. a 2,000-element drag/snap timing check); Chrome tests for viewport math against real wheel/DOM geometry and rendering of guides/minimap; `tsc`, `lint`, `next build`. Not verified: any behaviour that needs the live board (pointer wiring, Liveblocks mutations, context menu, history grouping in practice).
