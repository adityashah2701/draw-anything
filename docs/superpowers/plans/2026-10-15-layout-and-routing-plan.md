# Sub-project B: plan (executed 2026-10-16)
Spec: `docs/superpowers/specs/2026-10-15-layout-and-routing-design.md`. Tests first; each step ends green.

Status: steps 0-5 and 7-10 done; step 6 done with ELK rejected on evidence; step 8's command-level UI is not built (the pure pin/relayout logic and the code-editor integration are).

0. Done in the Sub-project A pass: `LAYOUT_FIXTURES` (architecture, flowchart, mind-map) with a validity and coverage test; baseline label-fit numbers (5/17, 5/13, 8/25 nodes shrunk).
1. Settle the font question recorded in the A spec (load Inter, or scale-transform text), so pixel-level numbers are trustworthy.
2. Metrics module + tests (pure geometry over compiled elements): crossings, edge-through-node overlaps, label-label / label-node / label-edge overlaps, label shrink/cut count, bends, total edge length, area, and a movement metric between two layouts.
3. Baseline report for the current engine on the three fixtures, including stability (add one node/edge, re-run; move one node, re-layout). Commit the numbers into the spec and fix the stability threshold from them.
4. Dynamic node sizing in the compiler from `estimateLabelBox` (multiline, long names, decisions). Re-run step 3; criterion 1 must hold.
5. Edge-label placement with collision checks and a reported "cannot place" outcome.
6. Candidate prototype(s) behind `LayoutStrategy` (ELK.js, optionally dagre) on the same fixtures, node sizes and routing stage; produce the comparison report (metrics, runtime, bundle size, licence). Decide and record.
7. Implement the chosen strategy per diagram type (layered, radial/tree for mind maps), ports, and crossing reduction; keep `core/routing` as the final stage.
8. Re-layout command that preserves manually moved nodes.
9. Browser verification: render each fixture on the real canvas with Inter loaded and check label fit and no overlaps from the metrics.
10. Verification: tsc, vitest, test:browser, lint, build; metrics at or better than the thresholds.
