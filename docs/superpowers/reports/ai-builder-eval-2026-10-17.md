# AI diagram evaluation (2026-10-17)

Builder agent.

- builder/nvidia+vision / login-flow: 6 turns, 0 review(s), finished=true, tools=search_icons,add,search_icons,add,add,finish; problems when first asked to finish: 0
- builder/nvidia+vision / web-backend: 3 turns, 0 review(s), finished=true, tools=add,add,finish; problems when first asked to finish: 0
## Summary

| pipeline | runs | failed | clean | icon coverage | in range | crossings (mean) | longest edge (mean px) | label collisions (mean) | mentions | ms (mean) |
|---|---|---|---|---|---|---|---|---|---|---|
| builder/nvidia+vision | 2 | 0 | 100% | 93% | 50% | 0.0 | 233 | 0.0 | 83% | 359930 |

## Runs

| pipeline | prompt | nodes | clean | icons | crossings | longest | collisions | groups dropped | error |
|---|---|---|---|---|---|---|---|---|---|
| builder/nvidia+vision | login-flow | 7 | yes | 86% | 0 | 270 | 0 | 0 |  |
| builder/nvidia+vision | web-backend | 7 | yes | 100% | 0 | 196 | 0 | 0 |  |
