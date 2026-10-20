# Diagram-as-code language: audit, design and plan

Status: in progress (2026-10-20). Slices ship as stacked PRs; this file is updated by each one.

## 1. Audit

### Confirmed facts (read in the repository)

- The feature is `features/diagram-code`: `parse.ts` (a line-oriented hand-written parser), `serialize.ts` (graph to text), `canvas.ts` (code to canvas elements and canvas to graph), `pins.ts` (detects nodes the user moved). 116 unit tests cover it.
- The parser returns `ParsedDiagramCode` (nodes, edges, groups, issues). Issues carry only a 1-based **line**: no column, no range, no code, no suggestion. Nothing in the parser keeps token positions, so highlighting, hover, completion and comment-preserving formatting are impossible on top of it.
- The parser already is "pure": it never touches canvas objects. But the intermediate form is thin: it has no frames, no source ranges, and validation (kinds, icons, sizes) happens later and silently, inside `normalizeModelGraphDraftDetailed` (`features/ai/schemas.ts`), which clamps and drops (limits: 40 nodes, 80 edges, 12 groups).
- Layout and canvas creation are shared with AI generation: `documentFromParsedCode` builds an `AIDiagramDocumentV1` (`buildAIDiagramDocument`), `compileAIDiagramToCanvas` (`features/ai/server/canvas-compiler.ts`) lays out and emits elements. There is one diagram engine; this work must not add another.
- What the compiler can draw for a node: a `semantic-node` (rectangle with icon and label), `diamond` (kind `decision`), `pill` (kinds `start`/`end`), and a bare `icon`. Groups are `rectangle` guide frames plus a `group-label` text. Edges are `arrow` / `arrow-bidirectional` plus an `edge-label` text. The canvas shape registry (`core/shapes/register-shapes.ts`) also has circle, ellipse, triangle, text, line, freehand, but the compiler does not emit them. **There is no cylinder, document, cloud, hexagon or parallelogram shape anywhere in the renderer.**
- The `direction` header (`direction right`) is parsed but never reaches layout (`documentFromParsedCode` does not pass it). It currently does nothing.
- The code editor is a plain `<textarea>` with a line-number gutter (`features/whiteboard/components/overlays/diagram-code-editor.tsx`). No CodeMirror, Monaco or similar is installed (`package.json`). Apply is explicit ("Update diagram" / "Add as new"), not live. Updating replaces the elements the code was loaded from (`replaceIds`), and `findMovedNodes` re-pins nodes the user dragged. There is no live preview, no element-identity matching beyond that, and no conflict detection.
- Other consumers of the parser: the canvas agent tools `import_diagram` and `inspect` (`features/canvas-tools/tools`), and the older diagram-agent (`features/ai/diagram-agent`). They depend on `parseDiagramCode`, `elementsFromDiagramCode`, `graphFromElements`, `serializeDiagramCode` and the `ParsedDiagramCode` shape. Those signatures stay.
- Icons: `core/icons/registry.ts` is the only icon source. The curated core is always loaded; about 400 more icons and 204 logos load on demand (`loadIconLibrary`). `resolveIconId` therefore returns `undefined` for a valid library icon until the library is installed; icon diagnostics must account for that.
- Persistence: Liveblocks storage is the live document; Convex stores a JSON snapshot. The code text itself is **not** persisted anywhere. It lives in React state in the editor and is regenerated from the canvas on "Load".
- No Ponytail or Compound Engineering skill is installed in this environment (checked with the skill list and search); neither was used. The `reverse-engineering` skill present targets shipped binaries, not source repositories, so it was not used either. Work is by reading and tracing the code.

### Assumptions (not verified)

- The frames thread will define a typed frame API and frame element; the language only needs its own semantic model (below) until that lands. Whether a frame can contain a group, or the reverse, is decided here (section 3) and must be reconciled with that thread.
- Real Clerk/Convex flows cannot run in the cloud environment; UI is verified with the browser harness only.

## 2. Source of truth

**The canvas (Liveblocks elements) is the document. The code is a view of it.** The code text is never stored as a second document.

- Code to canvas: parse, validate, resolve to the intermediate representation (IR), compile through the existing compiler, and diff against the elements previously produced for this code (slice 3). An invalid parse never reaches the canvas, so the last valid state stays.
- Canvas to code: `graphFromElements` then the formatter. Loading is explicit.
- The editor remembers a *baseline*: the canvas revision the code was last synchronised with. If the canvas changed since, applying shows an explicit conflict choice instead of overwriting (slice 3).

## 3. Language design

Line-oriented, brace-delimited, and a strict superset of the existing syntax: every program that parsed before parses to the same nodes, edges and groups.

```
document   = { blank | comment | header | statement }
header     = ("title" | "type" | "direction") value        (only before the first statement)
statement  = declaration | connection | blockOpen | "}"
declaration= ref { "," ref }
ref        = name [ "[" props "]" ]
connection = endpoints connector endpoints { connector endpoints } [ ":" label ] [ "[" edgeProps "]" ]
connector  = ">" | "<" | "<>" | "-" | "--" | "-->" | "<-->"
blockOpen  = [ "group" | "frame" ] ref "{"                  ("{ }" closes inline)
name       = bare words | "quoted string"
comment    = "//" ... | whole line starting with "#"
```

- `frame Name [props] {` opens a **frame**; a block with no keyword, or with `group`, is a **group** (unchanged). A group literally named `frame x` is written `"frame x" {`.
- **Frame vs group.** A group is a visual cluster of nodes (a labelled guide rectangle); membership is the only thing it means. A frame is a titled container with its own geometry (position, size, padding), and can be nested. Rules enforced as diagnostics: frames may contain nodes, groups and frames; groups may contain nodes and groups **but not frames**; a node belongs to at most one parent (the first one wins, as today).
- Properties are validated against one vocabulary table (`language/vocab.ts`) that also drives completion, hover and the docs, so they cannot drift.
- Shapes the renderer cannot draw (`cylinder`, `hexagon`, `cloud`, `document`, `parallelogram`, ...) are **recognised and reported** with a precise message and a suggestion (for example "use `kind: database` for a database"), not silently dropped and not pretended to work. They become real only if the canvas gains the shape.

## 4. Layers

| Layer | Module | Knows about |
| --- | --- | --- |
| Parser | `language/parser.ts` | text to AST with source ranges, highlighting tokens and syntax diagnostics (the language is line-oriented, so scanning and parsing are one pass; no separate lexer) |
| Vocabulary | `language/vocab.ts` | the one table of properties, shapes, kinds, connectors that validation, completion, hover and docs read |
| Resolver | `language/resolve.ts` | AST to validated IR, semantic diagnostics (duplicates, references, vocabulary, nesting) |
| IR | `language/ir.ts` | plain data, no canvas types |
| Compat | `parse.ts` | projects the IR to the legacy `ParsedDiagramCode` |
| Layout, canvas | `canvas.ts` + the AI compiler | unchanged engine |
| Formatter | `language/format.ts` (slice 2) | AST, comments |
| Editor tooling | `language/tooling/*` and the editor (slice 4) | tokens, AST, vocab |

## 5. Slices and acceptance criteria

1. **Grammar, parser, IR, diagnostics.** Every previous test passes unchanged. Diagnostics have code, line, column, end, severity, message, optional suggestion. Frames parse, resolve and project. Unknown kind/icon/shape/property are reported with "did you mean". Fuzz: no input throws; parsing is linear.
2. **Formatter.** Deterministic, idempotent, keeps comments, never drops unknown properties; parse-format-parse yields an equal IR on every fixture and example.
3. **Canvas apply.** Identity matching of declarations to existing elements, localised updates, last-valid-state preserved on invalid code, explicit conflict handling; no feedback loop.
4. **Editor tooling.** Syntax highlighting, completion, hover, live diagnostics, format command, keyboard access; built on the existing textarea (no new dependency, see below).
5. **Docs and examples.** Reference plus templates that only use diagram types that work end to end.
6. **Frames on canvas.** Waits for the frame API from the "First-class canvas frames" thread.

### Editor dependency decision

No code-editor library is installed. CodeMirror 6 would be the usual choice (about 150 KB for the pieces needed, good accessibility), but this language is small, line-oriented and already has its own lexer, and the editor lives in a narrow side panel. Slice 4 layers a highlighted mirror and a completion popup over the existing textarea instead of adding a dependency; the decision is revisited if accessibility or IME problems show up in the browser harness.
