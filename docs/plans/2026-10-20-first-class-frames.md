# First-class frames

Status: in progress. PR 1 (model, persistence, containment, typed API) is this document's first landing; the
stacked PRs listed under "Plan" follow it.

A **frame** is a titled region of the canvas that owns the elements placed in it. It replaces the old
"frame" (a guide rectangle plus a separate heading text, see "Audit"), which is an ordinary rectangle with
manually positioned text.

## Audit

Confirmed by reading the code on `main` (f2eed75). Assumptions are marked.

**Elements and persistence**
- The board is one Liveblocks `LiveList` of `StoredElement` (`DrawingElement | GroupRecord`); array order is
  stacking order. Convex `whiteboards.content` is a JSON snapshot of that list (`saved-content.ts`); Convex
  does not validate element types, so a new element type needs no schema change.
- Shapes register through `core/shapes/register-shapes.ts` (`createShapeDefinition`: bounds, hit-test,
  resize handles, `renderToCanvas`, anchors, capabilities). Unknown types fail `checkPatch`
  (`features/canvas-tools/integrity.ts`), so a type must be registered before the agent can write it.
- Every command is a pure function returning a `DocPatch`; `applyDocPatch` writes it as one mutation (one
  undo step). A patch `update` entry deletes a key only when it carries the key as `undefined`.

**Groups (the closest existing containment)**
- `GroupRecord` has no geometry; children point at it with `groupId`; bounds are derived from the children;
  `buildGroupIndex` repairs bad data virtually. Selection is a list of shape ids; transforms go through
  `planTransform`, which carries connectors whose ends are all inside the moved set and re-routes the rest.
- Locked state is inherited from groups (`isEffectivelyLocked`).

**Today's "frame"** (`features/whiteboard/commands/frame.ts: planFrame`): an unfilled `isGuide` rectangle
(`ai.role: "group"`) plus a separate `text` element (`ai.role: "group-label"`) placed by
`frameHeadingPosition`. It has no ownership (nothing records what is "inside"), its title is a second element,
moving it does not move contents, it is the AI compiler's idiom for diagram groups, and diagram code reads it
back as a group. Used by Organize → Frame (`use-organize-commands.ts`), the agent's frame tool
(`canvas-tools/tools/create.ts`) and the AI diagram pipeline. **This PR series does not change it**; the
diagram-code and agent threads decide when their output moves to real frames (see "Migration").

**Connectors and routing**
- Obstacles are elements that have anchors or are text; `isGuide` elements and shapes with no anchors are not
  obstacles and cannot be connection targets (`connector-router.ts`, `generate-anchors.ts`).
- Moving a set: connectors with every attached end inside travel rigidly; others are re-routed from their
  original geometry (PR #30).

**Not verified (assumptions)**: Clerk, Convex and Liveblocks cannot run in the cloud environment, so nothing
here was exercised against a live room. Persistence is verified through the same JSON round trip autosave and
load use (`parseSavedContent`), and collaboration only by reading `applyDocPatch`.

## Model

```ts
interface FrameShape extends BaseDrawingElement {   // type: "frame"
  title?: string;             // default "Frame"; edited in place, never a separate text element
  cornerRadius?: number;      // default 8
  padding?: number;           // default 24; space kept around contents when fitting
  titlePlacement?: "inside" | "above";   // default "inside": a 32px band; "above": a tab outside the box
  headerVisible?: boolean;    // default true
  autoFit?: boolean;          // box always wraps contents + padding (+ header)
  minWidth?: number; minHeight?: number;  // default 80 x 60
  preset?: "section" | "container" | "feature-group" | "swimlane" | "device";
}
// plus on every element:  frameId?: string   (the owning frame)
```

`points` are the two corners, `color` is the border, `fill` the background (absent = transparent), `opacity`
fades the whole frame, `locked`/`hidden` behave as for any element. Absent optional fields mean the defaults
above, so an older build's frame (or a hand-written one) always reads (`resolveFrame`, which also clamps
corrupt values). Frames are **not** rotatable, **not** connectable (no anchors, so connectors neither attach
to nor route around them), and have no label capability.

Header and content regions are derived (`frameRegions`), never stored: `inside` = a band at the top of the box
with the content below it; `above` = a tab outside the top-left corner with the whole box as content.

## Frames versus groups

| | Group | Frame |
|---|---|---|
| What it is | A set you move and style together | A place on the canvas that owns things |
| Stored as | `GroupRecord` (no geometry), members point with `groupId` | A drawable element with a box; owned elements point with `frameId` |
| Bounds | Derived from members | Its own box, set by hand or by auto-fit |
| Visible | No | Yes: border, optional fill, title |
| Select by clicking | The member (then the group) | The header or border only; the interior selects what is inside |
| Move | Moves members | Moves itself and everything it owns (deep) |
| Delete | Deletes members | Deletes itself and what it owns, or releases the contents (`deleteFrame`) |
| Nest | Groups in groups | Frames in frames, to a depth of 8 |

They are independent and never duplicate state: `groupId` and `frameId` are separate fields, so an element can
have both, and a group may span frames (its members each have their own owner). The engine never rewrites one
because of the other. Grouping a set of elements that are all in the same frame leaves them in it; adding a
group to a frame (`addToFrame` with the group's id) gives the frame all of its shapes.

**Ownership is one-way and single-sourced**: only the child records its frame (`frameId`); a frame stores no
list of contents. `buildFrameIndex` derives children, depth and descendants and repairs bad data virtually (a
dangling or non-frame `frameId`, a self link, a cycle, or a link deeper than 8 reads as top level; nothing is
thrown or written). Membership is explicit, not geometric: resizing a frame or dragging a child's coordinates
never changes ownership by itself. Ownership changes only through the API, and the drag/draw flows call
`reparentMoved` / `createFrame({ adopt })`, which use the **centre rule**: the deepest unlocked frame holding
the element's centre owns it. A connector with both ends attached is owned by the nearest frame owning both
ends.

**Stacking**: a frame is always below what it owns in the stored order. Every API patch carries the `order`
that keeps this (`orderFramesBelowContents`).

## Typed API (`core/frames/frame-api.ts`)

All pure, each returns a `DocPatch` (one undo step) or `{ ok: false, code, message }` with
`code ∈ not_found | not_a_frame | locked | cycle | too_deep | invalid | auto_fit | exists`; none throws.

`createFrame` · `frameSelection` · `updateFrame` · `renameFrame` · `moveFrame` (returns the connectors to
re-route) · `resizeFrame` · `fitFrameToContent` · `planAutoFit` · `addToFrame` · `removeFromFrame` ·
`nestFrame` · `assignToFrame` · `reparentMoved` · `deleteFrame` · `listFrames` · `listFrameContents`.

Locked elements are never moved, deleted or re-owned; a locked frame refuses changes.

## Behaviour in the editor

- **Selection is the frame alone**; its contents are implied. Move (drag, arrow keys, align/distribute), copy,
  duplicate, delete and restack act on the frame *and everything it owns* (`withFrameContents`). Locked contents
  are skipped by a move, as locked shapes are everywhere.
- **Drop re-homes** (`reparentMoved`, centre rule) inside the drag's own undo step; a click that moves nothing
  writes nothing. Auto-fit frames, including the one a shape left, re-fit in the same step.
- **Delete** removes the frame and its contents (and attached connectors). The **eraser skips frames**.
- **Duplicate/paste**: copies of a copied frame belong to the copy; a copied child stays in its own frame if it is
  unlocked, otherwise it lands at top level.
- **Z-order**: a frame moves with its contents; a child can never be sent below its frame.
- **Connectors**: ones with every end inside travel rigidly; ones that leave the frame are re-routed from the new
  position, never detached.

## Migration and compatibility

- Boards without frames load unchanged: no field is required, `frameId` is optional, and the index of such a
  board is empty.
- Old "frames" (guide rectangle + label) keep working as they do today. A later PR adds an explicit,
  lossless "convert to frame" for them; nothing converts automatically, because the diagram-code reader and the
  AI compiler still rely on `ai.role: "group"`.
- A build that predates frames should draw a `frame` element as nothing (no registered definition) and ignore
  `frameId`; contents stay where they are. This is read from the renderer, not tested against an old build.
- `checkPatch` refuses a patch that writes a `frameId` that is not a frame, is the element itself or inside it,
  or exceeds the depth limit. `validate_diagram` reports `dangling_frame_ref` and `validate_and_repair_diagram`
  repairs it.

## Plan and acceptance criteria

1. **PR 1 – model and API (this PR).** Types, `frameId`, shape definition (basic drawing, hit-test, handles),
   `core/frames` (model, index, containment, API), integrity and validation, docs.
   *Done when*: every API function has success and failure tests including locked, cyclic, too-deep and damaged
   boards; save/load round-trips twice without drift; the whole suite passes.
2. **Rendering.** Paint order, hover and selection chrome, opacity, dark/light, export (PNG/SVG/PDF), minimap,
   thumbnails; frames excluded from marquee-inside-selects and snapping targets as designed.
3. **Frame tool and draw-to-create**, toolbar and shortcut, Frame Selection command.
4. **Inline title editing** (no separate text element), selection, resize handles, keyboard.
5. **Properties**: extend the bottom properties bar and the inspector.
6. **Commands**: context menu, command palette, delete/release, lock, z-order.
7. **Connector behaviour** when frames or contents move; boundary crossing; undo.
8. **Presets** (section, container, feature group, swimlane, device) only where defined by the model above.
9. **Optional**: collapse with motion (emilkowalski/skill), convert legacy frames.

Each PR adds tests at its layer; the browser harness (`tests/browser`) covers real pointer and keyboard flows
where Chrome is available.

## Tooling used

Skills available in this environment were checked: Ponytail, Compound Engineering and Brainstorming are not
installed, so none was used. `reverse-engineer-anything` targets shipped binaries, not a source repository, and
was not used. The audit was done by reading and tracing the code.

## Frame tool

Toolbar button, `O` (F is already "zoom to fit") and the command palette pick the tool. Dragging draws a box;
on release `createFrame({ adopt: true })` takes over every shape whose centre is inside (connectors with both
ends adopted), nests the frame in the frame its centre falls in, places it below its contents, selects it and
returns to the select tool. That is one patch, hence one undo step. A click without a drag draws nothing.

## Title editing

Double-click on a frame's header or tab, or Enter with one frame selected, opens a single-line input over
the title (`FrameTitleEditor`); it is the frame's own `title` field, never a text element. The canvas draws the
frame without its title text while the input is open (`withHiddenTitle`). Enter or a click elsewhere commits
through `renameFrame` (one undo step; an empty title clears the field and the default "Frame" shows), Escape
discards. A frame whose header is hidden has no title to edit here (the properties UI will cover it).

## Commands

Frame selection (Ctrl+Alt+G, the context menu and the palette) now creates a real frame through
`frameSelection`: sized to hold the selection plus padding and header, owned by the nearest frame that already
held all of it, owning the selection, behind its contents, nothing moves, one undo step, and the new frame ends
up selected. The old guide-rectangle-plus-text version remains only inside the AI diagram pipeline and the
agent's legacy tool. Also in the context menu and palette: Remove from frame (one level up), Fit frame to
contents, and Remove frame, keep contents (the frame goes, what it held stays and is selected). Delete on a
frame still removes it with its contents. A command with nothing to do (nothing in a frame, a locked frame, a
frame that already fits) leaves the board alone and says why in a toast. Everything is planned by the pure
`features/whiteboard/commands/frame-actions.ts` and wired by `useFrameCommands`.
