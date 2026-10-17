# Eraser vs Draw Anything feature matrix (2026-10-16, first pass)

Evidence classes: **D** = official docs (fetched 2026-10-16), **S** = the in-repo `eraser-diagrams` skill references (Eraser syntax docs), **P** = probed against our code. No authenticated browsing of Eraser was done, so nothing is "observed in product". Inferred items are marked. Sources: docs.eraser.io `what-is-eraser`, `ai-diagrams`, `export`; the freeform and diagram-as-code syntax pages returned 404 or no syntax detail.

## Diagram types (D)
| Eraser | Draw Anything | Gap |
|---|---|---|
| Architecture, flowchart, sequence, ERD, BPMN, freeform | AI types: architecture, flowchart, network, ERD, mind-map, concept, workflow, dependency, organization, sequence, class (`playbooks.ts`) | Types exist as prompts; no BPMN lanes, sequence/ERD have no dedicated renderer (generic nodes) |

## Diagram-as-code (S, P)
| Eraser syntax | Ours (probed) | Severity |
|---|---|---|
| `A > B > C` chain, `A > B, C` branch | Works | none |
| `-->` dotted arrow | Works | none |
| `A - B` line, `A -- B` dotted line | Was parsed as one node named "A - B". **Fixed**: lines without arrowheads (names containing a standalone `-` are now quoted by the serializer) | done |
| Connection `[color: green]` | Was left in the edge label. **Fixed** (`A > B: label [color: green]`) | done |
| Node `shape:` (rectangle, diamond, oval, cylinder, hexagon, parallelogram, document, trapezoid, triangle, star) | `diamond` and `rectangle` supported; the rest warned and ignored (no renderer: oval needs a pill, cylinder/hexagon/etc. do not exist) | Medium |
| Node `color:` | **Supported** (name or #rrggbb; fill is a tint) | done |
| `colorMode` / `styleMode` / `typeface` | Warned and ignored | Low |
| `direction up/left` | Rejected with warning (`down`, `right` only) | Low |
| `link:` property | Not supported | Low |
| Quoted names `"https://x"` | Works | none |
| `//` comments | Works | none |

## AI (D)
| Eraser | Draw Anything | Gap |
|---|---|---|
| Prompt to diagram, type auto-pick | Yes (agent and legacy LangGraph) | none |
| Image-to-diagram, file-to-diagram | Not present | Proposed |
| Chat refinement | Follow-up edits via AI panel | Not verified in this pass |
| Templates, rules, presets | No | Proposed |

## Export (D)
| Eraser | Draw Anything | Gap |
|---|---|---|
| PNG/SVG/PDF | **Implemented** and tested in Chrome (`docs/testing/export-test-report.md`). PDF is raster, one page, not selectable text | vector PDF |
| 1x-3x; transparent or solid | **Implemented** (PNG 1-3x, transparent PNG/SVG; PDF always white) | none |
| Light/dark colour mode | Always light (deliberate, so exports do not depend on the editor theme) | no dark export option |
| Selection-only export | **Implemented** (selected + connectors between them + their labels) | none |
| Copy as PNG (Shift+Alt+C), copy as SVG | Copy as PNG in the dialog and command menu; no shortcut (Alt combinations are unreliable on macOS) and no copy-as-SVG | copy SVG, shortcut |
| Copy XML/JSON, Markdown/HTML embed, link to elements | No | Medium |
| draw.io, Visio, PPTX, Google Slides, BPMN | No | Low (paid in Eraser) |
| Editor integration verified | Controller wiring not exercised: the editor needs a Clerk login | needs a signed-in browser test |

## Editor and collaboration
Already covered in `docs/superpowers/specs/2026-10-16-canvas-ux-design.md`: zoom/pan/minimap, snapping, align/distribute, copy/paste/duplicate, shortcuts, single-step undo per gesture. Eraser adds comments/mentions, version history, folders, sharing; we have live cursors and org-based access only. Integrations (VS Code, Notion, Confluence, Git sync, MCP, REST API) are absent; out of scope for now.

## Prioritised plan
1. DSL: `-`/`--`, connection colour, `shape: diamond`, `color`. (done; behaviour change: a standalone ` - ` in an unquoted name now means a line, as in Eraser)
2. Export: done and browser-verified at the component level; remaining: a signed-in test of the live editor wiring, vector PDF, copy-as-SVG, embed/JSON exports.
3. Direction up/left, ERD and sequence renderers, BPMN lanes.
4. Image/file-to-diagram, templates.

## Canvas and UX refactor status (2026-10-16, MASTER_PROMPT sections 2-12)
Evidence: `tests/browser/editor/*.browser.test.ts` drive the real editor in Chrome (22 tests, all passing), plus unit tests. Not observed: Eraser itself, signed-in sessions, touch/pen, Firefox/Safari.

| Area | Before | Now |
|---|---|---|
| Blank manual shapes | rectangle/circle/diamond created with label `"TEXT"` | blank; double-click or Enter edits; AI/semantic nodes and saved labels untouched |
| Multiline text | Enter committed the editor | Enter = newline; Esc, Ctrl/Cmd+Enter, click outside commit; caret at end; Unicode, long words, reload verified |
| Connector snapping | arrow tool made unattached arrows; handle drags attached | arrow tool snaps both ends (anchor radius in screen px, then shape body), preview on hover, routed on commit; retarget and disconnect work (disconnect was broken by `LiveObject.update` ignoring `undefined`) |
| Tool state | tool stayed active, so a double-click drew a new shape; default tool was pen | returns to select with the new shape selected; default tool is select |
| Ellipse | only a centre+radius circle | box-fitted `ellipse` (tool, hit test, resize, anchors, label, SVG export); `circle` kept for old boards |
| Corner radii | rectangle square, node 8 | tokens: rectangle 6, node 8, pill full, ellipse true curve |
| Label region | editor used the whole bounding box for circle/diamond, canvas used 0.72/0.66 | one shared fraction table |
| Icon picker | none (icons only through AI nodes) | search with aliases, category chips, grid, arrow keys + Enter, empty state; inserts an editable, draggable, exportable node |
| Ordering, context menu | existed (Order submenu) | verified: reorder, undo/redo, reload persistence, outside-click and Escape dismissal |
| Dark theme | semantic tokens existed | not redesigned. Contrast audit added (`core/color/theme-contrast.test.ts`): dark passed; light failed on muted text over muted fills (4.3:1) and the focus ring (2.6:1), fixed in `app/globals.css`; shape labels now need 4.5:1 |
| Brand logos | none | 51 marks from Simple Icons (CC0 data, owners' trademarks) under "Logos"; AWS, Azure, OpenAI and Slack are not available from that source |
| Custom icons | none | import an SVG in the picker (basic shapes, one colour, no transforms); stored in the element, validated on every read; unsafe parts are never kept |
| Comments | none | pinned threads, replies, resolve/reopen, delete own (board creator may delete any), live through Convex; verified against an in-memory fake only |

Added later the same day: touch pinch-zoom/two-finger pan, hit tolerances in screen pixels for line/arrow/freehand, resize handles drawn from the hit-tested list (architecture items 8 and 10), a Terminator (pill) tool.

Added on 2026-10-17 (second pass): icons are inserted as standalone `icon` elements, not labelled nodes; the library grew to about 450 line icons in 12 categories and 204 logos, loaded on demand; comments got @mentions (participants only, no notifications) and real `convex-test` tests; pointer gestures are one state with stale-gesture recovery.

Still unsupported or not done: comment @mentions and notifications, real-Convex testing of comments (no auth or access checks exercised, no two-user test), per-board shared custom icon library, selection handles for freehand/text (architecture doc item 8), hit-test tolerances in world units for lines/freehand (item 10), a formal interaction state machine (item 11), touch and pen testing, a contrast audit.
