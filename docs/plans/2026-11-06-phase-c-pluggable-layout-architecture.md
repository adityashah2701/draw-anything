# Phase C: independent, pluggable layout architecture (replaces U6)

Status: **v2, amended after review. Nothing here is implemented.** It supersedes the plan's U6 ("Layout families"). Approved direction; decisions D1 to D7 approved with the clarifications in section 9. **C0 does not start until this version is reviewed.** After approval only C0 is implemented; C1 to C5 each need their own approval. U15 and the family units (U11 to U14, U16, U17) are untouched.

## 0. What changed since v1

| # | Review amendment | Where it is resolved |
| --- | --- | --- |
| 1 | Freeform default versus family engines | 5.1 (default-engine rules) |
| 2 | One position-mutation mechanism for every editing path | 4.5 (the placement stamp), 4.6 (path coverage) |
| 3 | Three explicit user modes for incremental layout | 5.2 |
| 4 | One canonical location for layout configuration; the missing "section 5.4" reference | 4.4 (`LayoutRecord`); the dangling reference is removed |
| 5 | Hybrid ELK, with per-algorithm benchmarking and lazy loading before enabling | 6.5 |
| 6 | Reuse existing infrastructure, no duplication across engines | 4.2 (kit and import boundary), 2.2 |
| 7 | Exactly zero displacement of user and locked elements; legacy boards tested | 7, 8 |

## 1. Why U6 as written is not enough

U6 proposed one `PlacementEngine` choosing a family inside the same compiler. That keeps three limits that make layouts rigid today:

1. The engine's only output is "a top-left corner per node". It cannot say which nodes it may move, report what it moved, take constraints, or place only what is new.
2. User intent is not stored. It is guessed afterwards by recompiling the diagram and diffing.
3. Every family funnels through the layered engine (`placeLayered`), tuned by conditionals (`layers`, `flow`, `stacked`, a transposition for direction, a cost chooser).

## 2. What the current code does (inspection)

### 2.1 Where it overrides, or can override, user positioning

| Where | What happens | Why it is a problem |
| --- | --- | --- |
| `features/diagram-code/pins.ts` `findMovedNodes` | Recompiles the diagram's own graph; a node whose centre differs from the fresh layout by more than 2 px (after removing the median shift) is "moved by the user". | User intent is inferred. If the engine changes, every node looks moved and is pinned wholesale. A node the user left alone that the engine also moved is treated as user-placed. Nothing is stored. |
| `features/diagram-code/apply.ts` `movedNodes` | Compares each node with a saved baseline (`SyncState.baseline`). | State, not inference, but only for the code panel's sync; the AI paths use the inference above, so there are two definitions of "moved". |
| `features/ai/server/layout/pins.ts` `withPins` | Lays out everything, puts pinned nodes back, then slides other nodes sideways in reading order until nothing overlaps. | Unpinned neighbours are pushed by a sweep that knows nothing about groups, rows or hierarchy. Pins are centres only. |
| `canvas-compiler.ts` `compileWith` | A node whose code gives `x` and `y` is a fixed pin. | Good as an explicit constraint, but the only explicit one, and per node only. |
| `features/whiteboard/commands/layout.ts` `planAutoLayout` | Moves every unlocked unit with one of five generic algorithms. | Locks are the only protection. No preview. Group frames do not move with it. One algorithm set for every diagram family. |
| `diagram-agent/builder/state.ts` offsets | A node may drift at most `MAX_OFFSET` = 240 from its automatic place. | A workaround for an engine that takes no constraints; it limits the agent, not a person. |
| `compileAIDiagramDetailed` | Compiles up to six variants and keeps the cheapest by `layoutCost`. | On an edit the cost ignores movement, so it can choose a variant that moves everything. |
| `apply.ts` `planApply` | Re-translates fresh elements to keep the top-left corner. | A heuristic for "do not slide off screen", not a preservation guarantee. |

No stored field says "a person placed this" (`locked` means "cannot be edited"). Storage has exactly **four direct write sites**, all in `use-whiteboard-page-controller.ts` (`writeElement`, the `addElement` push, the `applyDocPatch` push and the seeding push), plus `core/groups/patch.ts: applyPatch` used by the in-memory host. That is what makes a single stamping mechanism practical (4.5).

### 2.2 Infrastructure that stays, and how it is shared

Nothing below is rewritten or copied into an engine. Files that move to `core/layout/kit` move with `git mv` and a re-export shim at the old path, so existing imports and tests keep working unchanged.

| Keep | Role |
| --- | --- |
| `core/routing/*` | Unchanged; runs after placement exactly as now. |
| `layout/handle-selection.ts`, `core/anchors/ports.ts`, `channels.ts`, `bus.ts`, `edge-labels.ts` | Post-placement kit steps shared by every engine. |
| `layout/group-headings.ts`, `frame-constants.ts`, `group-separation.ts`, `core/frames/*`, `core/groups/*` | Container geometry; engines return membership, the kit computes bounds and headings. |
| `layout/layered-order.ts`, `layered-placement.ts` | Extracted once as the **layered core**, used by the architecture, UML and BPMN engines. |
| `layout/metrics.ts` (`measureLayout`), `layout/aesthetics.ts` | The metric library (section 7). |
| `core/text/node-size.ts` | Sizes are an input; engines never size. |
| `layout/benchmark`, `elkjs` (dev dependency) | The comparison harness and the ELK gate (6.5). |
| `DocPatch`, `applyDocPatch`, `commands/*` planners | A layout result is a `DocPatch`: one mutation, one undo step, the same path for editor and AI. |
| diagram-code IR, `SyncState` baseline merge, explicit `x`/`y`/`w`/`h` | Authored positions in code stay authoritative. |
| `diagram-agent/profiles` | Picks the default engine and algorithm per diagram type. |

### 2.3 What is replaced (in C5, after parity)

`PlacementEngine = (input) => Map` as the sole contract; `withPins`' sweep; `findMovedNodes` as the source of intent (it remains the fallback for boards with no state until then); the `DepthMode` branching and cost chooser; the generic algorithms of `planAutoLayout` for family diagrams.

## 3. Principles

1. **User position is data, not a guess.** Every placeable element is `auto`, `user` or `locked`.
2. **Layout never silently overrides.** Only an explicit full re-layout moves `user` elements; nothing automatic ever does; `locked` never moves, in any mode.
3. **Preview before apply.** Every layout is a plan a person can accept, tweak or discard.
4. **Content is independent of layout.** Switching algorithm changes positions and the layout record only.
5. **Freeform is an engine,** the identity layout, first-class.
6. **Independent engines, one shared kit.** An engine owns its algorithms, parameters, validation and incremental behaviour; it imports nothing from another engine.
7. **No forced neatness.** Alignment, spacing and hierarchy are parameters that may be off.

## 4. Architecture

### 4.1 Where it lives

`core/layout/` (framework-free, like `core/routing`): `types.ts`, `registry.ts`, `placement.ts` (the stamp, 4.5), `record.ts` (the layout record, 4.4), `kit/`, `engines/<family>/`, `elk/` (6.5). `core` never imports from `features`. `features/ai/server/layout/*` keeps only AI-compilation code (sizing preparation, the architecture adapter) and re-exports the kit during migration.

### 4.2 The shared interface

```ts
type EngineId = "architecture" | "mind-map" | "er" | "uml" | "bpmn" | "sequence" | "freeform";

interface LayoutEngine<P = Record<string, unknown>> {
  id: EngineId;
  family: DiagramFamily;
  algorithms: readonly AlgorithmDef<P>[];   // name, zod params + defaults, backend: "native" | "elk"
  validate(graph: LayoutGraph): LayoutDiagnostic[];
  layout(request: LayoutRequest<P>): LayoutResult;        // initial: place everything movable
  update(request: IncrementalRequest<P>): LayoutResult;   // incremental: place the delta, move auto minimally
}

interface LayoutRequest<P> {
  graph: LayoutGraph;                                     // nodes (size, kind, ports), edges (relation), containers, user order
  algorithm: string;
  params: P;
  positions: Map<string, { x: number; y: number; source: "auto" | "user" | "locked" }>;
  mode: "preserve" | "adjust" | "overwrite";              // section 5.2
  constraints: LayoutConstraint[];                        // fixed, keepOrder, sameRow/Column/Lane, keepInside, minGap, region
  seed: number;
  budget: { maxMs: number; maxMoveOfAuto?: number };
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;      // only elements the engine placed
  containers?: Map<string, Bounds>;
  hints?: { edgeSides?: EdgeSides; lanes?: Map<string, string> };
  moved: string[];
  unplaced: { id: string; reason: string }[];
  diagnostics: LayoutDiagnostic[];
  stats: LayoutStats;                                     // the metrics of section 7
}
```

Engines return positions and hints, not elements. `planLayout(ctx, request) -> { patch, preview }` turns a result into a `DocPatch` (positions, container bounds, connector re-routing through the existing router, user edge sides honoured) and serves the editor, the code panel and the AI tool.

**Shared-code rule (amendment 6).** An engine may import only `core/layout/kit`, `core/routing`, `core/geometry`, `core/frames`, `core/groups`, `core/text` and its own folder. A boundary test parses the imports of `core/layout/engines/**` and fails on an engine-to-engine import or an import from `features`. Behaviour used by two engines (layered ordering, tidy-tree placement, overlap resolution, free-slot search, container bounds, label room, handle selection) lives in the kit, once.

### 4.3 The registry

`registerLayoutEngine(engine)`; `engineFor(record | diagramType)`. Algorithms declare their `backend`; `elk` algorithms are registered only through the gated lazy loader (6.5).

### 4.4 Canonical layout configuration: the `LayoutRecord`

There is **one** place for layout configuration: a `LayoutRecord` in the stored element list, beside the group records that already follow this pattern (`{ id, type: "group", points: [] }`: stored with the shapes, not drawn, carried by undo, collaboration, autosave and the AI snapshot for free). It replaces every earlier idea (`ai.layout`, a field on a frame element, board metadata); none of those is used.

```ts
interface LayoutRecord {
  id: string;                      // "layout:<scope.kind>:<scope.id>", so at most one per scope
  type: "layout";
  points: [];                      // like a group record: never drawn
  scope: { kind: "board" } | { kind: "diagram"; id: string } | { kind: "frame"; id: string };
  engine: EngineId;
  algorithm: string;
  params?: Record<string, unknown>;
  incremental: "preserve" | "adjust";   // the sticky default for edits (5.2); "overwrite" is never sticky
  version: 1;
}
```

* `scope.diagram.id` is the diagram's generation id (`ai.generationId`, already carried by every element a diagram draws and kept by the code panel's sync).
* `scope.frame.id` is a first-class `frame` element's id: **a frame has no layout fields of its own**; it is referenced by a record. A frame may therefore have its own engine or `freeform`, nested inside a diagram's layout.
* **Resolution for an element, one function** (`layoutFor(index, element)`): the nearest enclosing frame's record (walking `frameId`), else the record of its diagram, else the board record, else none, which means **freeform**. Same function everywhere.
* Record handling generalises the existing `isGroupRecord`/`splitStored` split into one "records" notion (group and layout), so shapes-only consumers (renderers, router, export, minimap, AI snapshot, thumbnails) keep receiving shapes only. C0 includes a test that enumerates every `isGroupRecord` call site and proves a layout record is never drawn, exported, selected, hit-tested or counted as an element.
* A record is read, never required: a board with no record is valid and means freeform.

### 4.5 One position-mutation mechanism: the placement stamp

Every placeable element (nodes, icons, frames, groups' members) may carry `placement?: "auto" | "user"`. `locked` is the existing flag and wins over both. **Absent means `user`** (legacy elements and hand-drawn shapes are never moved by an automatic operation; no migration).

The rule is implemented once, as a pure function in `core/layout/placement.ts`:

```ts
stampPlacement(current: Placed | undefined, next: Placed, origin: "user" | "layout", override?: "auto" | "user"): Placed
```

* If `override` is given it wins (used by diagram-code apply: explicit `x`/`y` in code is `user`, engine-placed is `auto`).
* Else if the element is new, or its position or size differs from `current` (points compared exactly), the stamp is `origin === "layout" ? "auto" : "user"`.
* Else the stamp is left as `current.placement` (unchanged geometry changes nothing).
* Connectors do not carry a stamp (routing owns their geometry; `isManuallyRouted` already covers a hand-bent route).

It is applied at the **storage boundary**, not in callers: `writeElement` (used by `updateElement`, `updateElements` and `applyDocPatch`), the two `push(new LiveObject(...))` sites for adds, and `core/groups/patch.ts: applyPatch` (the in-memory host that AI tests and the tool executor use). `DocPatch` gains `origin?: "user" | "layout"` (default `user`) and `placements?: Record<id, "auto" | "user">` for per-element overrides. A caller cannot forget to stamp, because callers do not stamp.

**Coverage of every editing path (all verified to reach one of those sites):**

| Path | How it reaches storage | Stamp |
| --- | --- | --- |
| Drag, resize, rotate | `updateElement(s)` inside the gesture's undo bracket | `user` |
| Inspector X/Y/W/H, properties bar | `updateElements` via `planTransform` | `user` |
| Keyboard nudge, align, distribute, z-order, flip | `use-element-commands` to `updateElements`/`applyDocPatch` | `user` |
| Paste, duplicate, drag-copy | adds via `addElement`/`applyDocPatch`; the copy's inherited stamp is replaced (the element is new) | `user` |
| Frame ownership changes after a drag | inside the drag's mutation | `user` for the dragged, none for the rest (geometry unchanged) |
| Undo / redo | the stamp is a field written in the same mutation, so Liveblocks history restores position and stamp together; no code runs | restored exactly |
| Remote collaborator | their mutation already carries its stamp | as written |
| AI edits (`move_elements`, `update_*`, `arrange`, ...) | `host.applyPatch` to `applyDocPatch` | `user` (the person asked for it) |
| AI `generate_diagram`, builder steps, code-panel first draw | the compile patch sets `origin: "layout"` | `auto` (explicit `x`/`y` in code: `user`) |
| Diagram-code edits | `planApply` returns per-element `placements`: node with `x`/`y` in code `user`; moved by the engine `auto`; untouched nodes keep theirs | as stated |
| `planLayout` apply | `origin: "layout"` on moved elements only | `auto` |
| Board seeding from the Convex snapshot | reads; writes nothing | unchanged (absent stays absent) |

Enforcement (C0 tests): (a) a boundary test greps `features/` and `core/` for `.update(` on Liveblocks objects and `new LiveObject(` outside the stamp sites and fails on any new one; (b) a table-driven test runs every move command of `features/whiteboard/commands/*` and the AI tools through the in-memory host and asserts the stamp; (c) a Liveblocks-fake test does move, undo, redo and asserts position and stamp restore together.

### 4.6 Per-engine algorithms (the six families plus freeform)

Unchanged from v1 in substance (complexity for n nodes, m edges):

| Engine | Algorithms | Core method | Complexity | Incremental behaviour |
| --- | --- | --- | --- | --- |
| **Mind map** | `radial`, `organic`, `tree`, `freeform` | Tidy-tree placement (Reingold-Tilford, linear-time version by Buchheim, Jünger and Leipert) with angular wedges proportional to leaf weight; organic: stress or force-directed on tree edges plus overlap removal, fixed seed | tree/radial O(n); organic O(n^2) per iteration | New child takes a free slot in its parent's wedge (wedges keep slack); siblings shift only as far as the wedge needs; collapsed branch releases its wedge; organic relaxes only the new node and neighbours |
| **ER** | `compact`, `hierarchical`, `clusters`, `freeform` | Stress with node-size-aware distances for `compact`; layered core with relationship diamonds as nodes for `hierarchical`; communities laid out then packed for `clusters` | stress O(n^2)/iter; layered O(n m) | Local relax around the new entity, the rest fixed |
| **UML** | `inheritance`, `layered`, `package`, `freeform` | Layered core with edge-type rules (supertypes above, interfaces topmost, composition to the side); packages as compound super-nodes | O(n m) | A new subclass joins the layer below its parent by barycentre; only auto nodes shift, by the minimum that keeps order |
| **BPMN / flowchart** | `horizontal`, `vertical`, `swimlane`, `freeform` | Layered left to right or top to bottom; Brandes-Köpf coordinate assignment (linear); swimlane: lanes are y-bands from the model, ordering in a lane by crossing minimisation | O(n m) | Insert between two columns: shift only auto columns to the right, order preserved; lane membership is data |
| **Sequence** | `participants`, `lifelines`, `timeline`, `freeform` | Participant order from the user, or minimal total message span; x spacing from widest label between neighbours; y strictly by message order | O(n + k log k) | Appending moves nothing; inserting a message shifts those below by one slot; a fixed participant order is never changed |
| **Architecture** | `layered` (today's engine, extracted), `dependency`, `grouped`, `freeform` | Existing layered core plus group frames; `dependency` adds feedback-arc removal and network-simplex-style layering | O(n m) | New node placed by barycentre among fixed neighbours |
| **Freeform** | `keep`, `place-new` | Identity; new nodes to the nearest free slot beside their neighbours (spiral search with the kit's overlap test) | O(n) per new node | Nothing existing moves |

## 5. Defaults, incremental behaviour and user control

### 5.1 Which engine a diagram gets (resolves amendment 1)

There is no conflict: "freeform by default" applies to boards, "family engine by default" applies to diagrams the app generates, and the **record** is what says which.

| Situation | Layout record | Behaviour |
| --- | --- | --- |
| AI-generated semantic diagram (`generate_diagram`, agent or builder pipeline, a new diagram made in the code panel) | **Created at generation** with the engine from the diagram profile (`profileFor(type).family`), its default algorithm, `incremental: "adjust"`, in the same patch as the elements | Family engine; nodes `auto` (explicit `x`/`y` `user`) |
| Hand-drawn or imported generic board | None | Freeform; shapes carry no stamp, which reads as `user` |
| **Existing diagram saved before C0** (no record, no stamp) | **None is created, ever, automatically** (loading writes nothing) | Behaves as today: freeform plus the legacy pin inference in the code panel; positions are never moved by any automatic operation. A person can attach an engine explicitly through the Layout command, which is a preview first |
| A frame the person marks freeform, or locks, inside an engine-laid diagram | A frame-scoped record (`engine: "freeform"`) or the frame's `locked` | Engine treats it as a fixed rectangle; contents are not laid out |
| Switching algorithm or engine | The record is rewritten (undoable); positions only change through a previewed apply | Content untouched |

### 5.2 Three explicit user modes (amendment 3)

Every layout operation runs in exactly one mode. The Layout command shows all three; edits that trigger layout (adding a node by code, by the AI, by hand into an engine diagram) use the diagram record's sticky `incremental` value (`preserve` or `adjust`; set in the Layout panel, default `adjust` for generated diagrams). `overwrite` is never sticky and never automatic.

| Mode | What may move | New elements | When used | Preview |
| --- | --- | --- | --- | --- |
| **Preserve all positions** | Nothing that exists: `auto`, `user` and `locked` all stay exactly | Placed by the freeform `place-new` method (nearest free slot beside their neighbours), even in an engine diagram; no overlap is created, nothing is pushed | Sticky option; any edit when the diagram's `incremental` is `preserve` | Shows only the new elements' positions |
| **Adjust auto-positioned only** | Only `auto` elements, and only the affected set (new elements, endpoints of changed edges, resized elements and their one-hop neighbours, all `auto`) by the minimal displacement the engine's incremental method allows, within `maxMoveOfAuto`; **`user` and `locked` exactly zero** | Placed by the engine's local method, held to the same limits; an element that cannot be placed legally goes to the nearest free slot and is listed in `unplaced` with a reason | Default for generated diagrams; the Layout command's default | Shows displaced auto elements and the metrics |
| **Overwrite via full re-layout** | Everything the engine can place, `user` included; **`locked` still exactly zero**; moved elements are stamped `auto` | Placed with the rest | Only by an explicit click on "Re-layout everything", after the preview lists how many user-placed elements will move and requires a confirmation; never from an edit, a tool call without `mode: "overwrite"` and `confirm: true`, or a default | Shows every displacement, the count of user-placed elements moved, the metrics before and after |

Rules common to the modes: the result is always previewed first (a canvas overlay: nothing is written, nothing is visible to collaborators); Apply is one undo step; Cancel writes nothing; a diagram with no record and no stamps offers `preserve` and `adjust` (both move nothing that exists, because every existing element reads as `user`) and `overwrite` behind its confirmation.

### 5.3 Initial versus incremental layout

* **Initial** (`layout`): a newly generated diagram: every element is unplaced or `auto`, so the whole diagram is placed.
* **Incremental** (`update`): triggered by a graph delta (nodes added or removed, an edge added, removed or re-targeted, a node resized), diffed by stable ids (diagram-code ids already are). Steps: affected set restricted to movable elements; place the affected set with the engine's local method with everything else as obstacles and anchors; resolve overlaps by moving only movable elements by the smallest displacement along the engine's primary axis (never a global sweep); enforce the budget; optionally preserve the orthogonal ordering of `auto` nodes (a heuristic objective with a measured score, not a promise: exact preservation is NP-hard).

## 6. Evaluation, ELK and the benchmark

### 6.1 Layout quality

Shared (existing `measureLayout` and `aesthetics`): node overlaps, edge crossings, edge-through-node, edge overlaps, label collisions, group violations and looseness, edge length (total and maximum), bends, alignment, centring, reading direction, clearance. Family-specific: mind map (angular balance, ring consistency, sibling evenness), ER (edge length variance, cluster cohesion, cardinality-end clearance), UML (share of generalisations pointing up, hierarchy depth), BPMN (share of flows with the direction, backward edges, lane violations, gateway symmetry), sequence (message order monotonic in y, participant span, label collisions), architecture (tier violations, dependency edges against the main direction).

### 6.2 Preservation of manual edits

| Metric | Target |
| --- | --- |
| Displacement of any `user` or `locked` element by an automatic operation (`preserve`, `adjust`, every edit-triggered layout) | **exactly 0** (byte-identical stored coordinates) |
| Displacement of a `locked` element by any operation, `overwrite` included | **exactly 0** |
| Displacement of `auto` elements outside the affected set | 0 |
| Locality: mean and maximum displacement of affected `auto` elements | reported per engine; budgeted; regression-tested |
| Orthogonal-ordering preservation (share of node pairs keeping x and y order) | per-engine threshold on the edit corpus |
| Proximity preservation (overlap of each node's k nearest neighbours) | reported |
| Idempotence (laying out an unchanged graph moves nothing) | exactly 0 |
| Determinism (same input, same output) | exact |
| Switch round trip (A, then B, then undo twice) restores positions and the record | exact |

Edit corpus per family: add a leaf, add between two, remove, re-target an edge, resize, move by hand then add, lock a region then add into it.

### 6.3 Baselines

The in-repo layered engine is the regression baseline for architecture (golden output unchanged by the extraction). Every new engine is compared with ELK on the same fixtures.

### 6.4 Metrics are data, not opinion

`LayoutStats` (6.1 and 6.2 values) are computed by the kit for every result, shown in the preview, and asserted in tests; the same functions score the benchmark.

### 6.5 ELK: hybrid, gated per algorithm, lazy (amendment 5)

Strategy: native engines for architecture, sequence and freeform (small, domain-specific, deterministic); ELK-backed algorithms (`stress`, `radial`, `mrtree`, compound layered) offered as extra algorithms of the ER, mind-map, UML and BPMN engines **only after each one passes a gate**.

* **Lazy loading.** ELK is imported only through `core/layout/elk/loader.ts` with a dynamic `import()` and run in a worker; a build test asserts that no static import of `elkjs` exists outside the loader and that the main chunk contains none of it, and a size budget fails the build if the lazy chunk is pulled in by the initial route. The first call shows a loading state in the preview; a load failure disables the algorithm with a message and falls back to the native algorithm of the same engine.
* **Gate.** `core/layout/elk/gate.ts` lists every ELK algorithm with `enabled: false` and a path to a committed benchmark report. A test fails if an algorithm is `enabled: true` without a report that meets the gate, so enabling is a reviewed change, not a flag. The gate, per algorithm, on its family's golden set: (1) quality not worse than the native baseline on the family metrics (within a stated tolerance) on at least 90 % of the fixtures; (2) zero node overlaps; (3) deterministic output for the same seed; (4) p95 time within the interactive budget (300 nodes) in the worker; (5) the incremental contract holds through the kit (`enforceFixed` leaves fixed elements byte-identical, locality within budget, idempotence); (6) the report records the elkjs version and licence (EPL-2.0) review.
* **C0 ships none enabled:** only the loader contract, the gate file with every entry disabled, the two tests, and the benchmark harness extension.

## 7. Zero displacement, enforced (amendment 7)

Layers of defence so "exactly zero" is not a hope:

1. **By construction.** The planner builds a patch only from `moved ∩ movable`; a fixed element is never written, so its stored bytes cannot change.
2. **A guard after every engine.** The kit's `enforceFixed(request, result)` discards any position an engine returned for a fixed element, records an invariant violation in `diagnostics`, and throws in tests, so an engine bug is caught immediately instead of shipping.
3. **Property tests** (C0): random graphs, random placement states, random locks and regions, every engine, `preserve` and `adjust` and every edit in the corpus: assert exact equality of all `user` and `locked` coordinates, and for `overwrite` exact equality of `locked`.
4. **Legacy corpus** (below).

## 8. Backward compatibility and the legacy corpus

* No data migration: absent `placement` reads as `user`; absent record reads as freeform; loading writes nothing; autosave of an untouched legacy board produces identical content.
* **Legacy corpus tests** (C0), over every board shape that exists today: the layout fixtures (`features/ai/server/layout/fixtures`: architecture, auth-flow, flowchart, mind-map, stress), the browser baseline fixtures, the golden-prompt eval fixtures, the documented diagram-code examples, saved-content test boards, and synthetic legacy boards built for the purpose (no stamps and no records; locked shapes and locked groups; nested groups; first-class frames with children; AI diagrams with group frames; outline, icon, semantic-node and parametric shapes; connectors with and without relations; manually bent connectors). For each: load, render, route and export are identical to before C0 (positions and routes compared to goldens captured **before** the C0 change); `preserve` and `adjust` through every engine move nothing; no record is created by loading; the code panel's apply behaves as before for a record-less diagram (legacy pin inference unchanged until C5).
* Rollback: `AI_LAYOUT_ENGINES=legacy|new` (default `legacy` until C0 acceptance) selects the old compile path; no stored data depends on it.

## 9. Decisions D1 to D7 (approved, as clarified)

| # | Decision | Final form |
| --- | --- | --- |
| D1 | ELK | Hybrid, per-algorithm, benchmark-gated and lazy (6.5); none enabled in C0 |
| D2 | Position state | Element field `placement?: "auto" \| "user"`, absent reads as `user`, stamped only by the storage-boundary function (4.5); layout configuration in a `LayoutRecord` (4.4) |
| D3 | Re-layout default | Never overwrites `user` unless the explicit `overwrite` mode is chosen and confirmed (5.2) |
| D4 | Preview | Non-persistent canvas overlay; Apply is one undo step |
| D5 | Per-frame layout | A frame-scoped `LayoutRecord`; in C0 a freeform or locked frame is a fixed rectangle, per-frame engines arrive in C1 |
| D6 | Sequence order | Order index authoritative, y derived (C4) |
| D7 | Performance | 300 nodes interactive, 1,000 in a worker; measured in C0 |

## 10. Migration, phase C0 scope

| Phase | Content |
| --- | --- |
| **C0 Foundations (the only phase to implement after approval)** | (1) `core/layout` types, registry and the kit by `git mv` plus re-export shims (no behaviour change); (2) the placement stamp and its single application at the storage boundary, with the coverage tests of 4.5; (3) the `LayoutRecord`, records generalisation, `layoutFor` resolution, and the "never drawn or counted" test; (4) the freeform engine with `place-new`; (5) the architecture engine as an unchanged wrapper of the layered core, golden-tested; (6) `planLayout` with the three modes, the preview overlay, one editor command and one AI tool (`layout_diagram`, preview by default); (7) generation creates the record for new AI diagrams, nothing for existing ones; (8) `enforceFixed`, the property tests and the legacy corpus; (9) the ELK loader contract and the disabled gate; (10) `AI_LAYOUT_ENGINES` flag. |
| C1 Layered family | UML, BPMN, architecture `dependency` and `grouped`, per-frame engines |
| C2 Mind map | `radial`, `tree`, `organic` |
| C3 ER | `compact`, `hierarchical`, `clusters` |
| C4 Sequence | `participants`, `lifelines`, `timeline` |
| C5 Retire legacy | remove `withPins`' sweep, `DepthMode` branching, the inference path and `planAutoLayout` for family diagrams; builder `offsets` become `fixed` constraints |

**C0 exit criteria:** all property and legacy-corpus tests green; goldens identical to pre-C0; unit suite, lint, typecheck and the affected Chrome tests green; the boundary tests (engine imports, storage write sites, ELK static import) green; the Layout command previews and applies in the editor with undo restoring positions, stamp and record together.

## 10a. C0 status (built)

C0 is implemented as specified, with these deviations and limits:

* **No `git mv` of existing modules in C0.** The kit holds the new shared code (`fixed`, `diff`, `free-slot`, `stats`, `rect`); the existing layered modules were not moved, because nothing in C0 shares them yet (the layered core is shared by UML, BPMN and architecture in C1, which is when moving it earns its cost). The architecture engine is an adapter in `features/ai/server/layout/` that registers into the core registry, because core must not import features.
* **Architecture `adjust` and `update`** hold nodes through the compiler's existing pins (`withPins`) until C5 retires that sweep; the median shift keeps the diagram where it was.
* **Code panel apply** now pins nodes stamped `user` in addition to the legacy inference (which is unchanged for unstamped nodes), and applies its patch with `origin: "layout"` and per-element `placements`.
* **Diagram-drawn first-class frames** are stamped `auto` (the frame builder applies its patch with origin `layout`).
* **Flag default:** on outside production, off in production until acceptance (`AI_LAYOUT_ENGINES`).
* **Not in C0:** a delta from the code panel into incremental layout (an `adjust` without a delta re-lays out every auto element around the fixed ones), a keyboard shortcut for the Layout panel, per-frame engines (C1), the family engines (C1 to C4), any enabled ELK algorithm.

## 10b. C1 to C5 status (built)

All five engines and the architecture algorithms exist behind the same interface, with the shared incremental behaviour in one factory (`core/layout/kit/natural.ts`). New generated diagrams use their family engine; existing ones are untouched. Limits: group frames are re-fitted only for the architecture engine (others move nodes, and first-class frames follow their contents through the existing frame code); sequence layout arranges participants only (message time order is the connectors' own); the ER and mind-map `organic`/`compact` algorithms are a small deterministic force relaxation, not ELK (no ELK algorithm is enabled); C5 removed nothing, because every legacy path is still the fallback for diagrams with no layout record.

## 11. Risks

* Every move path must stamp: mitigated by stamping at the one storage boundary and the enumerating tests, not by caller discipline.
* A new stored record type touches every consumer of the stored list: mitigated by generalising the existing group-record split and a test over every call site.
* Conservative incremental layout can leave a poor drawing: the preview shows metrics and `unplaced` reasons; re-layout is one explicit click.
* Six engines is a lot of surface: shared kit and layered core, each phase ships alone.
* ELK adds bundle size and a worker: lazy, gated, native fallback.
* Sequence layout has little published algorithmic work beyond lifeline ordering: kept deliberately simple and deterministic.

## 12. Acceptance for this review

Approve or amend: the stamp and its boundary (4.5), the `LayoutRecord` and resolution (4.4), the defaults table (5.1), the three modes (5.2), the ELK gate (6.5), the zero-displacement defences and legacy corpus (7, 8), and the C0 scope and exit criteria (10). No implementation starts before this review.

## Sources consulted

* ELK algorithm reference: https://eclipse.dev/elk/reference/algorithms.html
* Misue, Eades, Lai, Sugiyama, "Layout adjustment and the mental map" (1995); Bridgeman and Tamassia, difference metrics: https://jgaa.info/index.php/jgaa/article/download/paper25/2938 ; dynamic-drawing metrics: https://arxiv.org/pdf/2008.07764 ; order-preserving adjustment: https://arxiv.org/pdf/1502.03847
* Buchheim, Jünger, Leipert, "Improving Walker's algorithm to run in linear time": https://link.springer.com/doi/10.1007/3-540-36151-0_32
* Automatic layout and label management for UML sequence diagrams (Kiel): https://macau.uni-kiel.de/receive/macau_mods_00002025
* yFiles BPMN layout: https://yed.yworks.com/support/manual/layout/layout_bpmn.html
* Not retrieved in full text (cited from abstracts and secondary sources): Misue et al. 1995, Brandes-Köpf, Sander's compound layered layout, Reingold-Tilford.
