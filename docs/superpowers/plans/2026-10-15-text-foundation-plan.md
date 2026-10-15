# Text foundation: implementation plan
Spec: `docs/superpowers/specs/2026-10-15-text-foundation-design.md`. Tests first; each step ends green.

1. `core/text/text-foundation.test.ts` reproduces root causes 1-4 (done; 5/8 failing before changes).
2. `core/text/typography.ts`, `measure-context.ts`; re-point `text-metrics.ts`, `shape-label-renderer.ts`, `rich-text-renderer.ts`, semantic-node renderer, editors. Line height 1.2. -> tests 1-2 pass.
3. `core/text/label-layout.ts` (world units) + `measureShapeLabel`/`renderShapeLabel` as screen<->world adapters. -> zoom tests pass.
4. `resizeText` from `originalBounds`. -> resize tests pass.
5. `core/text/estimate.ts`; use in `canvas-compiler.ts` for node width and edge-label width. + tests for criteria 6-7.
6. `tsc`, `vitest`, `lint`, `build`; update CLAUDE.md text section.
7. Write Sub-project B spec and plan (no code).
