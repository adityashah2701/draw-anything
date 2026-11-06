# Session handoff and AI agent refactor plan

Date: 2026-11-07 (end of a long session). Use this file as the context for the next chat: read it first, then
`claude.md` and `docs/plans/2026-11-05-1345-feat-production-diagram-agent-plan.md`.

**Working agreements (keep them):** the user has limited tokens, so keep answers short and avoid test cycles unless
asked. Do not commit or push unless asked (the user commits). Type check with `npx tsc --noEmit` and lint with
`npm run lint`. The dev server must be restarted and the page hard refreshed after changes.

---

## 1. State of the repository

- Everything below is **uncommitted** in the working tree on `main`.
- `npx tsc --noEmit` and `npm run lint` were clean at the last check.
- Last unit runs that passed: `features/ai`, `features/diagram-code`, `core/layout`, `core/shapes`,
  `features/ai/server` (about 900 tests across them). The full `npx vitest run` and `npm run test:browser` were **not**
  run after the structured-shape work.
- Last Chrome run (earlier in the session): 2 failures, both unrelated to this stretch at the time:
  `frames.browser.test.ts` (clearing the frame title) and `outline.browser.test.ts` ("draws every variant from the
  picker"). The outline one was never investigated and may be related to picker changes; check it first.

---

## 2. What is completed

### 2.1 Earlier phases (verified earlier, see the plan doc)
- Phase A (U1-U4): profiles per diagram type, direction header, rounded corners, ports.
- U5: shape vocabulary, outline variants, parametric shapes (borders, markers, stacks), the shape picker.
- U10: connector relations (ER cardinality in crow's foot and Chen, UML relation kinds, sequence message types, BPMN
  flows), structured data on the arrow, canvas/SVG/PNG/PDF verified.
- Phase C0-C5: pluggable layout engines (freeform, architecture with layered/dependency/grouped, mind-map, ER, UML,
  BPMN, sequence), `LayoutRecord`, placement stamps (`auto|user`), Layout panel, `layout_diagram` AI tool.
- UI fixes: Shapes flyout, shape popover, default colours, premium frame styling, frame title tab, frame opacity.

### 2.2 This stretch: structured shapes (U11-U17)

| Shape | Element type | DSL | Key files |
|---|---|---|---|
| Entity table (ER) | `entity-table` | `shape: entity`, `rows: "id int pk; team_id int fk -> teams.id; note text nullable"`, `variant: weak\|associative\|junction` | `core/shapes/entity-table/{layout,definition,rows}.ts` |
| UML classifier | `uml-classifier` | `shape: class\|interface\|enum`, `attributes`, `operations`, `stereotype`, `template`, `variant` | `core/shapes/uml-classifier/{layout,members,definition}.ts` |
| Mind-map topic | `mindmap-node` | `shape: topic` | `core/shapes/mindmap-node/definition.ts`, `core/mindmap/tree-api.ts` |
| Lifeline (sequence) | `lifeline` | `shape: lifeline` | `core/shapes/lifeline/definition.ts` |
| BPMN parametric | outline bases `ring/rhombus/box` | `position`, `trigger`, `gateway`, `task`, `throwing` | `features/diagram-code/language/bpmn.ts` |

- All four are registered through `core/shapes/structured/box-definition.ts` and `core/shapes/register-shapes.ts`.
- Vocabulary entries flipped from `planned` to `supported`; pickable with starter content and schematic previews
  (`features/whiteboard/utils/shape-picker.ts`, `shape-preview.ts`). The conformance and picker tests were edited to
  match (not run in full).
- Language plumbing: content travels in the `IRNode.data` property bag (`language/structured.ts`,
  `language/ir.ts`, `diagram-code/types.ts`, `parse.ts`, `serialize.ts`, `canvas.ts`, `pins.ts`, `ai/types.ts`,
  `ai/schemas.ts`). Compiler support in `features/ai/server/canvas-compiler.ts` (`STRUCTURED_TYPES`,
  `structuredSize`, `structuredElement`).
- 15 new architecture kinds and icons (U16); 10 frame presets plus fragment operators and lane helpers (U15, partial).
- Edit experience:
  - **On-canvas editor** `features/whiteboard/components/overlays/structured-editor.tsx`: opens on insert from the
    picker, on double-click or on Enter. Entity table: name, one line per field with PK/FK/NULL toggles, add and
    remove. Class: name plus attribute and operation lists. Topic and lifeline: name. Written once on close (one
    undo step). A focus-stealing bug (re-selecting the name on every render) was fixed.
  - Inspector section (text fields) for the same shapes: `features/whiteboard/utils/structured-edit.ts` (pure
    planner) wired in `use-whiteboard-page-controller.ts` and `selection-inspector.tsx`.
- ER rendering checked in a real screenshot; fix: the key column widens so `PK,FK` no longer overlaps names
  (`core/shapes/entity-table/layout.ts`).
- Sequence rendering checked in a real screenshot; fixes in `canvas-compiler.ts` and the lifeline definition:
  per-lifeline slot of 150px (or the head width), bigger heads (48px high, 16px text, at least 130px wide), body
  height grows with the message count (`MESSAGE_STEP = 56`), messages are straight horizontal arrows from the facing
  side of each body, sequence engine default gap 40.
- "Load canvas" (canvas to code) fixes in `features/diagram-code/canvas.ts`: titles are read from `name` (no more
  "Shape 1"), lifelines get no `x/y/w/h` (a 16px body is out of the 24 to 4000 range).

### 2.3 This stretch: builder v2 (U7-U9) and agent teaching
- `builder/prompt.ts`: the model is asked for a one-line BRIEF (diagram type, reader, 4-8 main parts in reading order,
  groups) before the first `add`; a "big systems" rule (overview first, at most about 24 parts per picture).
- `builder/state.ts`: `adjust` gained `swap A with B` and `straighten A > B`.
- `builder/report.ts` (critic v2) now also flags: isolated nodes, unlabelled decision branches, edges running against
  the reading direction (a dashed edge counts as feedback), and diagrams over `MAX_NODES_PER_VIEW` (24).
- `builder/views.ts`: `planViews(parsed)` splits a grouped diagram into an overview (each top-level group one box) and
  one focus view per group, as diagram code. **It is not called by anything yet.**
- `features/ai/diagram-agent/profiles/index.ts`: the ER, class, sequence and mind-map playbooks now name the new shapes
  and relations (`shape: entity` with rows and cardinality, `shape: lifeline` with `relation: sync|async|return|
  create|destroy`, `shape: class` with members and the UML relation kinds, `shape: topic`).
- `prompt/prompt-context.test.ts` budgets were raised on purpose to 2500 / 2050 / 1300 tokens for the longer
  playbooks.

---

## 2.4 Done after the handoff was written (2026-11-07, second session)

- **Why the agent drew icons for "ER diagram":** the phrase matched no diagram type, so the model got the
  architecture "icons first" rule. `inferDiagramType` now also reads "ER diagram/model", "schema design",
  "low-level design"/"LLD" (class) and "high-level design"/"HLD"/"system design" (architecture).
  `STRUCTURED_DIAGRAM_TYPES` (`prompt/prompt-context.ts`) switches the agent and builder prompts to "draw every node
  as its table/class/lifeline/topic"; the language block shows `shape: entity` and `relation:`; worked examples
  `Library ER diagram`, `Login sequence`, `Payment classes` (appended to `EXAMPLES`; the legacy corpus keeps only the
  first three). Prompt budgets raised to 3200 / 2300 / 1500 tokens and 14,500 characters.
- **ER quality:** rows written with commas or newlines now parse (`entity-table/rows.ts`); structured shapes never
  take a kind's colour; table columns have a 15% margin for the viewer's real font; the ER engine places the "one"
  side above the "many" side whichever way a relation was written (`parentsFirst`, `core/layout/engines/er`).
- **Builder speed for structured families:** one `add` of up to 48 statements, `finish` in the same reply, no polish
  rounds (`maxReviews` 0), at most 4 steps (`BuilderInput.structured`).
- **R8 (first part) live preview:** the diagram is drawn on the board while it is generated
  (`generate-client.ts: onElements` -> `use-canvas-agent.ts` -> `ui-state.generationPreview`, drawn by
  `use-canvas-engine.ts`, placed by `editor/generation-preview.ts: placePreview` where `generate_diagram` will put it).
  The preview is never stored; the final patch still lands as one undo step. The builder streams per step, the
  one-shot agent only at the end. Not checked in a browser.
- **Issue 1 fixed:** two connections between the same pair are kept when their labels differ
  (`features/ai/server/validation.ts`), so the destroy message is drawn.
- **R4 (first part) family critic:** `tools/lint.ts: familyRules`: `er-no-primary-key`, `er-missing-cardinality`,
  `er-many-to-many`, `er-fk-without-relation`, `sequence-no-return`, `flow-one-start`, `flow-dead-end`, plus
  `family-shapes`. `generic-icons` is off for structured families and `label-heavy` off for sequences. The builder
  report shows `family-shapes`, `er-*` and `sequence-*` (not the flow rules, so a plain chain still finishes).
  Tests: `tools/lint.test.ts`.
- **ER and class connectors (R6, part):** entity tables and classes spread every connector end over the side
  (`canvas-compiler.ts: spreadPorts`, `TABLE_TYPES`) and are left out of the shared-bus merge (`bundleFans`), so
  each crow's foot or diamond has its own line. Checked by rendering PNGs of the library ER, a mixed-direction ER,
  the class and the sequence examples with `builder/render-png.ts` (no browser): one crossing left in the 7-table
  case. A quick way to look at compiler output is a throwaway vitest that calls `elementsFromDiagramCode(code,
  { familyEngine: true })` and `renderCanvasPng`.
- **Stray "PK book_id" text boxes (fixed):** after `generate_diagram` the canvas agent read the tables back with
  `get_element_details`, saw no rows (the inspect summary showed only `label`), and labelled the keys itself with
  `create_text`. `summarize` (`canvas-tools/tools/helpers.ts`) now gives a table its name and `content` (rows) and a
  class its members; the canvas agent prompt forbids text annotations for keys, columns and members.
- **SQL-style rows:** `primary key (a, b)`, `foreign key (x) references t(y)`, inline `primary key`, `unique`,
  `not null`, `references t(c)` are read as keys, not as columns (`entity-table/rows.ts`, `rows.test.ts`).
- **Foreign keys decide ER placement:** the compiler marks a connection's parent from the tables' foreign keys
  (`foreignKeyParent`, `LayoutEdge.parent`); the lint rule `er-cardinality-against-key` reports a cardinality written
  the wrong way round.
- **No icon work for structured families:** no icon hints in the builder prompt and an explicit "do not call
  search_icons"; the `add` tool text mentions the 48-statement allowance.
- **Live preview polish:** the empty-board card hides while a preview is drawn; the activity line shows the elapsed
  seconds (a 1 s heartbeat in `use-canvas-agent.ts`).
- **Mind maps:** topics are sized by their role (the centre was sized as a sub-topic and its label spilled out);
  branches are plain lines in their branch colour, straight from the side that faces the child, and are not merged
  into buses. Worked example `Product launch mind map`. Checked as a rendered PNG.
- **System design (R1/R3, prompt part):** `isSystemDesign` (`prompt/prompt-context.ts`) recognises "design WhatsApp",
  "how would you build Uber", "scalable ...", "system design of ..." (not flows, schemas, sequences); such requests
  are architecture and get `prompt/system-design.ts: SYSTEM_DESIGN_GUIDE` (requirements first, one component per
  responsibility, layers Clients/Edge/Services/Async/Data/External, one store per kind of data, 15-24 nodes in 4-6
  groups) and the worked example `Chat app system design (like WhatsApp)` (22 nodes, 5 groups, rendered and checked:
  0 lint findings, 3 crossings). The agent writes a 2-6 line plan (groups and components) before its first code.
  **The builder now also gets the type's playbook, the guide and one worked example** (before this it had neither,
  so it drew every type like a small architecture). Lint: `hld-no-entry`, `hld-idle-service` (also in the builder
  report). The canvas agent passes system-design requests on in the person's words. No extra model call was added;
  not run against a real model.
- **Icons, not boxes, for architecture (user preference):** new architecture and network diagrams are drawn as
  captioned icons (`shape: icon`) in both pipelines (`builder/state.ts: prefersBareIcons`, `bareIconNodes`; the
  one-shot path converts in `run.ts`). "plain boxes" in the request and edits of an existing diagram keep boxes.
  The chat-system example is now left to right (`direction right`) with captioned icons and domain groups (Clients,
  Edge, Messaging, Media, Realtime), modelled on an Eraser-style reference: rendered, 0 crossings, 0 overlaps, all
  groups drawn. The guide says: domain groups after the edge, one plural node for a scaled tier, `direction right`.
  A horizontally scaled tier cannot be drawn stacked as an icon (`stack` only works on boxes).
- **Layout panel kept left-to-right diagrams sideways (fixed):** the architecture engine now reads the diagram's
  direction (`LayoutGraph.direction` from `ai.diagramDirection`), so re-laying out does not turn it.
- **Groups and connection labels were thrown away on the board (fixed):** `generate_diagram` dropped every
  `isGuide` element, which is how the compiler draws group frames, their headings and connection labels, so an AI
  diagram arrived with no groups and no labels (seen on "Design Facebook"). Now `tools/promote-groups.ts:
  promoteGroupFrames` turns each group rectangle into a first-class frame (heading as title, nested groups nested,
  members adopted, frame stored below its members) and connection labels are kept. The live preview shows them too.
  The canvas agent no longer adds its own frames when the result already has some. Test: `promote-groups.test.ts`;
  checked as a rendered PNG.
- **System designs read left to right by default** in both pipelines when the code names no direction
  (`withDefaultDirection`, `BuilderInput.direction`, `run.ts`).
- **Long generations no longer die or vanish (2026-11-07, "Design WhatsApp" on Nemotron: 5 minutes, then nothing):**
  the route sends an SSE `: keep-alive` comment every 15 s (`generate-diagram-handler.ts`), so the client's 2-minute
  idle limit only fires when the server is really gone; time spent in `generate_diagram` counts as progress for the
  canvas agent's 5-minute no-change limit (`run-agent.ts`); and when a time limit or an error ends a generation that
  already drew something, `generateElements` returns what was drawn with a warning instead of throwing it away (a
  person's Stop still aborts). Open: a slow model can still spend minutes before its first `add` (the system-design
  prompt is larger); `NVIDIA_MODEL` set to the Nano model is about 3x faster.
- **The agent no longer "improves" a generated diagram into a worse one:** three post-draw passes moved nodes by
  hand or by a simple tidy over the compiler's layout. (1) The canvas agent's automatic `tidy_diagram`
  (`run-agent.ts: straightenWhatWasMade`) is skipped when the run used `generate_diagram`. (2) Its final check sends
  back only truly broken parts after a generation (`BROKEN`: dangling, stale, invalid geometry, duplicate id, bad
  anchor), not overlaps or connectors through nodes. (3) The builder refuses `finish` only for real faults
  (`CanvasReport.blocking`: overlapping nodes, a connector through a node, family rules); crossings, shared, long or
  bendy lines stay in the report as advice. Fewer model calls per run as a result. Builder tests rewritten for the rule.
- **Stop keeps the preview:** a person's Stop now also keeps what was drawn (`generate-client.ts`).
- **Mistral Large 4** (`mistralai/mistral-large-4-1t-a52b`) is in `NVIDIA_MODELS` (vision on, thinking only when
  `NVIDIA_ENABLE_THINKING` is set); smoke test passed on 2026-11-07.
- **Tests:** the full `npx vitest run` passes except a timing-sensitive baseline test that passes alone. Fixed: picker
  categories for UML, Sequence and Mind map, lifeline centring on insert, architecture idempotence test limited to
  non-structured examples.

## 3. Known issues and gaps (not fixed)

1. **(Fixed, see 2.4)** **Destroy message vanishes.** In the checkout sequence example the 13th message
   (`Order Service > Payment Provider: Cancel hold [relation: destroy]`) is not drawn. The parser reports 13 edges, the
   canvas holds 12. Probably two edges between the same pair are merged in the compiler or the edge id. Unchecked.
2. **(Improved, see 2.4)** **ER connector routing is messy on big diagrams** (long detours, shared lines, lines through the layout). It is the
   ER engine's placement and routing (`core/layout/engines/er`) plus the router. The Layout panel's Compact and
   Hierarchical algorithms may look better.
3. **No self-connections** (`A > A` is ignored with a warning). Self-references (category parent, recursion message)
   are not drawable.
4. **`planViews` is not wired.** Nothing draws the overview plus focus views into frames.
5. **Mind-map tree API** (`core/mindmap/tree-api.ts`) has no Tab/Enter shortcuts and no AI tool.
6. **Editor gaps:** connectors attach to the whole table, not to a row (no row-level anchors); the FK target
   (`-> table.col`) cannot be edited in the card (an existing value is kept); lifeline activation bars cannot be made
   from code or UI.
7. **BPMN** (events, gateways, tasks, pools) is supported in code but not taught to the agent; containers and
   boundaries (U15) are only partly done.
8. **Docs:** `docs/diagram-code/README.md` does not list the new properties or shapes (some lines still say there are
   no lifelines or class compartments); the plan's status for U11-U17 and U7-U9 was not updated. A docs test requires
   formatting and outline coverage.
9. **Full test run pending** (see section 1).
10. **(Partly fixed, see 2.4: live preview)** **No live progress: the agent works for minutes, the canvas stays empty, then one final result appears.** Seen
    on the library ER prompt with NVIDIA Nemotron (slow: about 14 tokens/s): the panel shows "Thinking..." and
    "Undid an adjustment" while the board still says "Nothing here yet". Likely causes, to verify:
    - `generate_diagram` collects the pipeline's `element.batch` / `element.update` / `element.remove` events in
      `features/canvas-tools/editor/generate-client.ts` and places the **final element set as one patch at the end**,
      so the builder's step-by-step drawing never reaches the board while it runs.
    - Slow reasoning models spend minutes per step, and the panel shows only raw thinking text, not what was drawn.
    - The adjust guard silently undoes steps ("Undid an adjustment"), which looks like no progress.
    The experience goal is that something visible happens every few seconds (see phase R8 in section 4.2).

---

## 4. The agent has NOT been refactored: what is missing

What was done to the agent is cosmetic: more words in four playbooks, one extra prompt rule, three critic checks and
two `adjust` verbs. The agent itself still works like this:

- The default pipeline (`features/ai/diagram-agent/pipeline.ts`, `agent-loop.ts`) is one loop: the model writes
  diagram code, calls `check_diagram`, and finishes. The builder (`AI_PIPELINE=builder`) draws step by step. Neither
  decides **what kind of diagram the person needs** before drawing.
- The diagram type is a regex guess on the request (`prompt/prompt-context.ts`). There is no notion of level
  (HLD or LLD), audience, scope, or "this needs several diagrams".
- There is no "when to use what" knowledge: which shape or notation fits which job (a queue, a gateway, an entity
  table, a lifeline, a swimlane, a frame) is only implied by prompts.
- The critic is geometry-first. It does not know the rules of each diagram family (an ER table without a key, a
  sync message with no return, a flowchart with two starts).
- Complexity is handled only by a warning at 24 nodes. Large systems are still one flat picture.
- Quality is **measured offline only for the old families**; nothing measures ER, sequence, class or mind-map output
  from a real model.
- Nobody has run the new playbooks against a real model.

### 4.1 Goal

An agent that, from a plain request, produces **clear, uncluttered, production-grade** diagrams: high-level design
(HLD) and low-level design (LLD) views, flowcharts, ER diagrams, sequence and class diagrams. It should know when to
use each shape and notation, split what is too big into linked views, check its own work against the rules of the
diagram family, and repair what is wrong, within a small, predictable number of model calls.

### 4.2 Proposed design (phased; each phase ends in a measurable result)

**Phase R1: Intent and brief (plan before drawing).**
- Add a first, cheap step that outputs a structured **brief** (JSON, validated with zod; never free text):
  `kind` (architecture, flowchart, er, sequence, class, state, mind-map, network, bpmn), `level` (`hld` or `lld`),
  `audience`, `scope` (one sentence), `views` (list of the diagrams to draw; HLD overview plus focus views, or one per
  use case), `entities` (names with a role: service, store, actor, step, decision, table, class), `groups`, `flows`
  (ordered), and `notation` choices per view.
- The brief replaces the regex in `prompt-context.ts` and selects the playbook, the shapes and the layout profile.
- The brief is shown in the panel as the agent's plan, and a person can correct it (one click) before drawing.
- Acceptance: for a fixed set of 30 requests, the chosen `kind` and `level` agree with a human label at least 90% of
  the time.

**Phase R2: "When to use what" tables as data.**
- One table, `features/ai/diagram-agent/notation/guide.ts`, generated from the shape vocabulary and the relation
  table: for each family, which shapes and relations are allowed, the default choice, and a one-line rule
  ("use `shape: icon` for components, a box for steps, `shape: entity` for tables, a diamond only for yes/no").
- The prompt gets only the rows for the chosen family; the linter uses the same rows to flag a wrong choice
  (a decision drawn as a box, a table drawn as a plain node in an ER diagram).
- Acceptance: a conformance test fails when a vocabulary entry is added without a guide row.

**Phase R3: Family drafting contracts (HLD, LLD, flowchart, ER).**
- **HLD:** context and container views: 6 to 15 nodes per view, groups for tiers or domains, entry points on the
  left or top, protocol on the connection only where it adds information, data stores as `shape: icon` or cylinders,
  external systems visually distinct. A large system becomes an overview plus one focus view per group (R5).
- **LLD:** classes (attributes, operations, visibility, relation kinds with multiplicity), sequence per use case (one
  diagram per flow, every sync message returns, failure path shown), state machines, ER with real columns and keys.
- **Flowchart:** exactly one start, one or more ends, every decision labelled on every branch, happy path straight,
  loops go back with a short label, no dead ends.
- **ER:** one table per entity with a primary key, foreign keys as `fk -> table.col`, junction tables for many to
  many, cardinality on both ends, no orphan table.
- Each contract is a small object (rules plus a worked example that the tests parse and lay out), not a long prompt.

**Phase R4: Critic v3 by family (the check that makes it "not messy").**
- Extend `builder/report.ts` and `tools/lint.ts` with family rules, each returning a precise, repairable message:
  - ER: table without pk, fk without a relation, relation without cardinality, many to many without a junction.
  - Sequence: sync message without a return, lifeline never used, message order not matching the brief.
  - Class: inheritance arrow direction, abstract class with no children, association without multiplicity.
  - Flowchart: more than one start, decision with unlabelled branch, unreachable node, dead end.
  - HLD: unlabelled protocol on a cross-tier link, more than N nodes in a view, mixed abstraction levels.
- Intent-level repair verbs next to `swap` and `straighten`: `group A, B as Name`, `split Group into view`,
  `merge A with B`, `reorder lifelines`, `label A > B`. The loop already undoes a repair that made things worse.
- Acceptance: the critic reports zero errors on the golden outputs and the expected rule on a deliberately broken one.

**Phase R5: Complexity management (wire `planViews`).**
- When the brief says `views > 1` or a view exceeds the node budget, draw the overview first, then each focus view
  into its own frame (`core/frames/frame-api.ts`) placed next to it, with a link note from group to frame. Each view
  stays within its node budget (24 is the hard limit, 12 to 15 is the target).
- Wire `builder/views.ts: planViews` into `generate_diagram` and `features/canvas-tools/editor/generate-client.ts`;
  emit one `element.batch` per view so the canvas still builds live.
- Acceptance: a 40-service request produces an overview plus focus views, no view over 24 nodes, no flat picture.

**Phase R6: Layout and routing quality for the new families.**
- Fix the missing destroy message (issue 1); allow self-connections as a loop (issue 3).
- ER: better table placement (cluster by relationship, keep a parent above its children) and port-aware routing so
  connectors stop sharing lines; optional per-row anchors for FK lines.
- Sequence: activation bars from synchronous call and return pairs; fragments (`alt`, `loop`) as frames with operators
  (already supported by frames).
- Acceptance: the shipped ER and sequence golden diagrams have zero shared lines and zero label collisions in
  `layout/metrics.ts`.

**Phase R7: Evaluation and production readiness.**
- Golden set per family (at least 5 each: HLD, LLD class, sequence, flowchart, ER, mind-map) with the rubric in
  `eval/rubric.ts`; a live runner `AI_EVAL=1 npm run eval:ai` and a saved baseline report under
  `docs/superpowers/reports/`. Score: parse errors, critic problems, node budget, crossings, label collisions,
  family-rule violations, number of model calls.
- Production: strict validation of every model output, one automatic repair pass, a call and time budget per run
  (already `AI_BUILDER_MAX_TURNS`, `AI_BUILDER_MAX_MS`), quota handling (already in `retry.ts`), and counts-only
  logging.
- Acceptance: a committed baseline report, and CI that runs the offline golden checks.

**Phase R8: Live progress (the agent must never look frozen).**
- **Draw while it works:** apply each step's elements to the board as soon as the step finishes, as a preview that
  is part of one undo step (use the existing gesture pause in `interaction/gesture-history.ts` or a draft layer),
  so the canvas fills in node by node. On cancel or failure, remove the preview or keep what was drawn, as the person
  chooses. `revealChunks` in `run-builder.ts` already paces the reveal; the missing part is applying it on the board
  (`generate-client.ts` and the `generate_diagram` tool).
- **Show a plan and a timeline in the panel:** the brief (R1) first, then one line per step ("Added 4 tables",
  "Connected 5 relations", "Fixed 2 crossings", "Reverted a bad adjustment and why") with counts, not raw model
  thinking. Collapse the thinking by default.
- **Heartbeat and budget:** show elapsed time, step n of N and the time left; if a step takes more than about 20 s
  show that the model is still working and offer Stop with "keep what is drawn".
- **Fast first draw:** for a model slower than a set speed, skip polish rounds and finish on the first clean draft;
  stream the first `add` as soon as it parses.
- **Honest failure:** if nothing could be drawn, say why (quota, timeout, unreadable output) instead of a silent end.
- Acceptance: with a slow model the first shapes appear on the canvas within the first step, the panel shows a step
  line at least every 15 s, and Stop keeps a usable partial diagram.

### 4.3 Suggested order for the next chat
1. Verify the current state: run `npx vitest run` and `npm run test:browser`, fix the two Chrome failures.
2. Run the test prompts (section 5) against a real provider and record what comes out, good and bad. This shows which
   phases matter most.
3. R1 and R2 (brief plus notation guide): small, and they change every result.
4. R4 (family critic) and R5 (wire `planViews`).
5. R6 fixes (destroy message, self-connection, ER routing), then R7 evaluation.
6. Update `claude.md`, the README for the diagram language, and this plan's status.

---

## 5. Test prompts (paste in the AI panel)

- **ER:** "Draw an ER diagram for a library system: books, authors, members, loans, reservations, and branches. A book
  can have many authors and each author many books, so use a junction table. Members borrow books through loans. Show
  primary keys, foreign keys and cardinalities."
- **Sequence:** "Draw a sequence diagram for user login with OAuth: User, Browser, App Server, Auth Provider, and
  Database. Include the redirect, the authorization code exchange, token validation, creating the session, and a
  failure path where the provider returns an error."
- **Class:** "Draw a UML class diagram for a payment system: an abstract PaymentMethod, with CreditCard and
  BankTransfer extending it, a Payable interface that Order implements, an Order that owns many OrderItems
  (composition), and a Customer who places many Orders. Show attributes and operations."
- **Mind map:** "Make a mind map about launching a mobile app: marketing, development, design, legal, and operations,
  each with 3 sub-topics."
- **HLD (not yet tried):** "High-level design of a ride-sharing backend: clients, API gateway, auth, matching,
  pricing, payments, notifications, a message queue and the data stores."
- **Flowchart (not yet tried):** "Flowchart for order fulfilment including payment failure, out-of-stock and
  return handling."

Hand-written test code (both parse with no issues): the 10-table online store ER diagram and the 7-lifeline checkout
sequence diagram (13 messages) from this session; see the chat or re-create from section 2.2.

What to check: tables (not plain boxes) in ER, lifelines with horizontal messages, class compartments, branch colours
in the mind map. If the model draws plain boxes, add a worked example to `prompt/examples.ts` and teach the BPMN
shapes the same way.

---

## 6. Environment and setup notes
- No schema or data migration. All new element fields are optional; old boards render unchanged.
- Convex: no change in this stretch. Env vars: nothing new. `AI_PIPELINE=builder` enables the step-by-step builder;
  `NEXT_PUBLIC_LAYOUT_ENGINES` / `AI_LAYOUT_ENGINES` (`new|legacy`) controls the layout engines.
- Useful commands: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run test:browser` (needs `CHROME_PATH`),
  `AI_EVAL=1 npm run eval:ai` (live provider calls; set keys in `.env.local`).
