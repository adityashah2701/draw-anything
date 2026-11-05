# AI diagram evaluation (2026-11-05)

Offline baseline: repository fixtures and prompt examples compiled by the current engine (no model calls). Run `npm run eval:ai` for a real-agent baseline.
## Summary

| pipeline | runs | failed | clean | icon coverage | in range | crossings (mean) | longest edge (mean px) | label collisions (mean) | mentions | ms (mean) | clearance (min px) | bends (mean) | alignment | reading | generic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fixture/layout | 5 | 0 | 80% | 80% | 100% | 7.0 | 1849 | 0.0 | 100% | 0 | 0 | 1.8 | 98% | 67% | 20% |
| fixture/example | 3 | 0 | 100% | 100% | 100% | 0.7 | 742 | 0.0 | 100% | 0 | 28 | 1.7 | 100% | 82% | 0% |

## Runs

| pipeline | prompt | nodes | clean | icons | crossings | longest | collisions | groups dropped | error |
|---|---|---|---|---|---|---|---|---|---|
| fixture/layout | architecture | 17 | yes | 100% | 4 | 1367 | 0 | 0 |  |
| fixture/layout | flowchart | 13 | yes | 100% | 0 | 1516 | 0 | 0 |  |
| fixture/layout | mind-map | 25 | yes | 0% | 0 | 2461 | 0 | 0 |  |
| fixture/layout | stress | 41 | no | 100% | 29 | 2639 | 0 | 0 |  |
| fixture/layout | auth-flow | 12 | yes | 100% | 2 | 1262 | 0 | 0 |  |
| fixture/example | example-1 | 11 | yes | 100% | 0 | 854 | 0 | 0 |  |
| fixture/example | example-2 | 11 | yes | 100% | 2 | 879 | 0 | 0 |  |
| fixture/example | example-3 | 7 | yes | 100% | 0 | 493 | 0 | 0 |  |
