# AI canvas tools: what was run, and what is not covered

Date: 2026-10-19. Design and capability matrix: `docs/superpowers/specs/2026-10-19-canvas-ai-tools-design.md`.

## Results (run in this change, on the final code)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | `No ESLint warnings or errors` |
| `npx vitest run` | 140 files, **2026 tests passed**, 0 failed (1748 before the tools and their tests; 278 of the new ones are in 15 files, listed below) |
| `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx vitest run --config vitest.browser.config.ts` | 28 files: 27 passed, 1 skipped; **356 tests passed**, 11 skipped (the pre-existing font-mode cases in `label-alignment.browser.test.ts`), 0 failed. 337 passed before this work, so 19 are new |
| the two new browser files, re-run after the last editor change (view fit) | 19 passed |
| `next build` | compiles, lints and type-checks; with `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` set to dummy values it completes and lists `ƒ /api/ai/canvas-agent`. Without a Convex URL it stops while prerendering `/_not-found` ("No address provided to ConvexReactClient"), as any build of this app does without its environment |

Without `CHROME_PATH` the browser suites skip silently and exit 0; the numbers above are with Chromium found.

## What the new tests cover

Unit (`vitest`, Node, in-memory board; the tools, executor and commands are the real ones):

| File | Tests | Covers |
|---|---|---|
| `features/canvas-tools/executor.test.ts` | 18 | allowlist, group gate, strict arguments, read-only board, missing host capability, one undo step, idempotent replay by call id, `expected_revision` and the strict-revision guard after a foreign edit, a patch that would break the board is refused whole, a read tool cannot write, an exception becomes a structured failure without leaking, a failed write skips the rest of its turn, destructive steps fail closed (no host, declined, approved), logs carry no arguments, `enable_tools` really enables |
| `features/canvas-tools/registry.test.ts` | 14 | every required tool is registered (by category), no image tool, unique well-formed names and descriptions, groups, every tool's arguments are strict, provider JSON Schemas are objects with `additionalProperties: false`, destructive tools demand `confirm: true`, schema size budget, only enabled groups are offered |
| `tools/inspect.test.ts` | 15 | state summary and truncation, element details, `find_elements` filters (text, type, icon, lock, hidden, group, connection, area), selection tools and `@selection`, icon search, `validate_diagram`, serialisation, fit |
| `tools/create.test.ts` | 30 | each shape type, style, rejected combinations, id conflicts, placement beside existing content, multi-line text, icons (unknown name lists the closest), semantic nodes (fit to label, kind, nodeStyle limits), groups (nested, locked), frames, duplicates (connectors and labels relinked), diagram import (adds only, errors quoted by line) |
| `tools/edit.test.ts` | 41 | style (partial update, unsupported per element, locked, no-op), text (multi-line, labels vs text, connector labels redirected), icon replace/hide/restore, semantic node edits and resets, move (relative/absolute/groups/connectors), resize (ratio, groups, size reached), rotate, lock, hide/show, reorder, delete (connectors and labels cascade, groups pruned, bulk confirmation, stale guard, undo) |
| `tools/connectors.test.ts` | 22 | anchors and facing sides, routing around a shape, labels, same-pair idempotency, errors, batch all-or-nothing, update/re-attach, label set/change/remove and following the connector, reroute, disconnect (remove/detach, never the endpoints), delete |
| `tools/arrange.test.ts` | 19 | align (6 modes, groups, locked), distribute, exact spacing, auto layout (layered/row/column/grid/circle; ids, labels, sizes, connections unchanged; stale guard; one undo), tidy, presets |
| `tools/organize.test.ts` | 6 | group, nest, ungroup one level, rename, errors |
| `tools/document.test.ts` | 21 | undo/redo (affected ids from the board diff), clear (confirmation, stale, fail closed), export, save (failure reported), load merge/replace (authorisation, fresh ids, no stale keys, invalid documents rejected whole), validate and repair (only the codes named), a pre-`nodeStyle` saved board, serialise and re-import round trip |
| `features/whiteboard/commands/commands.test.ts` | 23 | the editor commands the tools share: spacing, align/distribute with locks, style (strict vs toolbar), connectors (create, labels, update, reroute, detach), hide/show and derived hidden connectors, frame, auto layout and tidy, delete with labels, copy with labels |
| `agent/handler.test.ts` | 21 | the endpoint: 401, rate limit, board access (fails closed), rejects unknown fields, a `system` message, bad ids, oversized requests, unknown providers; the server writes the system prompt; only enabled groups' tools; call checking (`enable_tools` earlier in the same reply); a provider failure leaks no key, URL or detail; logs carry names only |
| `agent/transport.test.ts` | 7 | text protocol parsing (tolerant, never throws), native `bindTools` shape and id pairing, fallback only for "tools not supported" |
| `agent/support.test.ts` | 18 | group suggestions from the request, result truncation, prompt rules and signatures, turn client error messages |
| `agent/scenarios.test.ts` | 18 | natural-language requests through the **real handler, client loop, executor, tools and commands** with only the model scripted: backend architecture with three services and PostgreSQL; group three selected nodes keeping arrows; change the database icon and equalise sizes; align cards vertically with equal spacing; delete the selected node preserving the others; clean up a diagram without changing its meaning (serialisations equal before and after); change auth-flow labels and re-route; plus partial failure (locked), skipped rest of a reply, a model obeying hostile board text still cannot clear without approval, stall and step limits, provider id reuse, a collaborator's edit between turns, tool/group refusal and recovery, server error, stop, undo |
| `editor/editor-host.test.ts` | 5 | the host over the editor's handles: undo detection, loading another board (no access, sanitising), confirmation, read-only, backend errors never reach the model |

Browser (real Chrome, the real editor page with in-memory Liveblocks/Convex; the real HTTP handler answers the page's requests with a scripted model): `tests/browser/editor/canvas-agent.browser.test.ts` (10 tests) adds a node and a connector and checks the steps in the panel, the stored board, one undo step per change, the pixels on the canvas and the autosave; "Undo this run" and its refusal after a human edit; acting on the selection; the confirmation bar (Decline leaves the board, Approve clears it, Undo restores it); a locked node shown as a failed step; a server failure with a leaking message shows plain text; Stop between turns; opacity and hide (canvas alpha, hidden chip); loading another board, saving, fitting and exporting an SVG. `tests/browser/editor/editor-capabilities.browser.test.ts` (9 tests) drives the human side of what the tools needed: the Opacity field (canvas alpha, saved board), the corner radius field, the Horizontal gap field, the connector label field (add, clear, follows the connector), Hide with button, chip and shortcut, the command menu's Frame selection, Tidy up and Auto layout, and one undo step.

## Found and fixed on the way

- Deleting a shape left the labels of its connectors behind; `commands/remove.ts` now removes them (the Delete key, eraser, cut and the tool all use it).
- Copying a connector lost the link to its label (and a hand-made connector's label was not copied at all); `collectCopySet` and `cloneElements` now relink it.
- The 2-item minimum on `ids` made `["@selection"]` unusable for align/group; the minimum is checked after expansion.
- A tool result's `affected` ids came from the planned patch, so undo/redo/load reported nothing; they now come from a before/after diff of the board, and a host that ignores a patch is an error.
- Resizing stored `89.99999999999999` for `90`, and a resize to the same size wrote a no-op history entry; patches are rounded to 1e-6 and no-op updates dropped.
- A brand icon (`logo-postgresql`) resolved to the generic database icon until the on-demand library loaded; the executor now loads it before any tool runs.
- `planCreateConnector` measured before it checked connectability, so text reported "no size" instead of "cannot be connected".
- A failing backend read when loading another board surfaced as a generic failure; it is now one fixed sentence for "missing" and "not yours".

## Not covered (be aware)

- **No live model.** The scenarios script the model, so they prove the pipeline, the guards and the commands, not that a real model chooses these calls. Nothing here measures planning quality on Gemini, Groq or any provider; `npm run eval:ai` does not cover these tools.
- No test against real Liveblocks (two clients, conflicts), real Convex or Clerk; the board access check is a stub in the tests (`decideRoomAccess` is the same function the realtime auth uses and has its own tests). The new route handler was only built, not called, through Next.
- The browser harness cannot open a read-only board (React error #185 in its fake room, pre-existing), so "a viewer cannot send" rests on the executor's `read_only` check (unit tested) and the composer being disabled by `hasEditAccess`.
- Prompt size: all 56 tool schemas are about 48,000 characters (roughly 13k tokens by a 3.6 characters-per-token estimate, not measured with a tokenizer); one group is 0.5k to 3.7k tokens by the same estimate. A run that enables three groups is roughly 6k tokens before the conversation, which does not leave room on an 8,000 tokens-per-minute free tier for a long run. `AI_AGENT_TRANSPORT=text` lists compact one-line signatures instead (about 4k tokens for every tool).
- `create_image` does not exist because the editor has no images.
- The text-bounds estimate in Node differs from the browser's canvas measurement; tests that need text bounds ran in Chrome.
- Re-applying diagram code recompiles nodes, so `nodeStyle` is lost (unchanged from before); `import_diagram` only adds.
- Touch input and a private window (no localStorage) were not exercised for the new panel mode.
