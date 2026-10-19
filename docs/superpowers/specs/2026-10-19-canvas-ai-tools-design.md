# Canvas AI tools — design

Date: 2026-10-19. Status: implemented (section 4 is what shipped).
Test results and known gaps: `docs/testing/canvas-ai-tools-tests.md`.

## 1. What the codebase already had (inspected, not assumed)

| Area | Where | Facts that shaped the design |
| --- | --- | --- |
| AI today | `app/api/ai/generate-diagram`, `features/ai/*` | Generation only: the model writes a *new* diagram (legacy LangGraph, one-shot agent, or the builder agent); the server streams `element.batch/update/remove` events and the client draws them. The route checks the Clerk session, a per-user rate limit and the provider allow-list. It never reads the board, so it never checks board access. |
| Tool calling today | `diagram-agent/transports/*`, `agent-loop.ts` | Every tool takes ONE plain string (`TOOL_PARAM`), validated leniently, because free-tier providers reject strict schemas. Two transports over the same provider abstraction (`createAIChatModel`/`createBaseChatModel`): native `bindTools`, and a text protocol (`<tool name=...>`) used for Gemini and as automatic fallback. |
| Document | `StoredElement[]` in a Liveblocks `LiveList`; autosave writes the whole list to Convex | Shapes and composite-group records share one list; array order is z-order. `splitStored` gives shapes to every renderer, router and exporter. |
| Commands | `core/groups/*`, `utils/arrange.ts`, `utils/move-plan.ts`, `utils/semantic-node-edit.ts`, `utils/inspector-edit.ts` | Pure planners returning a `DocPatch` (`add/update/remove`); `applyDocPatch` writes a patch as ONE storage mutation = one undo step. `applyPatch` is the reference semantics on a plain list. Some orchestration still lives in hooks (`use-element-commands`, `use-group-commands`, `use-selected-arrow`, `use-selection-style`). |
| Routing | `core/arrow/use-arrow-connections.ts` over `core/routing/*` | The connector router (anchors, obstacles, adjacency, path caches, parallel-edge handling) is pure code wrapped in a React hook (refs and memo). The AI compiler routes headlessly through the same `core/routing`. |
| History, selection, viewport | controller state | `history.undo/redo` (Liveblocks), `selectedElements`, `canvasViewport` (React state): client only. |
| Export, persistence | `features/whiteboard/export/*`, `use-whiteboard-auto-save` | PNG/SVG/PDF need a browser canvas; saving is autosave plus Ctrl+S. Access: Convex `getAccess` (creator or organisation member), the same rule as the Liveblocks room auth. |
| Tests | `tests/browser/editor/*` | The real editor in Chrome with in-memory Liveblocks/Convex fakes, driven by real input. |

### Risks identified before editing

1. **The board lives in the browser** (Liveblocks, selection, history, viewport). A server-side executor would work on a snapshot and could not do `undo`, selection, viewport, export or save faithfully, and would race with collaborators.
2. **Two command implementations would drift.** Several editor commands exist only inside hooks, so a tool could not call them without copying them.
3. **The router is a hook.** A tool cannot create or reroute a connector without duplicating routing unless the router is extracted.
4. **Strict schemas vs. free-tier providers** (token limits, `tools` rejected): ~70 schemas on every request would not fit an 8,000-token minute.
5. **Prompt injection through board content**: labels are model-readable, so a label can contain instructions.
6. **Capabilities the spec lists that the editor does not have** (opacity, hide/show, corner radius on shapes, frames, connector labels as an editor feature, spacing by gap, auto layout/tidy, images). Each must exist for humans before the AI gets a tool.

## 2. Architecture

```
model (server, keys never leave) <-- one stateless turn per request --> client loop
                                                                        |
                              strict allowlist + zod validation  <------+ executes sequentially
                                                                        v
                                       ToolExecutor (isomorphic, features/canvas-tools)
                                       validate -> resolve ids -> plan (pure) -> guard -> apply
                                                                        |
                                           CanvasHost (the only door to state)
                              editor host (live room, controller)  |  memory host (tests)
```

* **Tools are pure planners.** A mutating tool reads the current `StoredElement[]` from the host and returns a `DocPatch` (plus an optional selection); the executor validates the patch (unique ids, no dangling connections or groups introduced) and hands it to `host.applyPatch`, which is `applyDocPatch` in the editor: one undo step, atomic, the same write path every human command uses. Tools never write storage themselves.
* **Shared commands.** Everything a tool does that a human can also do goes through the same function the editor's hook calls: the hooks are refactored onto `features/whiteboard/commands/*` and the extracted `core/arrow/connector-router.ts`. There is no AI-only drawing engine.
* **Client-driven loop.** The server only talks to the model: `POST /api/ai/canvas-agent` is one stateless turn (messages in, validated tool calls out). The client executes the calls against the live editor and sends the results back. This keeps API keys server-side, uses the existing provider abstraction, gives real undo/redo/selection/viewport/export/save, and sees collaborators' edits.
* **Server-side validation too.** The turn endpoint re-parses every returned call with the tool's schema and drops anything outside the run's enabled tool groups; the executor validates again before touching the document (defence in depth).
* **Tool groups** keep the prompt small: `inspect` is always on, the model enables others with `enable_tools` (or the server enables the likely ones from the request), and a call to a tool outside the enabled groups is refused.
* **Stable ids.** Creation tools accept an optional caller-chosen `id` (validated, unique), so a plan can create and then connect elements in one turn without waiting for generated ids.
* **Results are structured**: `{ ok, tool, summary, data, affected: {created, updated, removed}, revision, warnings, error? }`; errors carry a code, a message the model can act on, and the offending ids.
* **Safety**: strict allowlist; schemas with `.strict()`; ownership via the existing Convex access rule; read-only viewers get inspection only; destructive document-wide tools (`clear_canvas`, replace-load, bulk delete) need `confirm: true` AND a human confirmation from the host; stale-revision guard (`expected_revision`, enforced for destructive and layout tools); per-run idempotency by call id; a failed mutating call skips the rest of its turn; structured logs without arguments or secrets.

## 3. Capability inventory

Legend: **E** exists in the editor, **+** capability added in this change, **host** needs the browser (executed by the editor host), **-** not supported by the editor, so no tool is registered.

### A. Creation

| Manual operation | Existing implementation | AI tool | Missing capability | Tests |
| --- | --- | --- | --- | --- |
| Draw rectangle / ellipse / diamond / pill / triangle / line / pencil | shape registry `createShape`, drawing hook | `create_shape` | + `cornerRadius` on rectangles (rounded vs square) | create each type, defaults, invalid points, caller id, collision |
| Text tool, multi-line | `text` shape, `CanvasTextBlock` | `create_text` | | multiline, font props |
| Icon picker | `buildIconElement`, registry | `create_icon`, `search_icons` | | registry id, unknown id, custom not allowed |
| Semantic node tool | `semantic-node` + `nodeStyle` | `create_semantic_node` | | label, icon, size fit (`sizeSemanticNode`), nodeStyle |
| Connector by handle drag / arrow tool | `buildConnectorArrow`, router | `create_connector` | + pure router | anchors, types, routing, labels |
| Group (Ctrl+G) | `planGroup` | `create_group`, `group_elements` | | nested, locked, <2 |
| Frame / section | AI group frames only | `create_frame_or_section` | + "Frame selection" command | frame around members |
| Image | none | not registered (-) | | |
| Duplicate / paste | `cloneElements`, `regroupClones` | `duplicate_elements` | | connectors repointed, groups cloned |
| Diagram code | `elementsFromDiagramCode`, `applyDiagramCode` | `import_diagram` | | parse errors, replace, placement |

### B. Editing

| Manual operation | Existing | AI tool | Missing | Tests |
| --- | --- | --- | --- | --- |
| Inspector / floating bar styles | `useSelectionStyle`, inspector | `update_element`, `update_shape_style` | + `opacity`, + rectangle `cornerRadius` | unsupported property errors, locked |
| Edit label / text | inline editors | `update_text` | | multiline, text vs label |
| Icon picker (replace) and node panel | `semantic-node-edit.ts` | `update_icon`, `update_semantic_node` | | replace/remove/restore, size, colour |
| Drag / nudge | `planShapeMoves` | `move_elements` | | relative/absolute, groups, connectors follow |
| Resize | `planFrameEdit`, `resizeShape` | `resize_element` | | min size, ratio, rotated |
| Rotate | `planSetRotation`, `planRotateBy` | `rotate_elements` | | absolute/relative, group |
| Align / distribute | `alignOffsets`, `distributeOffsets` | `align_elements`, `distribute_elements` | | locked, groups as units |
| Gap spacing | none | `set_element_spacing` | + `spacingOffsets` and an inspector field | exact gap |
| Z-order | `reorder` | `reorder_elements` | | stored order incl. groups |
| Group / ungroup / lock / rename | `core/groups` | `group_elements`, `ungroup_elements`, `lock_elements`, `unlock_elements`, `rename_group` | | nested, locked |
| Hide / show | none | `hide_elements`, `show_elements` | + `hidden` (renderer, hit-test, export, selection), commands and a menu | hidden cascade to connectors |

### C. Connectors

| Operation | Existing | Tool | Missing | Tests |
| --- | --- | --- | --- | --- |
| Connect two shapes | handle drag | `connect_elements` (alias of `create_connector` for existing ids) | | |
| Edit type, routing, dashed, heads, ends | `useSelectedArrow` | `update_connector` | | re-route, endpoints |
| Disconnect | none as a command (move the end) | `disconnect_elements` | + pure command | endpoints survive |
| Connector labels | AI diagrams only (`edge-label` text) | `update_connector_label` | + command and an inspector field; labels follow the connector | create/edit/remove |
| Re-route | router | `reroute_connector` | | |
| Delete a connector | delete key | `delete_connector` | | endpoints survive |

### D. Deletion, inspection, selection

`delete_elements` (`planDelete`: connectors cascade explicit, locked skipped), `get_document_state`, `get_element_details`, `find_elements`, `get_selection`, `select_elements`, `clear_selection` (host), `search_icons`.

### E. Layout

| Operation | Existing | Tool | Missing |
| --- | --- | --- | --- |
| Layered layout | the AI compiler's engine (new diagrams only) | `auto_layout` (algorithms: `layered`, `row`, `column`, `grid`, `circle`) | + `planAutoLayout` and a "Auto layout selection" command |
| Tidy | none | `tidy_diagram` | + `planTidy` (snap near-aligned rows/columns, equalise gaps, resolve overlaps; ids, connections and order untouched) |
| Presets | none | `apply_layout_preset` | named presets over the above |
| Validate | `layout/metrics.ts` (compiler output) | `validate_diagram` | + structural checks on any board |
| Fit | `fitToBounds` | `zoom_to_fit` (host) | |

### F. Document

| Operation | Existing | Tool |
| --- | --- | --- |
| Undo / redo | `history` | `undo_action`, `redo_action` (host) |
| Clear | command menu | `clear_canvas` (confirmation) |
| Export PNG/SVG/PDF | `exportScene`, `deliver` | `export_diagram` (host) |
| Save | autosave, Ctrl+S | `save_document` (host) |
| Load | the board loads itself; `parseSavedContent` validates saved JSON | `load_document` (authorised whiteboard id or JSON; merge or confirmed replace) |
| Serialise | `graphFromElements`, `serializeDiagramCode` | `serialize_diagram` |
| Repair | none | `validate_and_repair_diagram` (explicit issue codes only) |

## 4. Coverage matrix (what shipped)

`U` = unit tests under `features/canvas-tools` (executed on an in-memory host, real tools, real commands); `S` = `agent/scenarios.test.ts` (real HTTP handler + client loop + executor + tools, scripted model); `B` = real-Chrome tests (`tests/browser/editor/canvas-agent.browser.test.ts` for the agent, `editor-capabilities.browser.test.ts` for the human-facing capability). Counts and the run are in `docs/testing/canvas-ai-tools-tests.md`.

### A. Creation

| Tool | Same command a person uses | Tests | Notes |
| --- | --- | --- | --- |
| `create_shape` | shape registry `createShape` (+ radius, opacity, rotation) | U create | rectangle, ellipse, diamond, pill, triangle, line, freehand; rejects what a shape cannot take |
| `create_text` | `createShape("text")` | U create | multi-line kept, empty rejected |
| `create_icon` | `buildIconElement` + icon registry | U create | unknown names return the closest ids, never "generic" |
| `create_semantic_node` | `createShape("semantic-node")`, `sizeSemanticNode`, `mergeNodeStyle` | U create, S, B | fitted to its label; kind colours; nodeStyle validated |
| `create_connector` | `planCreateConnector` -> the extracted connector router | U connectors, commands, S, B | anchors, routed around shapes, label, idempotent for the same pair |
| `create_group` | `planGroup` | U create, S | nested, locked refused |
| `create_frame_or_section` | `planFrame` (also the menu's "Frame selection") | U create, commands; B (menu) | outline + heading behind the content |
| `duplicate_elements` | `planDuplicate` / `planInsertCopies` | U create, commands | connectors repointed, labels relinked (fixed on the way) |
| `import_diagram` | `parseDiagramCode` + `elementsFromDiagramCode` | U create, document (round trip) | adds only; never replaces |
| `create_image` | n/a | registry test asserts it is absent | the editor has no images |

### B. Editing

| Tool | Command | Tests | Notes |
| --- | --- | --- | --- |
| `update_element` | `planStyle` + label | U edit | text and style in one undo step |
| `update_text` | label / text, typography | U edit | multi-line, connector labels redirected, never empties a text element |
| `update_icon` | `planReplaceIcon` / `planRemoveIcon` / `planRestoreIcon` | U edit, S | replace, hide, restore; standalone icons |
| `update_semantic_node` | `semantic-node-edit` plans + `planStyle` | U edit | reset list instead of nulls |
| `update_shape_style` | `planStyle` | U edit, commands; B (Opacity field, canvas alpha) | unsupported property reported per element |
| `move_elements` | `planMoveBy` | U edit, S | relative or absolute; groups as one; connectors follow |
| `resize_element` | `planFrameEdit` (the inspector's W/H) | U edit, S | reports the size actually reached |
| `rotate_elements` | `planSetRotation` / `planRotateBy` | U edit | set vs by |
| `align_elements` | `planAlign` | U arrange, commands, S | locked units are fixed references |
| `distribute_elements` | `planDistribute` | U arrange, S | needs three unlocked units |
| `set_element_spacing` | `planSpacing` (also the inspector's gap fields) | U arrange, commands; B (Horizontal gap) | exact gap |
| `reorder_elements` | `planZOrder` | U edit | stored order incl. groups |
| `group_elements`, `ungroup_elements`, `rename_group` | `planGroup`, `planUngroup`, `planRenameGroup` | U organize, S | one level; `@selection` works |
| `lock_elements`, `unlock_elements` | `planSetLocked` | U edit | unlock clears enclosing locks like the menu |
| `hide_elements`, `show_elements` | `planHide`, `planShow`, `planShowAll` (menu, button, chip) | U edit, commands; B x2 | hidden stays in the document; connectors hide with an end |

### C. Connectors

| Tool | Command | Tests | Notes |
| --- | --- | --- | --- |
| `connect_elements` | `planCreateConnector` x N | U connectors, S | all or nothing |
| `update_connector` | `applyArrowChange`, `planUpdateConnector` | U connectors, commands | type, heads, routing, dashed, colour, width, re-attach |
| `disconnect_elements` | `planRemove` on the connectors / `planDetach` | U connectors | endpoints never removed or moved |
| `update_connector_label` | `planConnectorLabel` | U connectors, commands; B (Connector label field) | label follows the connector |
| `reroute_connector` | `planReroute` | U connectors, S | manual bends kept unless asked |
| `delete_connector` | `planRemove` | U connectors | label removed, endpoints kept |

### D. Deletion, inspection, selection

| Tool | Command | Tests | Notes |
| --- | --- | --- | --- |
| `delete_elements` | `planRemove` (Delete key, eraser, cut) | U edit, commands, S | connectors + labels listed in the result; large deletes need confirmation; stale guard |
| `get_document_state`, `get_element_details`, `find_elements` | reads | U inspect, S | compact summaries with a revision |
| `get_selection`, `select_elements`, `clear_selection` | host selection | U inspect, S, B | `@selection` token |
| `search_icons` | `searchIcons` | U inspect | several terms per call |

### E. Layout

| Tool | Command | Tests | Notes |
| --- | --- | --- | --- |
| `auto_layout` | `planAutoLayout` (menu "Auto layout") | U arrange, commands, S; B (menu) | layered / row / column / grid / circle; positions only |
| `tidy_diagram` | `planTidy` (menu "Tidy up") | U arrange, commands, S; B (menu) | ids, labels, connections unchanged (asserted via serialisation) |
| `apply_layout_preset` | the two above | U arrange | eight named presets |
| `validate_diagram` | `validateBoard` | U inspect, document | 11 issue codes |
| `zoom_to_fit` | `fitToBounds` | U inspect; B | does not touch the board |

### F. Document

| Tool | Command | Tests | Notes |
| --- | --- | --- | --- |
| `undo_action`, `redo_action` | Liveblocks history | U document, editor-host; B | reports what changed from a board diff |
| `clear_canvas` | storage clear | U document, S; B (confirm bar) | `confirm: true` + the person's approval; fails closed |
| `export_diagram` | `exportScene` + download | U document; B (SVG download) | |
| `save_document` | autosave `saveWhiteboard` | U document; B (save count) | reported from the save state, not assumed |
| `load_document` | Convex `getById` as the signed-in user + `parseSavedContent` | U document, editor-host; B | merge or confirmed replace; invalid documents rejected whole |
| `serialize_diagram` | `graphFromElements` + `serializeDiagramCode` / JSON | U inspect, document | round trip tested |
| `validate_and_repair_diagram` | `repairBoard` | U document | only the codes named |

### Safety checklist

| Requirement | Where | Test |
| --- | --- | --- |
| Strict allowlist | `executor.ts` (name, group), `handler.ts: checkModelCalls` | executor, handler, scenarios |
| Server-side validation of every argument | handler (zod per tool), executor (again) | handler, executor |
| Ownership / authorisation | `handler.ts` + `app/api/ai/canvas-agent/route.ts` (Clerk + Convex `getAccess`), load through Convex as the user | handler, document, editor-host |
| No arbitrary code / filesystem / network | schemas are enums/strings/numbers; ids are patterned; `load_document` takes a whiteboard id or saved JSON only | registry, document |
| Confirmation for destructive document-wide actions | `env.confirm`; `clear_canvas`, `load_document` replace, bulk delete | executor, edit, document, scenarios, browser |
| Transactional / recoverable | one patch = one undo step; `checkPatch` before write; "Undo this run" | executor, edit, browser |
| Idempotency | call-id replay; `create_connector` for an existing pair | executor, connectors, scenarios |
| Stale state / invalid references | revision guards, `not_found` with ids, `checkPatch` | executor, edit, arrange, scenarios |
| Errors not silent | structured `error`, `skipped`, `warnings`; failed write skips the rest | executor, edit, scenarios |
| Never claim success early | `affected` from a board diff; a host that ignores a patch is an error; totals from results | executor, scenarios |
| Logs without secrets | `ToolLogEvent`, `CanvasAgentLog` carry names/codes/counts | executor, handler |
| Keys never reach model or client | providers only in `agent/transport.ts` (server) | handler (502 leaks nothing), browser |

### Not done / limits

- A real model's planning quality is not measured (no live provider run in this change); the scenarios script the model. The tools, executor, endpoint, loop, host and UI around it are exercised for real.
- Prompt size: all 56 schemas are about 48,000 characters; a typical run enables three groups (`inspect` + two). Providers with tight per-minute token budgets (Groq's free tier) can run out on long runs; `AI_AGENT_TRANSPORT=text` uses compact signatures instead of JSON Schema.
- No test against real Liveblocks (two clients), real Convex or Clerk. Read-only boards cannot be opened by the browser harness, so "viewers cannot send" rests on the executor's `read_only` check (unit tested) and the disabled composer.
- `create_image` and any image editing do not exist because the editor has none.
- Re-applying diagram code recompiles nodes (so a node's `nodeStyle` is lost); `import_diagram` only adds.
