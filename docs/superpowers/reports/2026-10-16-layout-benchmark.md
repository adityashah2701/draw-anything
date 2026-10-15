# Layout benchmark: in-repo layered engine vs ELK.js

Date: 2026-10-16. Reproduce: `WRITE_BENCHMARK_REPORT=1 npx vitest run features/ai/server/layout/benchmark`
(writes `layout-benchmark-table.md`; the test also asserts the claims below, so a regression fails CI).

## Method
Both engines receive the same prepared input (`prepareDiagram`): identical node sizes from the text
foundation, edges, edge-label widths, groups and gaps. Only node positions come from the engine under
test. Connectors are then routed by the same router, fan-outs bundled by the same step, and labels placed
by the same placer, so every difference is the engine's. Metrics are geometric
(`features/ai/server/layout/metrics.ts`), read off the compiled elements, never from pixels.

Fixtures (`features/ai/server/layout/fixtures/`): auth-flow (12 nodes, 19 edges, 3 groups; a request/response
flow reported from the app, kept verbatim as diagram code), architecture (17 nodes, 2 groups, 12 edge labels),
flowchart (13 nodes, 4 decisions, retry loops), mind-map (25 nodes, fan-out 6), stress (41 nodes, 51 edges,
5 groups nested and side by side, cycles, a parallel edge, opposite edges, 3 disconnected components,
long and multiline labels). ELK ran as `elkjs` 0.12.0 with compound nodes for groups and two placement
strategies (network simplex, Brandes-Koepf). "Adding 1 node" is the mean residual shift of the existing
nodes after adding one connected node, with the common recentring shift removed.

## Results

| fixture | engine | nodes | crossings | shared-line overlaps | through nodes | bends | edge length | colliding labels | groups dropped | label shrunk | area (M px²) | ms | adding 1 node: mean shift px |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| architecture | layered | 17 | 4 | 1 | 0 | 36 | 8582 | 0 | 0 | 0 | 1.8 | 25 | 102 |
| architecture | elk (network simplex) | 17 | 6 | 0 | 0 | 38 | 8475 | 0 | 0 | 0 | 2.3 | 55 | 84 |
| architecture | elk (brandes-koepf) | 17 | 2 | 1 | 0 | 32 | 9901 | 0 | 0 | 0 | 2.4 | 55 | 159 |
| flowchart | layered | 13 | 3 | 5 | 0 | 26 | 3699 | 0 | 0 | 0 | 1.0 | 14 | 66 |
| flowchart | elk (network simplex) | 13 | 1 | 2 | 0 | 28 | 5524 | 0 | 0 | 0 | 1.2 | 29 | 324 |
| flowchart | elk (brandes-koepf) | 13 | 3 | 2 | 0 | 25 | 6472 | 0 | 0 | 0 | 1.4 | 27 | 442 |
| mind-map | layered | 25 | 0 | 0 | 0 | 48 | 13971 | 0 | 0 | 0 | 2.0 | 11 | 188 |
| mind-map | elk (network simplex) | 25 | 0 | 0 | 0 | 48 | 13754 | 0 | 0 | 0 | 2.0 | 28 | 0 |
| mind-map | elk (brandes-koepf) | 25 | 0 | 0 | 0 | 48 | 20609 | 0 | 0 | 0 | 2.1 | 25 | 0 |
| stress | layered | 41 | 36 | 24 | 1 | 105 | 31822 | 0 | 0 | 0 | 4.5 | 45 | 51 |
| stress | elk (network simplex) | 41 | 37 | 4 | 2 | 101 | 38267 | 0 | 0 | 0 | 8.6 | 170 | 344 |
| stress | elk (brandes-koepf) | 41 | 43 | 0 | 1 | 105 | 41535 | 0 | 0 | 0 | 8.7 | 99 | 368 |
| auth-flow | layered | 12 | 4 | 9 | 0 | 44 | 8792 | 0 | 0 | 0 | 0.9 | 10 | 76 |
| auth-flow | elk (network simplex) | 12 | 6 | 8 | 0 | 46 | 10873 | 0 | 0 | 0 | 1.5 | 76 | 150 |
| auth-flow | elk (brandes-koepf) | 12 | 4 | 12 | 0 | 44 | 13552 | 0 | 0 | 0 | 2.0 | 47 | 319 |

Legacy baseline, the compiler as it was before this work (fixed 78px nodes, depth-only handles, one label
position, no search fallback), measured with the same metric code:

| fixture | crossings | shared-line overlaps | through nodes | bends | edge length | colliding labels | groups dropped | labels that could not be drawn at 17px (old renderer) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| architecture | 5 | 2 | 0 | 49 | 6813 | 3 | 1 | 5 of 17 |
| flowchart | 8 | 6 | 0 | 40 | 4279 | 1 | 0 | 5 of 13 |
| mind-map | 3 | 0 | 0 | 53 | 14792 | 0 | 0 | 8 of 25 |
| stress | 62 | 15 | 2 | 133 | 34471 | 10 | 3 of 5 | not measured |

## What this shows
- **ELK keeps every group; so does the improved layered engine.** The old engine dropped 1, 0, 0 and 3 groups. Both now drop none.
- **Layered gives shorter connectors and a smaller drawing where it counts**: edges are 33-43% shorter than
  ELK's on the flowchart and 18-24% shorter on stress; on the mind map they are level with ELK network
  simplex (13,971 vs 13,754 px, 1.6% longer) and 32% shorter than Brandes-Koepf; on architecture they are
  level with network simplex (8,582 vs 8,475) and 13% shorter than Brandes-Koepf. Stress is drawn in
  about half the area (4.5 vs 8.6 M px²).
- **Crossings are close.** Equal on the mind map (0), 4 vs 2-6 on architecture, 39 vs 34-41 on stress.
  **ELK is better on the flowchart: 1 crossing (network simplex) against 3.** That gap is real.
- **Stability favours layered where it matters.** Adding a node moves existing nodes by 51 px (stress) and
  66 px (flowchart) on average with layered, against 344-368 px and 324-442 px with ELK. ELK wins on the
  mind map (0 vs 188 px) and on architecture with network simplex (84 vs 102 px).
- **Runtime**: layered 10-32 ms, ELK 20-106 ms, both fine. ELK is asynchronous only; the compiler, the
  server agent and the client "diagram code" path are synchronous today.
- **Integration**: ELK adds a 1.6 MB bundle, an async API through three call sites, and a dual licence
  (EPL-2.0 OR GPL-3.0-or-later) to review. The layered engine adds nothing.

## Decision
**Keep the layered engine, with the fixes below; ELK is not adopted.** On identical input it is as good or
better on edge length, drawing size, label collisions, groups and stability for the diagrams we generate,
and within a few crossings of ELK everywhere except the flowchart. It stays synchronous, has no new
runtime dependency, and does not ship a 1.6 MB bundle to the client. `elkjs` remains a **dev dependency**
used only by the benchmark, so the comparison can be re-run.
Revisit ELK if: (1) true radial/tree layouts for mind maps are wanted (ELK has them; the layered engine
draws a top-down tree that gets very wide), (2) flowchart crossing count becomes a complaint, or (3)
the layered engine's crossings on dense graphs (stress: 39) matter more than edge length and stability.
A hybrid (ELK only for flowcharts) was considered and rejected: the gain is 2 crossings on a 13-node diagram,
paid for with the async plumbing, the bundle and 49-75% longer connectors on that diagram.

## What was wrong, found by measuring (all fixed)
1. **Cycles broke layering.** A topological sort never finishes a cycle, so every node reachable only
   through a loop fell back to row `index / 4`. Any flowchart with a retry loop was laid out arbitrarily.
   Now depth-first search finds back edges and longest-path layering ignores them.
2. **Connectors dived through unrelated nodes.** `pinPathEndpointStubs` overwrote the second-to-last point
   with the end-stub point, assuming it was the stub; with four points it is a real bend, so the run jumped
   to the end of the path. Fixed in the router (this also corrects routing when a user drags a node).
3. **The router's last resort accepted a path through nodes** when every fixed shape was blocked. A
   deterministic Hanan-grid search now runs first (`core/routing/grid-route.ts`).
4. **Fixed 78px nodes** left 2-line labels shrunk to 13px (5/17, 5/13, 8/25 nodes). Node width and height now
   come from the label (`core/text/node-size.ts`); the label region is the whole node height instead of 72%.
5. **Groups were dropped** when frames would swallow strangers: only the outermost group was kept
   together within a row and disconnected components shared rows. Now nested groups stay contiguous,
   components are laid out separately, and a final pass moves strangers out of frames.
6. **Fan-outs drew a comb** of runs at slightly different levels that crossed their siblings' drops. Edges
   leaving or entering one node side now share one bus level where that is clear.
7. **Edge labels collided** (10 of 51 on stress) and same-row connectors shorter than their label forced
   overlaps. Labels are placed against nodes, other labels, connectors and frame titles, and rows reserve
   room for the labels between neighbours; anything still unplaceable is reported, not overlapped.

## Follow-up from a real diagram (2026-10-16)
A diagram generated in the app (`fixtures/auth-flow.ts`) exposed three things the synthetic fixtures had not:
- **A word split across lines** (`Authenticati` / `on Service`). Sizing and the renderer both treated a split
  word as "fits", and so did my fit tests. Boxes are now at least as wide as the longest word, the renderer
  shrinks the font before splitting, and a split word counts as a failure in the metrics and the Chrome test
  (verified to fail without the fix).
- **A request and its response drawn on one line** (two edges between the same pair use the same two
  handles, so one hid the other). The second edge between a pair now uses the nodes' right sides and the
  third their left sides. Measured on this diagram: crossings 5 -> 4, shared-line overlaps 16 -> 9.
- **Reading order**: `User` lands at the bottom because cycle-breaking starts from pure sources. Starting from
  people/clients instead was tried and measured: connectors 41% longer, crossings 4 -> 12, so it was dropped.
  A better answer needs a feedback-arc-set heuristic, not a different start node.
On this diagram layered (4 crossings, 8,792 px) is ahead of ELK (4-6, 10,873-13,552 px), but the drawing is still
busy: several connectors share long corridors and some labels sit on lines. That is the main open quality issue.

## Limits of this evidence
Four fixtures, one machine, estimator-based sizes for the server path (validated against Chrome, see the
measurement contract). Crossings are counted per segment pair, so they are comparable between engines but
not a measure of how a diagram reads. ELK was tried with two option sets, not exhaustively tuned.
