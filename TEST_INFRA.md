# E2E Test Infra: Draw-Anything

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | F1_TEXT_CANVAS_OVERLAY (Perfect text overlay) | ORIGINAL_REQUEST §12 | 5      | 5      | ✓      |
| 2 | F2_TEXT_FORMATTING (Markdown bold/italic) | ORIGINAL_REQUEST §15 | 5      | 5      | ✓      |
| 3 | F3_TEXT_VIEWPORT (Zoom/pan while editing) | ORIGINAL_REQUEST §12 | 5      | 5      | ✓      |
| 4 | F4_ARROW_DRAG (Defensive drag preview) | AGENTS.md Task 1     | 5      | 5      | ✓      |
| 5 | F5_ARROW_ROUTE_PERF (O(N) data structures) | AGENTS.md Task 2&3   | 5      | 5      | ✓      |
| 6 | F6_ARROW_VIRTUALIZATION (Viewport culling) | AGENTS.md Task 4     | 5      | 5      | ✓      |
| 7 | F7_ARROW_STABILITY (Fail-safe straight line) | AGENTS.md Task 5     | 5      | 5      | ✓      |

## Test Architecture
- Test runner: Playwright. Location: `@playwright/test`.
- Invocation: `npx playwright test`.
- Expected: all tests pass with exit code 0.
- Test case format: Playwright test spec files (`*.spec.ts`).
- Directory layout:
  - `e2e/`
    - `tier1-feature/`
    - `tier2-boundary/`
    - `tier3-cross/`
    - `tier4-real-world/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complex Flowchart Building | F1, F2, F4, F5, F7 | High       |
| 2 | Rapid Arrow Dragging & Canceling | F4, F7             | Medium     |
| 3 | Scaled Text Editing while connected | F1, F2, F3, F6     | Medium     |
| 4 | Massive Graph Navigation (1000+ edges) | F5, F6             | High       |
| 5 | Obstructed Routing Recovery | F4, F7             | Medium     |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
