# Scope: M1: Routing Crash Fix & Stability

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1.1 | Fix `routeArrowBatch`, `computeParallelOffsets`, `getDirectionBucket` by adding strict guards (sourceId, targetId, startPoint, endPoint). | none | IN_PROGRESS |
| 2 | M1.2 | Add Global invariant check before routing and runtime type guards (`isValidPoint`). | M1.1 | PLANNED |
| 3 | M1.3 | Add fail-safe routing: fallback to simple straight line on failure. Compute straight preview during drag state. | M1.2 | PLANNED |
