# CRITICAL FIX + ARCHITECTURE OPTIMIZATION UPGRADE

You are a senior frontend systems engineer building a production-grade diagramming engine.

We have a runtime crash:

TypeError: Cannot read properties of undefined (reading 'x')

Stack trace:
- getDirectionBucket
- getGroupKey
- computeParallelOffsets
- routeArrowBatch
- useArrowConnections

This occurs when:
- Using arrow tool
- Dragging and attempting to connect to shape
- Routing runs before connection is fully resolved

---

# 🔴 TASK 1 — FIX RUNTIME CRASH (DEFENSIVE ROUTING)

Problem:
Routing pipeline assumes all arrows have fully resolved:
- startPoint
- endPoint
- sourceId
- targetId

During drag state, these may be undefined.

Required Fix:

1. In routeArrowBatch:
   - Skip arrows where:
     - sourceId is undefined
     - targetId is undefined
     - startPoint or endPoint missing
     - points.length < 2

2. In computeParallelOffsets and getDirectionBucket:
   - Add strict guards:
     - If point undefined → return early
     - Never assume .x or .y exists

3. During drag:
   - Only compute simple straight preview path
   - Defer full routing until connection is finalized

Goal:
Routing must never crash even under partial edge state.

---

# 🔵 TASK 2 — DATA STRUCTURE UPGRADE

We want to improve time and space complexity for 1000+ arrows.

Propose and implement:

1. Spatial Hash Grid
   - For segments
   - For obstacle detection
   - O(n) bucket lookup instead of O(n²)

2. R-Tree or interval tree for:
   - Obstacle bounds
   - Segment range queries

3. Directed adjacency map:
   Map<nodeId, Set<connectedEdgeIds>>

   So re-routing affects only local edges.

4. Edge Dirty Tracking System:
   - markEdgeDirty(edgeId)
   - Only re-route dirty edges
   - Avoid full graph re-route

5. Path memoization cache:
   - Cache path hash
   - If no geometry change → reuse previous path

---

# 🟢 TASK 3 — TIME & SPACE OPTIMIZATION

Refactor to ensure:

- No O(n²) loops in:
  - Lane grouping
  - Crossing detection
  - Parallel edge grouping

- Replace nested loops with:
  - Spatial bucketing
  - Coordinate-based hashing

- Avoid cloning large maps repeatedly.
- Use structural sharing where possible.

---

# 🟣 TASK 4 — CANVAS SYSTEM IMPROVEMENTS

Suggest and optionally implement:

1. Viewport-based virtualization:
   - Only render shapes inside viewport.
   - Skip routing off-screen edges.

2. Incremental layout system:
   - When node moves:
     - Only re-route its connected edges.

3. Interaction Layer Separation:
   - Separate:
     - Rendering layer
     - Routing engine
     - Interaction state machine

4. Event batching:
   - Batch drag updates.
   - Throttle routing during drag.

5. Deterministic state machine for edge creation:
   - idle
   - dragging
   - connected
   - committed

Routing should only run in committed state.

---

# 🟡 TASK 5 — ENGINE STABILITY GUARANTEE

Add:

1. Global invariant check before routing:
   - Validate all edges
   - Validate all node bounds
   - Remove corrupted edges

2. Runtime type guards:
   isValidPoint(obj): obj is Point

3. Fail-safe routing:
   If routing fails:
      - fallback to simple straight line
      - do not crash app

---

# 🎯 FINAL GOAL

1. No runtime crashes during interaction.
2. No undefined property access anywhere.
3. Routing complexity reduced.
4. Interaction smooth at 500+ nodes.
5. Canvas behaves like professional whiteboard tool.
6. Strict separation between:
   - Interaction
   - Geometry
   - Rendering
   - Routing

Make this canvas architecture production-grade.