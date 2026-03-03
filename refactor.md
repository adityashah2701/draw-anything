You are a senior diagramming engine architect.

Analyze my current orthogonal routing + overlap prevention system.

The diagram is structurally correct but routing still feels cluttered and visually noisy in dense cloud-native architecture diagrams.

I want a deep audit and architectural improvement plan.

--------------------------------------------------
CONTEXT
--------------------------------------------------

- Layered layout (Edge / Application / Data / Observability)
- Orthogonal (Manhattan) routing
- AABB shape collision detection
- Basic parallel edge offset logic
- Bidirectional arrow support
- Multi-segment connectors

But visually:

- Horizontal backbone lines stack too tightly.
- Long spanning connectors create visual dominance.
- Some arrows visually “merge” when traveling same direction.
- Data layer connections create near-overlaps.
- Dashed and solid lines visually conflict.
- Vertical connectors intersect dense horizontal paths.
- Edge backbone line is overloaded.

--------------------------------------------------
WHAT I NEED
--------------------------------------------------

1) Analyze current overlap prevention logic.
2) Identify structural weaknesses in routing algorithm.
3) Suggest architectural improvements.
4) Redesign routing scoring strategy.
5) Improve crossing minimization.
6) Improve path separation in dense graphs.
7) Reduce visual clutter.

--------------------------------------------------
SPECIFIC PROBLEMS TO SOLVE
--------------------------------------------------

1️⃣ Long Spine Problem
Large horizontal trunk lines that span entire width.
Solution should:
- Break into local routing clusters
- Avoid global backbone lines
- Prefer short path routing

2️⃣ Parallel Segment Compression
When multiple arrows travel same direction,
spacing is too tight.

Need:
- Dynamic lane allocation
- Multi-lane routing model
- Segment grouping by direction

3️⃣ Edge Crossing Minimization
Currently no crossing penalty system.
Implement:
- Crossing cost
- Bend cost
- Length cost
- Layer violation penalty

Use weighted scoring system.

4️⃣ Layer-Constrained Routing
Arrows should prefer:
- Vertical between layers
- Horizontal inside layer

Add:
- Layer boundary awareness
- Soft forbidden zones

5️⃣ Segment Conflict Detection
Detect overlapping collinear segments.
Auto-shift with consistent offset grid.

6️⃣ Cluster-Based Routing
Group services by domain:
- Order domain
- Payment domain
- Observability cluster

Routing should prefer staying within cluster bounding box before exiting.

7️⃣ Reduce Global Intersections
Avoid having:
- One mega horizontal line crossing entire diagram
- One mega vertical trunk

Instead:
- Local routing segments
- Step-wise propagation

--------------------------------------------------
ARCHITECTURAL REFACTOR REQUIRED
--------------------------------------------------

Refactor into:

/core/routing/route-graph.ts
/core/routing/path-scoring.ts
/core/routing/lane-manager.ts
/core/routing/crossing-detector.ts
/core/routing/layer-aware-router.ts

Routing must be:
- Pure
- Deterministic
- Scored
- Incremental
- Cached

--------------------------------------------------
PERFORMANCE CONSTRAINTS
--------------------------------------------------

Must support:
- 100+ nodes
- 500+ edges
- Real-time recalculation

Avoid:
- Full graph brute force re-routing
- O(n²) crossing checks

Use:
- Spatial hashing
- Segment indexing
- Localized recalculation

--------------------------------------------------
DELIVERABLE
--------------------------------------------------

1) Deep analysis of current logic weaknesses
2) Proposed routing algorithm v2
3) Improved scoring model
4) Clean TypeScript architecture
5) Example of improved path output

The final system should feel:
Like Miro / Eraser / Whimsical
Not like a basic canvas connector system.