# Handoff 2026-10-16: AI diagram shapes, colours, provider errors

## Findings (verified in code)
- **Only one node shape is ever produced.** `features/ai/server/canvas-compiler.ts` (~l.476) always emits `type: "semantic-node"` (rounded box + icon tile). The DSL accepts `rectangle|circle|diamond|triangle` (`features/diagram-code/canvas.ts` NODE_TYPES) but only when *reading* the canvas back (`diamond` -> kind `decision`); the compiler never writes them. So a flowchart "decision" is a pink rounded box, not a diamond.
- **Colours come from `KIND_COLORS`** (canvas-compiler.ts ~l.55-85), keyed by `node.kind`:
  - pink fill / dark-red stroke = `decision` (`#ffe4e6`/`#be123c`). Start, Account Locked, Dashboard were pink too, so the model tagged them `kind: decision` (or the kind fell through to it): a prompt/playbook issue.
  - white or light-indigo with near-black stroke = kind not in `KIND_COLORS`; fallback alternates by nesting depth (`#f8fafc` / `#eef2ff`).
  - grey cube icon = generic icon fallback (no valid `icon`/`kind`).
- **Errors seen**: Gemini 503 "high demand" (fixed: retry + `GEMINI_FALLBACK_MODEL`, default gemini-2.5-flash). Groq "token limit exceeded" in the screenshot (gpt-oss-120b free tier TPM): not fixed; the agent prompt (system + icon vocabulary + playbooks + examples) is large.

## To do tomorrow
1. Decide: give flowchart kinds real shapes (diamond for decision, pill/ellipse for start/end, rect for process) by letting the compiler choose element `type` from kind/diagramType, or keep semantic-node and only fix colours. Shape registry: `core/shapes/register-shapes.ts`; routing/anchors must support the chosen shapes.
2. Add flowchart kinds (`start`, `end`, `process`, `decision`, `io`) to `KIND_COLORS`, the icon vocabulary and the flowchart playbook (`features/ai/diagram-agent/prompt/playbooks.ts`), and tell the model to use `decision` only for branching.
3. Shrink the prompt for Groq (token limit) or trim icon vocabulary per diagram type.
4. Add a colour legend or neutral palette decision for unknown kinds.

## Not recoverable
The earlier chat about colours was not available to me in this session; if it had decisions beyond the above, re-add them here.


---
# Update 2026-10-16 (later): what is done and what remains

## Done
- **Item 1, real shapes**: `decision` is a diamond (earlier), and now `start`/`end` are pills. Chosen design: a new `pill` shape type in `core/shapes/pill` rather than a semantic-node variant, because start/end carry no icon tile, a semantic node's label region is shifted for the icon, and a separate type keeps hit-testing (stadium, not box), anchors (edge midpoints), resize and export drawing simple and the same as the diamond. Evidence it works: unit tests (geometry, hit-test, resize, label fit, compile, DSL round trip, read-back, pins, metrics) and `tests/browser/pill-shape.browser.test.ts` (real Chrome: label pixels stay inside the outline at 1x and 2x, connectors land on the midpoints, SVG export parses), plus a rendered PNG that was looked at.
- `start` and `end` are new semantic kinds (schema, types, icon registry, colours: green start, red end). A node labelled exactly Start/Begin or End/Finish with no kind gets that kind. `shape: pill` in the DSL, with `oval`/`ellipse` as aliases. This changed one earlier contract: `oval` used to be reported as unsupported.
- **Item 2, kinds and colours for flowcharts** (earlier): start/end/workflow/decision colours; the login example no longer tags Start as a decision.
- **Item 3, prompt size**: the prompt is now built per request. Measured (estimated tokens = characters / 4, text transport): before 1,815; complete prompt without context 1,834; unknown type 1,505; known types 878 (organization) to 1,071 (architecture), i.e. 41-52% smaller. Budgets are enforced by tests.

## What the measurement says about the Groq limit
The system prompt was only about 1.8k estimated tokens, so shrinking it cannot by itself explain a token-limit error. Each turn resends the whole conversation (`MAX_CONVERSATION_CHARS` = 60,000 characters, about 15k estimated tokens, in `agent-loop.ts`) plus the tool results from `check_diagram`; that, and the model's own reasoning tokens, are the more likely cause. Not verified: no provider keys were available, `npm run eval:ai` was not run, and I do not claim the generation quality or the Groq error rate changed.

## Remains
- Run `npm run eval:ai` with a Groq key to see whether the trimmed prompt changes quality, and consider lowering `MAX_CONVERSATION_CHARS` or trimming `check_diagram` output for small-TPM providers.
- Item 4 (a legend or neutral palette for unknown kinds) is still open.
- A pill drawn by hand has no toolbar tool; only diagram code and AI diagrams create pills.
- `color:` is not read back from the canvas into diagram code (pre-existing), so a custom pill colour is lost if the code is regenerated from the board.
