# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Draw-Anything** is a production-grade diagramming engine built with Next.js 15, React 19, TypeScript, and Liveblocks for real-time collaboration. It features a sophisticated orthogonal routing engine for arrows/connections with advanced algorithms for parallel edge spacing, lane assignment, crossing minimization, and congestion-aware routing.

**Tech Stack:**
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript
- **Real-time:** Liveblocks (presence, storage, Yjs)
- **Database/Auth:** Convex (backend), Clerk (auth)
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest
- **AI:** LangChain with multiple LLM providers (Anthropic, Google, Groq, OpenAI)

---

## Common Development Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint

# Testing
npm run test             # Run all tests (vitest run)
npx vitest               # Watch mode
npx vitest run <file>    # Run specific test file

# Type checking
npx tsc --noEmit         # TypeScript type check

# Database (Convex)
npx convex dev           # Local Convex dev server
npx convex deploy        # Deploy to Convex
```

---

## High-Level Architecture

### Core Directory Structure

```
/core
├── arrow/                    # Arrow routing & connection logic
│   └── use-arrow-connections.ts  # Main hook for arrow routing
├── routing/                  # Routing engine (core algorithmic work)
│   ├── orthogonal-router.ts      # Public API: routeArrowPoints, routeArrowBatch
│   ├── route-engine.ts           # Main pipeline orchestrator (dirty tracking, caching)
│   ├── parallel-edge-manager.ts  # Parallel edge offset computation
│   ├── lane-manager.ts           # Lane assignment & grid snapping
│   ├── crossing-minimizer.ts     # Crossing reduction post-pass
│   ├── segment-conflict-resolver.ts # Spatial index for segment conflicts
│   ├── congestion-map.ts         # Segment traffic tracking
│   ├── obstacle-avoidance.ts     # A* pathfinding around obstacles
│   ├── path-normalizer.ts        # Final path cleanup (Manhattan, grid snap)
│   ├── spatial-hash-grid.ts      # O(1) spatial queries
│   ├── adjacency-map.ts          # Graph structure for incremental routing
│   ├── path-cache.ts             # Path memoization
│   ├── routing-guards.ts         # Runtime type guards (Task 1/5)
│   └── routing-utils.ts          # Geometry utilities
├── anchors/                  # Anchor generation for shape connections
├── shapes/                   # Shape registry & rendering
├── snap/                     # Magnetic snap logic
├── layout/                   # Layered layout algorithms
└── utils/                    # Shared utilities

/app                          # Next.js App Router pages
├── (main-page)/              # Dashboard, billing, org creation
├── whiteboard/[id]/          # Main whiteboard editor
└── api/                      # API routes (AI generation, auth)

/hooks                        # React hooks
/convex                       # Convex backend (schema, mutations, queries)
/components                   # UI components (Radix UI + custom)
```

---

## Routing Engine Architecture

The routing engine is the most complex part of the codebase. Key concepts:

### Pipeline Stages (route-engine.ts)
1. **Input Sanitization** - `sanitizeEdges` / `sanitizeObstacles` (guards)
2. **Dirty Tracking** - Only re-route edges marked dirty
3. **Parallel Offset Computation** - Group edges by source/target, assign offsets
4. **Spatial Index Build** - Segment spatial index for O(log n) conflict detection
5. **Per-Edge Routing** - A* obstacle avoidance + candidate scoring
6. **Segment Conflict Resolution** - Push paths off overlapping segments
6. **Lane Assignment** - Grid-snapped lane offsets for collinear edges
7. **Crossing Minimization** - Local swaps to reduce crossings
8. **Path Normalization** - Manhattan enforcement, grid snap, corridor unification
9. **Endpoint Stabilization** - Pin stubs to connection handles
10. **Validation** - Hard overlap guarantee

### Data Structures for Performance (Task 2)
- **SpatialHashGrid** (`spatial-hash-grid.ts`) - O(1) spatial queries for obstacles/segments
- **AdjacencyMap** (`adjacency-map.ts`) - `Map<nodeId, Set<edgeId>>` for local re-routing
- **CongestionMap** (`congestion-map.ts`) - Segment traffic heatmap
- **PathCache** (`path-cache.ts`) - Memoization keyed by geometry hash
- **RouteEngineState** - Dirty edges, route cache, path hash cache, congestion map

### Critical Types

```typescript
// Point = { x: number, y: number }
// ConnectionHandle = "top" | "right" | "bottom" | "left"

RouteArrowDescriptor {
  arrowId: string
  start: Point
  end: Point
  startHandle?: ConnectionHandle
  endHandle?: ConnectionHandle
  routePreference?: "vh" | "hv"
  routingMode?: "straight" | "orthogonal"
  existingPoints?: Point[]
  preserveManualBends?: boolean
  sourceId?: string        // Required for full routing
  targetId?: string        // Required for full routing
}
```

---

## Known Issues & Fixes (from CLAUDE.md task list)

### 🔴 TASK 1 — Runtime Crash Fix (DEFENSIVE ROUTING)
**Problem:** `TypeError: Cannot read properties of undefined (reading 'x')`
**Stack:** `getDirectionBucket` → `getGroupKey` → `computeParallelOffsets` → `routeArrowBatch` → `useArrowConnections`

**Root Cause:** During drag state, arrows may have undefined `sourceId`, `targetId`, `startPoint`, or `endPoint`. Routing pipeline assumes fully resolved edges.

**Fix locations:**
- `parallel-edge-manager.ts`: `getDirectionBucket`, `getGroupKey`, `computeParallelOffsets` - add stricter guards
- `orthogonal-router.ts`: `routeArrowBatch` - filter incomplete edges earlier
- `use-arrow-connections.ts`: Only run full routing when `isRouteDescriptorReady` passes

### 🔵 TASK 2 — Data Structure Upgrade (1000+ arrows)
- Spatial Hash Grid for segments/obstacles (✓ `spatial-hash-grid.ts`)
- R-Tree/interval tree for obstacle bounds (✓ partially in `congestion-map.ts`)
- Adjacency Map for local re-routing (✓ `adjacency-map.ts`)
- Edge Dirty Tracking (✓ `route-engine.ts`: `markEdgeDirty`, `clearEdgeDirty`)
- Path Memoization Cache (✓ `path-cache.ts` + `route-engine.ts` pathHashCache)

### 🟢 TASK 3 — Complexity Optimization
- Replace O(n²) loops with spatial bucketing (✓ `segment-conflict-resolver.ts` uses spatial index)
- Avoid cloning large maps (use structural sharing)

### 🟣 TASK 4 — Canvas System
- Viewport virtualization (✗ not implemented)
- Incremental layout (✓ adjacency map enables this)
- Interaction/Render/Routing separation (✓ mostly separated)
- Event batching/throttling (✗ `use-raf-throttle.ts` exists but not fully integrated)

### 🟡 TASK 5 — Engine Stability
- Global invariant checks (✓ `routing-guards.ts`: `sanitizeEdges`, `sanitizeObstacles`)
- Runtime type guards (✓ `isValidPoint`, `isFullyConnectedEdge`, `toValidPoint`)
- Fail-safe routing (✓ try/catch in `routeArrowPoints` with straight-line fallback)

---

## Key Files to Understand

| File | Purpose |
|------|---------|
| `core/routing/route-engine.ts` | Main pipeline, dirty tracking, caching |
| `core/routing/orthogonal-router.ts` | Public API, batch routing, single-edge routing |
| `core/routing/parallel-edge-manager.ts` | Parallel edge grouping & offsets |
| `core/routing/routing-guards.ts` | **Critical** - all runtime type guards |
| `core/arrow/use-arrow-connections.ts` | React hook connecting elements to routing engine |
| `core/routing/spatial-hash-grid.ts` | O(1) spatial indexing |
| `core/routing/adjacency-map.ts` | Graph adjacency for incremental updates |

---

## Testing Strategy

```bash
# Unit tests for routing guards
npx vitest run core/routing/routing-guards.test.ts

# Integration tests for routing pipeline
npx vitest run core/routing/route-engine.test.ts

# All routing tests
npx vitest run core/routing/
```

---

## Important Patterns

### Defensive Coding (Task 1/5)
```typescript
// ALWAYS use routing guards before accessing point properties
import { isValidPoint, isValidPointArray, toValidPoint } from "@/core/routing/routing-guards";

if (!isValidPoint(start) || !isValidPoint(end)) {
  return getFallbackPath(start, end);  // Never crash
}
```

### Dirty Tracking Pattern
```typescript
// In route-engine.ts
markEdgeDirty(state, arrowId);      // Mark for re-routing
clearEdgeDirty(state, arrowId);     // After successful cache hit
```

### Path Memoization
```typescript
// Key = geometry hash of (sourceId|targetId|start|end|handles|preference|...)
const pathHash = computePathHash(edge);
if (state.pathHashCache.get(edge.arrowId) === pathHash && state.routeCache.has(edge.arrowId)) {
  return state.routeCache.get(edge.arrowId);  // Reuse cached route
}
```

---

## AI Integration Notes

- Diagram generation: `app/api/generate-diagram/route.ts` & `app/api/ai/generate-diagram/route.ts`
- Uses LangChain with multiple providers
- Convex stores AI memory in `convex/aiMemory.ts` and `convex/aiFrames.ts`

---

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOY_KEY=
LIVEBLOCKS_SECRET_KEY=
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=
# AI providers (at least one)
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
```

---

## Git Workflow

- Main branch: `main`
- PRs target `main`
- Run `npm run lint` and `npm run test` before committing
- Conventional commits preferred