# Project: Draw-Anything Refactor & Stabilization

## Architecture
- **Routing Engine**: Located in `core/routing/`. Needs fail-safes, performance upgrades (Spatial Hash Grid, adjacency map, path caching), and strict separation from interaction.
- **Canvas System**: Needs virtualization, event batching, state machine for edge creation, and perfect overlay text editing with rich text parsing.
- **Testing Track**: Will design Opaque-box E2E tests focusing on functionality (rich text, routing stability).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Routing Crash Fix & Stability | Fix `routeArrowBatch`, `computeParallelOffsets`, `getDirectionBucket`. Add invariant checks, runtime guards, and fail-safe fallback routing. | none | PLANNED |
| 2 | M2: Data Structure & Optimization | Implement Spatial Hash Grid, directed adjacency map, edge dirty tracking, path cache. Remove O(n^2) loops in lane grouping, crossing detection. | M1 | PLANNED |
| 3 | M3: Canvas System Improvements | Viewport virtualization, incremental layout, interaction layer separation, event batching, deterministic state machine for edge creation. | M1 | PLANNED |
| 4 | M4: Text Overlay & Rich Text | Seamless canvas integration (no jumping/layout shifts), transparent backgrounds, matching font sizes. Rich text formatting (Markdown serialization `Hello **World**`, parsed in `renderTextToCanvas` etc). Avoid heavy libraries. | none | PLANNED |
| 5 | M5: E2E Test Pass (Tiers 1-4) | Pass 100% E2E test suite (designed by E2E track). | M1, M2, M3, M4 | PLANNED |
| 6 | M6: Adversarial Hardening (Tier 5) | Adversarial test coverage and hardening. | M5 | PLANNED |

## Interface Contracts
### `core/routing` ↔ `core/shapes` / `core/interaction`
- Routing pipeline assumes valid points. All invalid inputs are rejected or fall back to simple straight lines.
- `markEdgeDirty(edgeId)` triggers localized routing, not full graph re-route.

## Code Layout
- Existing codebase in `core/`, `components/`, `app/`, etc. 
- M1 & M2 primarily in `core/routing/`.
- M3 primarily in canvas rendering/interaction logic (`core/interaction/` or canvas hooks).
- M4 primarily in canvas rendering (`renderTextToCanvas`, `renderShapeLabel`) and text editing component overlays.
