# Scope: Tier 1 E2E Tests

## Architecture
- Setup Playwright (if not already set up)
- Write Tier 1 tests in `e2e/tier1-feature/`
- Tier 1 must have >=5 test cases per feature covering representative inputs for:
  1. F1_TEXT_CANVAS_OVERLAY
  2. F2_TEXT_FORMATTING
  3. F3_TEXT_VIEWPORT
  4. F4_ARROW_DRAG
  5. F5_ARROW_ROUTE_PERF
  6. F6_ARROW_VIRTUALIZATION
  7. F7_ARROW_STABILITY
- Each test must be self-contained and use the simplest verification channel.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Setup | Install Playwright & create basic config | none | PLANNED |
| 2 | Text Tests | F1, F2, F3 feature tests | M1 | PLANNED |
| 3 | Arrow Tests | F4, F5, F6, F7 feature tests | M1 | PLANNED |
