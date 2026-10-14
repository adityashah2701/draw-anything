# Plan — reliable canvas, authorization, and AI diagram quality

Status: in execution. Evidence below was gathered by reading and running the code in this repository
(2026-10-14). Method notes: the *Compound Engineering* and *Ponytail* plugins are **not installed** in
this environment, so they could not be invoked through the `Skill` tool. Their published instructions were
read (github.com/EveryInc/compound-engineering-plugin, github.com/DietrichGebert/ponytail) and applied by
hand: durable plan → incremental units with owned-file commits → review of the real diff → capture a
learning only when it passes the "would the next engineer repeat this?" test; and, for Ponytail, *read the
real flow first, reuse what exists, add the least code that works, never cut validation / error handling /
security*. No "Reverse Engineering" skill exists in any catalogue reachable from here; the method used is
plain tracing (call paths, state, persistence) plus characterization tests.

## 1. Eraser.io — what is observable (and what is not)

`docs.eraser.io` is unreachable from this sandbox (DNS blocked), so this comes from search-result excerpts
of the public docs/site, not from the full docs. **Confirmed from excerpts:**

- AI diagram from a prompt via the insert menu / `⌘J`; diagram type is auto-chosen, overridable; inputs can
  also be an image, a file (Terraform / DB schema) or a Git repo; an MCP server and a Diagramming API
  (prompt, DSL or image) exist.
- The result is **diagram-as-code**: edit the text and the canvas updates; AI can also *edit an existing
  diagram*; prompt history is kept; templates / rules / custom styles ground generation.
- DSL (flow-chart / architecture docs): `Name [shape, icon, color, label]` nodes with unique names; nested
  groups `Group { … }`; connections `A > B`, `A < B`, fan-out `A > B, C, D`; diagram-level `colorMode`,
  `styleMode`, `typeface`. Types: flow chart, cloud architecture, sequence, ERD, BPMN.

**Not verifiable here:** layout algorithm and direction control, whether canvas drags write back to code,
connector re-routing behaviour, exact connector-label syntax. No claim is made about them.

## 2. Verified findings in this repo (evidence in parentheses)

Security / authorization — all by reading the code; no live service was touched.

| ID | Finding |
|---|---|
| S1 | `POST /api/ai/generate-diagram` (and the duplicate `/api/generate-diagram`) has **no authentication**; `middleware.ts` is bare `clerkMiddleware()` which protects nothing. Anyone can spend the server's LLM keys; `provider`/`model` are client-controlled; no size or rate limits; raw error text (≤300 chars) is returned. |
| S2 | `/api/liveblocks-auth` grants `FULL_ACCESS` to **any room name** to any signed-in user (no ownership / org check), 403 instead of 401, unguarded `request.json()`. |
| S3 | Convex `whiteboard.getById`, `getWithImageUrl`, `getImageUrl` and `users.getById`, `getByClerkId` need **no auth**; `whiteboard.getAll`/`create` trust a client-supplied `orgId` without checking membership (IDOR); `aiFrames.create` lets a caller patch someone else's frame by id; `aiFrames/aiMemory/aiDecisions` list queries have no per-whiteboard access check. |
| S4 | `useWhiteboardAccess` defaults `hasEditAccess = true`, is client-only, and uses a different rule (`org` only) than the server `update` mutation (`creator OR org`). |

Data integrity / interaction:

| ID | Finding |
|---|---|
| D1 | Autosave triggers on `elements.length` changes only — moves, resizes, recolours and text edits never trigger a save; a save skipped because `isSaving` is still marked done (never retried); 10 ms debounce; no flush on page hide; may write an empty/partial board before the initial sync. |
| D2 | Nothing calls `history.pause()/resume()`; every pointer-move write is its own Liveblocks undo step; `saveToHistory` is a no-op → one drag = dozens of undo steps. |
| D3 | Canvas uses mouse events with `onMouseLeave={stopDrawing}`: no pointer capture, no touch/pen drags, drag ends when the cursor leaves the canvas, no Escape-cancel. |
| D4 | Connector created by dragging a handle uses `routeArrowPoints` with no obstacles and no source/target ids; the arrow tool uses the obstacle-aware path. Two code paths, different results. |
| D5 | Build: `next build` type-check fails on `app/api/clerk-webhook/route.ts` (calls `internal` functions through `api`); duplicate of `convex/http.ts`. (build log checked — see execution log) |

AI pipeline — root causes (not "Groq"):

| ID | Finding |
|---|---|
| A1 | **Default provider (Gemini) is sent the schema `{"type":"STRING"}` for every structured call.** The hand-written converter mistakes a Zod‑4 object (`.type === "object"`) for JSON Schema. (Reproduced by stubbing the client.) |
| A2 | Model output is normalised with hard limits that **throw**: >25 nodes, >50 edges, a label >60 chars, `null` for an optional field, or an empty node list each raise an uncaught `ZodError` that ends the whole generation (reproduced). `withRetry` never retries validation errors. |
| A3 | `compileAIDiagramToCanvas` orders each row alphabetically (no crossing reduction), and **drops groups, containers, trust boundaries and edge labels** that the pipeline generates. |
| A4 | `core/layout/*` (≈700 lines) has no importers (dead); the compiler uses its own layout. |
| A5 | `workflow.test.ts › applies a repair pass…` fails because the test is stale: the critic → expansion loop now repairs the first bad graph, so `repair.applied` is never emitted (traced). |
| A6 | There is no way to *edit* an existing generated diagram or to round-trip diagram ↔ text. |

## 3. Units of work (HOW) — in order

Each unit: failing test first, minimal change, run checks, commit only that unit's files.

- **U1 AI route hardening** — require a Clerk session, validate/limit the body, allow-list provider and
  model, per-user rate limit, redact unknown errors. *Files:* `app/api/ai/generate-diagram/route.ts`,
  new `features/ai/server/request-guard.ts` (+ test). *Not done:* a distributed rate limiter (needs
  infrastructure) — in-memory, per-instance, documented.
- **U2 Liveblocks authorization** — authorize the room against Convex (creator or org member), 401/403/503
  semantics, fail closed. *Files:* `app/api/liveblocks-auth/route.ts`, new pure `room-access.ts` (+ test).
  *Deploy order:* Convex first, then the app.
- **U3 Convex access control** — one pure access rule shared by all whiteboard functions; auth on every
  read; ownership on AI-frame writes. *Files:* `convex/lib/access.ts` (+ test), `convex/whiteboard.ts`,
  `convex/users.ts`, `convex/aiFrames.ts`, `convex/aiMemory.ts`. Saved diagrams are untouched (no data
  migration). *Product decision recorded:* non-members lose read access (there is no share-link feature).
- **U4 Client access** — default-deny until org is known, same rule as the server, "no access" state for
  `null`. *Files:* `use-whiteboard-access.ts`, `whiteboard-canvas-stage.tsx`.
- **U5 Autosave** — content-hash change detection, trailing debounce, retry when a save is skipped, flush on
  hide/unmount, never overwrite non-empty content with an empty board before first sync. Pure controller
  with fake-timer tests. *Files:* new `autosave-controller.ts` (+ test), `use-whiteboard-auto-save.ts`.
- **U6 Undo grouping** — one undo step per drag/resize/erase/draw gesture via `history.pause/resume`,
  always resumed (unmount, cancel). *Files:* new `gesture-history.ts` (+ test), drawing hook, controller.
- **U7 AI contract** — real JSON Schema from `z.toJSONSchema`; lenient normaliser (clamp, null→undefined,
  drop extras with a warning, actionable error for empty); one validate-and-re-ask retry. *Files:*
  `model-providers.ts`, `schemas.ts`, `agents/types.ts` (+ tests).
- **U8 Tests repaired** — fix the stale workflow test; add a test where repair is the only recovery path.
- **U9 Compiler quality** — barycentre row ordering (crossing metric before/after), group frames, edge
  labels. *Files:* `canvas-compiler.ts` (+ test).
- **U10 Diagram-as-code** — Eraser-style DSL parser/serialiser, canvas → code, code → canvas, with parse
  errors reported by line. *Files:* new `features/diagram-code/*` (+ tests); minimal UI entry in the AI
  modal. LLM edit flow = send current code + instruction, validate with the parser, one repair retry.
- **U11 Canvas reliability** — pointer events with capture and cancel, Escape cancel, connector-drop uses
  the obstacle-aware route, selection toggle with Shift/Ctrl, prune stale selection ids.
- **U12 Cleanup** — remove verified dead code (legacy webhook route; `core/layout` if still unreferenced),
  update `claude.md` and the audit.

## 4. Approvals and limits

- **Live AI calls:** none were made and none will be without explicit approval. All AI behaviour is tested
  with deterministic fake models. Provider-side constrained decoding (`responseJsonSchema`) is *not*
  enabled because it cannot be verified without a live call.
- **Convex deployment / Clerk JWT template:** code changes are written and typechecked, but only the user
  can run `npx convex deploy`; the Liveblocks route assumes the Clerk JWT template named `convex`.
- **No destructive migration** is performed; `whiteboards.content` is read and written in the same shape.
- **Browser behaviour** (pointer capture, dragging, text editing) cannot be exercised here — there are no
  service credentials to load the board route. Those changes are typechecked, linted and logic-tested only,
  and are reported as *unverified in a browser*.
