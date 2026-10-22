# Agent layout and geometry: who decides what

Scope: everything between a model's tool call and the pixels a person sees, for the unified canvas agent
(`features/canvas-tools`). Method: read each stage, then check its behaviour with a test
(`tools/design.test.ts`, `agent/design.scenarios.test.ts`, existing `straighten.test.ts`).
Not run: a live model, or the real browser editor; scripted models and the in-memory host only.

## Layers

| Layer | Responsible for | Where |
|---|---|---|
| Semantic plan | What is in the diagram, the flow, roles (start/end, decision, icon), frames | the model (prompt guidance in `agent/prompt.ts`) |
| Geometry plan | Text-fitting sizes, gaps, a position per node, fit to the view | `plan_layout` (`plan.ts`) — arithmetic the model should not guess; the model may use or ignore it |
| Drawing | Turning x, y, width, height into elements | `create_*` tools; `snap: false` places exactly |
| Routing | Connector paths (`orthogonal`, `curved`, `straight`), chosen per connector by the model | `core/routing`, `connectors.ts` |
| Inspection | Measuring what was drawn | `get_document_state`, `validate_diagram`, `review_layout` (`review.ts`) |
| View | Visible area, fit-to-view | `ViewportInfo` (now with `coveredRight`), `revealContent`, `zoom_to_fit` |

## Every automatic step

| Step | Why it exists | Keeps agent geometry? | Predictable? | User/agent control | Problems found |
|---|---|---|---|---|---|
| `snapPlacement` on `create_shape` / `create_semantic_node` | Hand-placed nodes line up like dragged ones | **No**: moves x, y by up to 16 units toward a neighbour's edge/centre | Yes, but silent | **New**: `snap: false` places exactly; `plan_layout` output is meant to be drawn with it | Was the main reason planned coordinates drifted by a few units |
| Minimum node size in `create_semantic_node` | A node must show its icon and text | Enlarges a too-small box | Yes | Warned in the result | None found |
| Default placement (`defaultOrigin`) | Place new content when no x, y is given: right of existing content, else top-left of the view | n/a (no geometry given) | Yes | Pass x, y | New content could land outside the view (see next row) |
| View reveal after `import_diagram` / `generate_diagram` | New content right of the board was often off screen | n/a | Yes: only when part of it is outside the visible canvas; fit never exceeds 100% | **New**: `keep_view: true`; result says the view moved | Fit used the whole canvas width although the agent panel covers its right side; `ViewportInfo.coveredRight` now carries it |
| `straightenWhatWasMade` (`run-agent.ts`) before the final check | Models nudge nodes and leave kinks | **No** for near-aligned nodes the run touched: runs `tidy_diagram` when `validate_diagram` finds misalignment or uneven gaps | Yes | **New**: `autoTidy: false` turns it off; a notice reports when it moved something | Planned layouts with unequal node heights had uneven *edge* gaps and were silently re-spaced; `plan_layout` now spaces edges evenly so a plan is left alone (scenario test) |
| Final `validate_diagram` loop (`verifyRounds`) | Do not report success on a broken board | Never edits; asks the model to fix | Yes, bounded (2 rounds) | Budget option | None |
| `tidy_diagram`, `auto_layout`, `apply_layout_preset` | Explicit layout tools | Move only what is named, locked stay | Deterministic | Model decides when | None |
| `apply_diagram_code` three-way merge (`diagram-code/apply.ts`) | Update a diagram from code without losing canvas edits | Canvas edits win where the code did not change; hand-routed connectors and frame boxes are kept | Yes | Code can pin positions | Not changed |
| Connector re-routing on move | Paths must follow shapes | Manually bent connectors keep their bends; `reroute_connector` can forget them on request | Deterministic | `routing`, `forget_manual_bends` | Owned by the routing work |
| Label fit (`layoutShapeLabel`) at render | Text must stay in its shape | Shrinks the font down to a minimum | Deterministic | Resize the node | A shrunk label made text uneven and was invisible to the agent; `review_layout` reports `label_clipped` and `label_shrunk` |
| Fit-to-view cap (`viewport-math.ts`) | A 3-node diagram should not fill the screen | n/a | Max 100%, min 10% | — | Very large boards fit at tiny zoom; `review_layout` reports `too_small_to_read` with the zoom and text size |

## The inspect-and-refine loop

1. `plan_layout` (optional) → draw with the plan.
2. `review_layout` measures: clipped/shrunk labels, overlaps, connector-through-node/frame, crossing connectors,
   uneven sizes, content outside the view, text below 11px at the zoom that fits everything, missing structure.
   It reads stored geometry and the editor's own text layout; it does **not** see pixels, and says so.
3. The model fixes named ids with targeted edits and reviews again. The executor answers a review on an unchanged
   board from the earlier result, and a run counts at most 3 reviews (`MAX_REVIEWS`); the result then says to stop and
   report what is left.

## Limitations

- Live-model behaviour is unverified; the scenarios use scripted replies.
- Crossing detection treats connectors as polylines; curved connectors are judged by their routed path.
- Readability uses the font size stored on elements, not what a zoomed screenshot would show.
