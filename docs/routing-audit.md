# Routing engine audit — second pass

Scope: `core/routing`, `core/arrow/use-arrow-connections.ts`, and the call path from the whiteboard
controller (`features/whiteboard/hooks/controller/use-whiteboard-page-controller.ts`).

## Provenance and method

- There was **no earlier audit document and no earlier review by this session**. The code under review
  was already committed (`8f57046` and earlier, authored by the repo owner). This is therefore a first
  adversarial pass over existing code, not a re-check of a previous conclusion.
- "Compound Engineering" and "Ponytail" were not found in the repo, the installed skills, or the
  user's skill catalogue, so no method named that was applied.
- Method: read the actual call paths, write a failing test for each suspicion, fix only what the test
  confirmed, and compare behaviour against a pristine `HEAD` checkout (git worktree) wherever a change
  could alter output.
- Not run: the real app / browser. The React hook is covered by reading and by an engine-level replay of
  its calling pattern, not by an automated hook test (no React test library is installed).

## Verified defects — fixed

Each row was reproduced (test red or measured on unmodified code) before the fix.

| # | Defect | Evidence before | Fix | Regression test |
|---|---|---|---|---|
| 1 | **Stale routes.** With engine state, moving an endpoint or changing `routingMode` did not re-route unless the caller also called `markEdgeDirty`. The "path memoization" branch was unreachable (an edge only reaches it if it is dirty or uncached, and the branch required the opposite), and `pathHashCache` was write-only. | `routedArrowIds` was `[]` after the change. | Staleness is now decided by a hash of endpoints, handles, mode, preference, existing points **and the obstacle layout**; dead branch and `lastObstacleHash` removed. | `route-engine.test.ts` › *incremental state* |
| 2 | **Wrong state lifecycle.** The engine treated its input as the complete edge set and evicted every other cached arrow, but the canvas routes one arrow at a time, so the cache was wiped on every call. It never removed deleted arrows from the congestion map (ghost traffic, unbounded growth). `dirtyEdges.clear()` also dropped dirty flags of arrows outside the batch. | `routeCache.has("e2") === false` after a subset call; `congestionMap.arrowCells` kept a deleted arrow. | Implicit eviction removed; new `pruneRouteEngineState(state, liveIds)` (also clears congestion); the hook calls it when `elements` change; only processed edges are un-dirtied. The hook no longer overwrites the engine's hashes with a different format. | `route-engine.test.ts` › *pruneRouteEngineState* |
| 3 | **Crash on a null edge.** Stages 6–7 iterated the raw `edges`, bypassing sanitization. | `TypeError: Cannot read properties of null (reading 'sourceId')` | Iterate `safeEdges`. | *partial / corrupted input* + seeded fuzz |
| 4 | **Crash on malformed `existingRoutes`** (undefined or too-short `points`). | `TypeError: Cannot read properties of undefined (reading 'length')` | New `sanitizeRoutes` guard. | *ignores malformed existingRoutes* |
| 5 | **`routingMode: "straight"` was overwritten.** `routeArrowPoints` returns the straight line, then lane / crossing / normalization passes forced Manhattan geometry. | On pristine `HEAD`, both `routeWithEngine` and `routeArrowBatch` returned `[(100,30),(300,30),(300,130)]` for a `[(100,30),(300,130)]` arrow. | Straight arrows are set aside before the post-passes and re-attached. | *straight routing mode* (3 tests) |
| 6 | **Quadratic normalizer.** `isSafeTransform` cloned the whole route map twice and recounted all crossings, per arrow, twice. | 1000 synthetic routes: **16.5 s**. `routeArrowBatch`, 955 edges: **3.5 s**, of which `normalizeRoutes` 3.7 s (profiled stage by stage). | `createCrossingCounter` builds one grid; a single-arrow edit changes the global count by exactly the per-arrow delta. | `path-normalizer.test.ts` |
| 7 | **Test suite could not run.** No vitest config, so `@/` imports failed. | `6 failed (6)` test files, 0 tests executed. | Added `vitest.config.ts`. | — |

### After

| Measurement | Before | After |
|---|---|---|
| `normalizeRoutes`, 1000 synthetic routes | 16,496 ms | ~85–100 ms |
| `normalizeRoutes`, 955-edge graph | 3,703 ms | 36 ms |
| `routeArrowBatch`, 955 edges | 3,478 ms | 270 ms |
| `routeWithEngine` full batch, 955 edges | 3,421 ms | 358 ms |
| Hook pattern, one arrow per call (955 arrows) | 2.2 ms | 2.1 ms |
| Drag frame, 3 connected arrows (955 arrows) | 3.1 ms | 3.0 ms |

Behaviour preservation (these are the evidence that the speed-up and the lifecycle change did not
alter output for ordinary arrows):

- `normalizeRoutes` output hash is **identical** to the pre-change implementation on 4 seeded scenarios
  (40–150 arrows, deliberately clipping obstacles and crossing each other).
- Per-arrow crossing delta equals the global-total delta for every arrow in a 60-arrow scenario.
- A scripted replay of the hook's calling pattern (initial route + 60 node-drag steps with arrow
  deletions) produced **identical route hashes at all 61 steps** on pristine `HEAD` and on this tree.

## Checked, no defect found

- **Valid-input robustness.** 60 seeded random graphs of well-formed edges: 0 throws in any later stage
  (lanes, crossing minimization, normalization). A catch-all around those stages was therefore *not*
  added; there is no demonstrated trigger for one. The per-edge `try/catch` around `routeArrowPoints`
  remains the only fail-safe.
- **Congestion double counting.** `recordPath` removes the arrow's previous contribution first, so the
  hook recording the same path after the engine does is idempotent.
- **Original crash.** `getDirectionBucket` / `getGroupKey` / `computeParallelOffsets` /
  `routeArrowBatch` tolerate `undefined` points, null entries and partial arrows (tests added).
- **Data-structure goals that hold.** Lane assignment, spatial indexing, crossing counting and parallel
  offsets each take ≤ 4 ms at 955 edges, i.e. they are not the bottleneck.

## Remaining risks — not fixed

Evidence level in brackets: *measured*, *test*, *code reading*, *grep*.

1. **No drag throttling, batching or edge-creation state machine** (`AGENTS.md` Task 4). Each pointer move
   runs `rerouteConnectedArrowsForChanges` and one `updateElement` per affected arrow
   (`use-whiteboard-page-controller.ts:222-227`). Engine cost is ~3 ms/frame [*measured*]; the cost of the
   Liveblocks writes per frame is **unmeasured**. No viewport culling of routing was found [*grep*].
2. **Four private grid implementations** in `core/routing` (`congestion-map`, `crossing-minimizer`,
   `obstacle-detector`, `segment-conflict-resolver`), while the shared `SpatialHashGrid` is used only for
   hit-testing in `use-whiteboard-utils.ts` [*grep*]. No R-tree / interval tree exists (Task 2.2). Not
   needed at the measured scale (validating all 955 routes against 500 obstacles: 21 ms).
3. **Two definitions of "crossing".** `detectCrossing` counts endpoint touches; `countSegmentCrossing`
   does not. The normalizer and minimizer use the first; scoring and `crossingCount` use the second
   [*code reading*]. No wrong output observed; the two can disagree.
4. **O(A) work per routed arrow in the hook.** `getAllParallelCandidates`, `getExistingRoutes` and the
   engine's index build all scale with the arrow count, so sequentially routing every arrow is O(A²)
   [*code reading*]. Engine side measured at 2.1 ms/call for 955 arrows; hook-side descriptor building not measured.
5. **`globalPathCache`** is a module-level singleton shared by every board in the page; its keys embed the
   whole obstacle signature (~28 KB per key at 500 obstacles with 36-char ids — *estimate, not measured*),
   eviction sorts all entries per insert, and `invalidate()` / `clear()` have no callers, so deleted
   arrows' entries linger [*grep*]. The key also includes `existingPoints`, which the routed result
   overwrites, so the first lookup after a write misses [*code reading*].
6. **Any obstacle change changes every edge's hash**, so a full-batch call re-routes all edges; only
   the hook's choice of batch limits the blast radius (unchanged from before) [*test*].
7. **Dead exports:** `markShapeEdgesDirty`, `invalidateAllRoutes` have no callers [*grep*].
8. **Hook entry points dereference `arrow.points[0]` before the readiness guard** (`buildRouteDescriptor`).
   An arrow whose `points` is `undefined` would throw there. The type says it is required, and this was
   **not reproduced** (no React harness) [*code reading*].
9. **Repo health, pre-existing:** `features/ai/server/workflow.test.ts` › *applies a repair pass…* fails on
   a clean checkout; `package-lock.json` is out of sync with `package.json` (`npm ci` fails);
   `convex/_generated/api.d.ts` is stale, giving 4 `tsc` errors in `app/api/clerk-webhook/route.ts`.

## Reproduce

```bash
npm install --ignore-scripts      # npm ci fails: lockfile drift (risk 9)
npx vitest run core/routing       # 26 tests
npx vitest run                    # 39 pass, 1 pre-existing failure (workflow.test.ts)
npx tsc --noEmit | grep -E '^(core|features)/'   # no output
```
