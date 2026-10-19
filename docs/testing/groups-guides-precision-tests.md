# Groups, smart guides and precision editing: what was run, and what is not covered

Date: 2026-10-19. Design and decisions: `docs/superpowers/specs/2026-10-19-groups-guides-precision-design.md`.

## Results (run in this change, on a clean `npm ci`)

| Command | Before (commit `ab9000e`) | After |
|---|---|---|
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` | clean | clean |
| `npx vitest run` | 98 files, 1322 tests passed | 115 files, 1598 tests passed |
| `CHROME_PATH=<chromium> npx vitest run --config vitest.browser.config.ts` | 20 files: 201 passed, **1 failed**, 11 skipped (`export.browser`: "a large board exports without freezing the page", a wall-clock budget) | 24 files: 278 passed, 0 failed, 11 skipped |

The one pre-existing browser failure is a timing assertion; it passed on the later full run, so it depends on machine load rather than on code. The 11 skips are pre-existing (font-mode cases).

## What the new tests cover

Unit (`vitest`, Node, no DOM):

| Area | File | Covers |
|---|---|---|
| Group tree | `core/groups/group-index.test.ts` | nesting, ordering, units, ancestry, locks; dangling `groupId`, self-reference, cycles, duplicate ids, empty groups, 3000-deep chain, 5000 shapes |
| Commands | `core/groups/group-commands.test.ts` | group/ungroup (z-order untouched, nesting, extraction, locked units), lock/unlock, rename, delete with connector cascade and empty-group pruning |
| Copy | `core/groups/clone.test.ts` | whole vs half-copied groups, fresh ids, connector re-pointing, no dangling references |
| Transforms | `core/groups/transform.test.ts`, `features/whiteboard/utils/move-plan.test.ts` | scale (relative positions preserved, circle, text, turned shapes), minimum size, rotation, which connectors travel and which are re-routed |
| Persistence | `core/groups/serialization.test.ts` | save/load round trips, boards without groups load byte-identically, damaged data |
| Rotation | `core/shapes/rotation.test.ts` | bounds, hit-test, anchors, handles, resize (opposite handle fixed at 0/30/90/135/200 degrees), drawing |
| Snapping | `core/snap/alignment.test.ts`, `features/whiteboard/hooks/interaction/drag-session.test.ts` | edges, centres, baselines, equal spacing (between, repeat left/right, vertical), distances, zoom, determinism, 2000 targets in budget; the pre-existing `computeDrag` tests pass unchanged |
| Settings and text | `utils/snap-settings.test.ts`, `utils/text-baseline.test.ts` | normalisation, tolerance clamp, storage failures, baseline offsets |
| Selection and keys | `hooks/interaction/group-selection.test.ts`, `keyboard-policy.test.ts` | click/marquee/double-click/Enter/Escape rules, shortcuts |
| Inspector | `utils/inspector-model.test.ts`, `inspector-edit.test.ts`, `frame-resize.test.ts`, `selection-overlay.test.ts` | what is shown, mixed values, edits, ratio lock, frame handles at any zoom |

Browser (real Chrome, real editor bundle with in-memory Liveblocks/Convex fakes, real pointer and keyboard input): `tests/browser/editor/groups`, `inspector`, `guides` and `tests/browser/rotation-export`:
group/ungroup/duplicate/paste/delete/lock, move, frame resize (Shift ratio, minimum size, locked, zoomed), enter/leave nested groups, connector integrity (a connector from a moved group to an outside shape stays attached at both ends), undo/redo exactness, save and reload, damaged group data, overlapping groups, eraser and controller deletion pruning, mixed selections with locked shapes, X/Y/W/H/rotation/stroke fields, mixed values, rotated label editor, guides while dragging at 0.5x/1x/2x, Alt, tolerance menu and its persistence, equal spacing, distances, baselines, align and distribute shortcuts, rotated export.

## Not covered (be aware)

- No test runs against real Liveblocks (two clients, offline, conflicts), real Convex or Clerk; the editor harness uses real `LiveObject`/`LiveList` in memory. Concurrent group edits by two people are not exercised.
- The editor harness cannot open a read-only board (React error #185 in its fake room; the same on the commit before this change), so "viewers cannot edit" for the new commands is guaranteed by the `hasEditAccess` guard in each command and not by a browser test.
- Touch input on frame handles uses the same code path as mouse and the existing 8px handle reach; it was not exercised.
- Baseline guides cover standalone text only. A label inside a shape is not offered as a baseline.
- Frame resize and single-shape resize do not snap to other shapes (only moves do).
- Rotation is numeric (inspector, quarter-turn buttons, or the rotate-selection field); there is no rotate-by-dragging handle.
- A turned shape inside a group that is resized non-uniformly keeps its orientation and its centre is mapped exactly, but its own width/height follow the axis scales approximately (no shear).
