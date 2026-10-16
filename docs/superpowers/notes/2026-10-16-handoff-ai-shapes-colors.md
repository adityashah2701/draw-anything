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
