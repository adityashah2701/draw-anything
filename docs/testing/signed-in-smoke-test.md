# Signed-in smoke test

Nothing here has been run by an automated test: the real-Chrome suite uses in-memory fakes of Liveblocks, Convex and Next and has no Clerk. Run this by hand with real accounts after deploying Convex (Convex first, then the app).

Prepare: two Clerk users, A and B, in the same organization; a third user C outside it. `.env.local` filled in (see `claude.md`). `npm run dev`. Keep the browser console open; any red error is a failure.

## 1. Authentication and access
- [ ] Signed out, open `/whiteboard/<id>`: redirected to sign-in, no board content shown.
- [ ] A signs in; the dashboard lists A's boards. Create a board; it opens.
- [ ] B (same organization) opens A's board URL: allowed, edits sync.
- [ ] C (other organization) opens the URL: no access, no board data, and no Liveblocks room connection in the network tab.
- [ ] Sign out and back in; the session returns to the dashboard.

## 2. Open, edit, save, reload
- [ ] Open a board with content: it appears once, not blank then filled, and the viewport is restored.
- [ ] Edit, wait for "Saved", hard reload: the same content and viewport return.
- [ ] Open a brand-new empty board, reload immediately: it stays empty and a later reload does not wipe an earlier board (autosave must wait for the seeded state).
- [ ] Rename the board from the editor; the dashboard shows the new name.

## 3. Drawing, selecting, resizing
- [ ] Draw a rectangle, ellipse and diamond; after each the tool returns to select and the shape is selected. A plain click with a shape tool creates nothing.
- [ ] Freehand and eraser stay active until you change tool.
- [ ] Marquee-select several shapes; drag them together; a plain click on one of them (no movement) selects only that one.
- [ ] Resize from every handle; move with Alt held (no snapping) and without (snaps to neighbours within a few pixels).
- [ ] Escape while drawing cancels the shape.
- [ ] Two browsers: B sees A's cursor, selection outline and the shapes appear live.

## 4. Connectors
- [ ] Drag from a shape's connection handle to another shape: an arrow attaches at both ends and routes around other shapes.
- [ ] Move either shape: the arrow follows without lagging or detaching.
- [ ] Drag the middle segment of an arrow: it moves smoothly, stays orthogonal and does not jump to another segment.
- [ ] Drag the segment next to a shape: the lane slides; no new bend appears at the anchor.
- [ ] Drag an arrow end onto another shape (reattaches) and into empty space (detaches).
- [ ] Double-click an arrow bend to remove it, and a segment to add one.

## 5. Text
- [ ] Double-click a shape, type, Escape: the label is kept. Enter inserts a newline.
- [ ] Text tool: click, type, click away: a text block is created; emptying an existing block deletes it.
- [ ] Bold and italic via the editor keep the same layout on the canvas as in the editor.

## 6. Undo and redo
- [ ] A drag, a resize and an erase stroke are each one undo step. Undo then redo restores them exactly.
- [ ] Applying diagram code (see 7) is one undo step.
- [ ] B's changes are not undone by A's undo.

## 7. AI diagram generation
- [ ] Open the AI panel; only providers with a configured key are offered.
- [ ] Generate a flowchart with a decision and a retry loop: frames and nodes stream in just inside the viewport, then arrows.
- [ ] Switch to the Code tab, edit a label, apply: the diagram is replaced in place and nodes you dragged keep their position.
- [ ] Generate more than the rate limit allows in 10 minutes: a generic error, no stack trace or key in the UI.
- [ ] Signed out, `POST /api/ai/generate-diagram`: rejected.

## 8. Comments
- [ ] `M`, click the canvas, write a comment: a pin appears and follows zoom and pan.
- [ ] B sees the pin, replies, resolves it; A sees the change. Resolved threads hide behind "Show resolved".
- [ ] `@` in the composer lists A and B only; a mention of A shows on the pin for A.
- [ ] C cannot read or post comments on this board.

## 9. Export
- [ ] Cmd/Ctrl+Shift+E: export the board as PNG, SVG and PDF; open each. Text, arrows and icons match the canvas, light background.
- [ ] Select a few shapes and export: only those, plus connectors with both ends selected.

## 10. Regression spot checks for the 2026-10-17 refactor
- [ ] Icon picker (`I`): insert an icon, drag it, delete it.
- [ ] Light and dark theme: text and the properties panel stay readable.
- [ ] Billing and create-organization pages load (the dashboard components removed in the cleanup were unused, but confirm).
- [ ] Network tab: no 404 for a JS chunk, and the first board load stays near the 200 kB route size.
