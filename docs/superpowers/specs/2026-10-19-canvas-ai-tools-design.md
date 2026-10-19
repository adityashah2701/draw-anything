# Canvas AI tools — design

Date: 2026-10-19. Status: in progress (the coverage matrix at the end is filled in from what shipped).
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

## 4. Coverage matrix

(Filled in at the end of the change.)
