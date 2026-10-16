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
