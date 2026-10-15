# Canvas UX implementation plan

Spec: `docs/superpowers/specs/2026-10-16-canvas-ux-design.md`. Order: pure module + tests first, then wiring.

- [x] 1. `keyboard-policy.ts` + tests; rewrite `use-whiteboard-keyboard.ts` to dispatch it (fixes defect 1).
- [x] 2. `viewport-math.ts` + tests; `use-canvas-viewport.ts` delegates (defects 2-4).
- [x] 3. `arrange.ts` + tests (align, distribute, z-order, clone).
- [x] 4. Batched mutations + `use-element-commands.ts`; wire shortcuts, command menu, toolbar.
- [x] 5. `drag-session.ts` + tests (incl. 2,000 elements); wire into `use-whiteboard-drawing.ts`; guides drawn in `use-canvas-engine.ts` (defects 5-6).
- [x] 6. Context menu, minimap (+ math tests), empty state.
- [x] 7. Shortcuts dialog + CLAUDE.md; tsc, lint, vitest, browser tests, build.
