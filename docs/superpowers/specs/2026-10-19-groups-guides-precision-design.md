# Groups, smart guides and precision editing — design

Date: 2026-10-19. Status: implemented in this change; this file records what the existing code
offered, what was risky, and the decisions taken.

## 1. What the codebase already had (inspected, not assumed)

| Area | Where | Facts that shaped the design |
| --- | --- | --- |
| Document | `liveblocks.config.ts` | `elements: LiveList<LiveObject<DrawingElementJson>>`. Array order **is** z-order. No groups, no lock, no rotation. Every element stores absolute world `points`. |
| Persistence | `use-whiteboard-auto-save.ts`, `saved-content.ts`, `convex/whiteboard.ts` | `whiteboards.content` is a JSON string `{ elements, canvasSettings, metadata }`; `parseSavedContent` returns `elements` untyped and the controller seeds an empty room from it. Convex does not validate element shapes. Old clients ignore unknown fields/types. |
| Bounds / hit-test / handles | `core/shapes/shape-runtime.ts` | Single choke point over the registry (`getShapeBounds`, `shapeContainsPoint`, `getShapeResizeHandles`, `resizeShape`, `moveShape`, `renderShapeToCanvas`). Renderers read `shape.points` directly (never `getElementBounds`). Boxes are two points; `circle` is centre + radius point; `text` is one point + `fontSize`. |
| Spatial index | `useWhiteboardUtils` + `core/routing/spatial-hash-grid.ts` | Hash grid over element bounds for hit-testing and marquee. |
| Selection | `selectedElements: string[]` in the controller; `interaction/selection.ts` (`resolveClickSelection`, pure) | Leaf element ids. Multi-selection shows a handle set per element but only a single selected element can be resized. |
| Dragging / snapping | `interaction/drag-session.ts` (`computeDrag`, pure), `utils/draw-guides.ts` | Position = origin snapshot + total pointer travel; edges/centres snap within `6px / zoom`; Alt disables; guides drawn in screen space. Arrow-end snapping is a separate system: `core/snap/use-magnetic-snap.ts`. |
| Arrange | `utils/arrange.ts`, `use-element-commands.ts` | `alignOffsets`, `distributeOffsets` (equal edge gaps, 3+), `reorder`, `collectCopySet`, `cloneElements`; each command is one batched Liveblocks mutation = one undo step. Only reachable from the right-click menu. |
| History | `interaction/gesture-history.ts` | Liveblocks `history.pause/resume` bracket per gesture. |
| Routing | `core/arrow/use-arrow-connections.ts`, `core/routing/*` | `rerouteConnectedArrowsForChanges(changedElements)` reroutes only arrows attached (via the adjacency map) to the changed elements; dirty tracking and path caches already exist. Arrows reference shapes by `startConnection/endConnection.elementId`. |
| Browser tests | `tests/browser/editor/*` | Real editor bundled with in-memory Liveblocks (real `LiveObject/LiveList`, undo/redo), Convex and Next fakes, driven by real pointer/keyboard input in Chrome. |

## 2. Risks identified before editing

1. **`elements` has ~150 consumers.** Introducing a new element kind into the shape list would touch
   renderers, export, minimap, AI, diagram-code and the router. → Group records never reach them:
   the controller splits the stored list into `elements` (shapes, unchanged type) and group records.
2. **Autosave serialises `elements`.** If it kept doing so, groups would be lost on reload. →
   autosave serialises the full stored list (`documentElements`).
3. **`reorderElements` refuses a list whose length differs from storage** (`orderedIds.length !==
   current.length`). → z-order commands pass the full stored order.
4. **Deletion paths are scattered** (eraser, AI `element.remove`, delete key, clear). → empty-group
   pruning lives in the storage mutation `deleteElementsLive`, so no path can leave a dead group,
   and the group index also tolerates dead groups for data written by older/other clients.
5. **Rotation does not exist anywhere** (no field, no renderer, no hit-test). → see §5.
6. **Two snapping systems** (shape-edge guides vs connector-anchor magnet). → they stay separate;
   alignment guides are extended inside `computeDrag`/a new pure `core/snap/alignment.ts`, and
   `useMagneticSnap` is untouched.
7. **Corrupt input from older/other clients** (cycles, dangling `groupId`, empty groups). → the
   group index repairs these virtually, never throws, and never writes during load.

## 3. Group model

* A **group** is a stored record `{ id, type: "group", name?, locked?, groupId?, points: [], color, strokeWidth }`
  in the same `LiveList`. Children carry `groupId` (their parent); groups carry `groupId` too, which
  gives arbitrarily deep nesting. `points: []`, `color`, `strokeWidth` only satisfy the storage type.
* Children keep **absolute coordinates and their own ids**. A group's bounds/selection frame are
  *derived* (union of leaf bounds) so they can never go stale, and every existing consumer
  (renderers, hit-testing, connector routing, export, AI) keeps working untouched.
* **Z-order is never rewritten by grouping or ungrouping.** Members keep their array positions;
  group-level z-order commands move all descendants as a block (existing `reorder`).
* **Selection stays a list of leaf ids** (what presence, export, style, delete already consume).
  A *selection unit* is a maximal fully-selected subtree, so "group selected" ⇔ all its leaves
  selected. Clicking resolves the hit leaf to the unit that is a direct child of the *entered*
  group (or the top-level ancestor when nothing is entered); double-click / Enter enters a group.
* **Locking.** `locked` can sit on any element or group; a leaf is effectively locked when it or any
  ancestor is. Locked things can be selected (so they can be unlocked) but are skipped by move,
  resize, delete, style, align/distribute (as movers) and paste-into.
* **Copy/duplicate/paste** clones group records with fresh ids and remaps `groupId`s; leaves whose
  group was only partly copied stay in their original group when it still exists and is unlocked,
  otherwise become top-level.
* **Backward compatibility**: documents without groups are byte-identical; `groupId`, `locked`,
  `rotation` are optional; unknown record types are ignored by older clients.

## 4. Transforms

* `core/groups/transform.ts` (pure): `scaleElements(elements, fromBox, toBox)` maps every point
  affinely (`circle` scales its radius by the smaller axis factor, `text` scales `fontSize` only for
  uniform scale), so child-relative positions are preserved exactly. A minimum size keeps every
  child above a floor. The frame resize reuses `resizeBox`, the repo's one resize implementation.
* After any transform, `rerouteConnectedArrowsForChanges(movedShapes)` reroutes connectors that
  touch the moved shapes, through the same router as dragging. Arrows that are members of the group
  are scaled with it; their connection ids never change, so relationships survive.
* Everything one command writes is a single `updateElements` mutation → one undo step.

## 5. Rotation

Rotation is stored as `rotation` (degrees, clockwise) on box-like shapes and applied at the same
choke points as every other geometric rule: `drawElement` (canvas **and** export share it),
`shapeContainsPoint`, `getShapeBounds` (axis-aligned box of the rotated shape, so snapping, routing
obstacles, minimap and fit keep working), anchors and resize handles (rotated about the centre).
Lines, arrows and freehand have no meaningful `rotation`; rotating a selection that contains them
rotates their points about the selection centre.

## 6. Smart guides

`core/snap/alignment.ts` (pure, no React): lines (edges, centres, text baselines), nearest-neighbour
distance measurements, equal-spacing (gap) snaps, all in world units with a screen-pixel tolerance
divided by zoom. `computeDrag` keeps its signature and result and gains `measures`/`gaps`.
Candidate targets are narrowed with the existing `SpatialHashGrid`. Settings (`enabled`,
`tolerancePx`, `showDistances`) live in UI state and are persisted per viewer; **Alt** (Option)
suppresses snapping for the gesture.

## 7. Precision editing

A selection inspector shows X/Y/W/H (of the selection frame), rotation, and style for one or many
elements, with mixed-value display. Edits go through the same transform functions as dragging
(one mutation, one undo step, connectors rerouted). Locked elements are never edited.

## 8. Test plan

* Unit (vitest, node): group tree/index/repair, select units, group/ungroup/nesting, delete/prune,
  clone/paste, scale/rotate/move transforms, alignment engine (edges, centres, baselines, equal
  gaps, measures, zoom independence), align/distribute with groups & locks, inspector maths,
  serialisation round trip, backward compatibility fixtures.
* Browser integration (real editor in Chrome with Liveblocks fakes): group via shortcut, drag a
  group, connector integrity, resize group, enter group, ungroup, undo/redo, save → reload round
  trip, locked behaviour, guides while dragging at several zooms, panel edits.
