# DRAW ANYTHING — FULL CANVAS, INTERACTION & UI/UX REFACTOR

Act as a principal frontend architect, canvas-engine engineer, interaction designer, graphics engineer, accessibility specialist and QA engineer.

Your task is to refactor Draw Anything into a polished, intuitive technical diagramming and whiteboard application inspired by the observable behavior and interaction quality of Eraser.io.

The current UI and editing experience are not good enough. This is a functional and architectural refactor, not just a CSS redesign.

Study the supplied Eraser screenshots carefully. Reproduce the relevant interaction patterns and visual quality through an independent implementation compatible with our existing architecture.

## CRITICAL: CONTINUE FROM THE EXISTING PROJECT

Before doing anything, inspect the current Git diff, project structure, existing implementation, recent commits if available, tests and documentation.

Recent work has already started on Eraser research and diagram-as-code correctness. Depending on the current repository state, the following may already exist:

- `docs/audits/eraser-feature-matrix.md`
- Diagram-code fixes for `-`, `--` and `-->`.
- Connection-level color parsing.
- Diamond shapes and named/hexadecimal colors.
- Shape serializer quoting and round-trip behavior.
- Export functionality or export-related work in progress.

These are examples of potentially completed work, NOT a request to implement them again.

**First verify what actually exists. Do not repeat completed work. Do not overwrite working changes. Do not restart the audit from scratch.**

Inspect Git status and the existing code before editing anything. Preserve unrelated user modifications. Extend existing implementations rather than creating competing systems.

Keep existing Groq and other provider integrations, the LangGraph pipeline, authentication, persistence and board compatibility intact.

# 1. USE ERASER AS A BEHAVIORAL REFERENCE

Use the supplied screenshots as visual references and research official Eraser documentation where useful.

Reference the following observable capabilities:

- Dark canvas and compact application chrome.
- Top navigation with document/canvas modes and AI actions.
- Vertical left toolbar with familiar drawing tools and keyboard shortcuts.
- Shape, arrow, line, text, freehand, selection, icon and comment tools.
- Searchable icon picker with categories, including general icons, technical logos, cloud-provider icons and custom icons where supported.
- Floating contextual toolbar for selected elements.
- Inline text editing.
- Shape selection and resize handles.
- Connector endpoints that attach to shapes.
- Context menus for copying, exporting selections and changing object order.
- Comments and replies where the existing application supports them.
- Keyboard shortcuts, responsive interactions and useful empty states.
- A subtle, polished dark visual design.

Do not copy Eraser's proprietary source code or assets. Reproduce the relevant behavior and interaction patterns independently.

Document which features are implemented, which already existed and which remain unsupported.

# 2. FIX TEXT EDITING AND MULTILINE TEXT

This is a top priority.

Currently, text behaves like a single-line field in situations where users need multiline content.

Implement a reliable text-editing model that supports:

- Multiline text inside shapes.
- Multiline standalone text elements.
- Enter to insert a newline while editing.
- A deliberate shortcut or interaction to finish editing.
- Double-clicking an existing text element to edit it.
- Double-clicking a shape to edit its internal text.
- Predictable keyboard focus and cursor placement.
- Correct handling of selection, copy/paste, undo/redo and deletion.
- Text wrapping when appropriate.
- Correct line height, padding and vertical alignment.
- Content-aware minimum dimensions.
- Resizing without clipping text.
- Long labels, Unicode and special characters.
- Correct behavior at different canvas zoom levels.
- Save/reload fidelity.

Do not make Enter unexpectedly create a new shape or terminate editing when it should insert a newline.

Provide an explicit and intuitive way to finish editing, such as Escape, clicking outside, or a documented shortcut. Define the behavior carefully so users do not accidentally lose content.

Use a centralized text-layout approach compatible with the existing renderer. Do not fix multiline rendering by introducing a second incompatible text engine or adding arbitrary padding everywhere.

When a shape is selected, distinguish clearly between selecting the shape and editing its text.

# 3. BLANK SHAPES BY DEFAULT, EDITABLE ON DOUBLE-CLICK

Currently, shapes can appear to contain text automatically. Change the default behavior for ordinary manually created shapes.

Expected behavior:

1. The user selects a rectangle, ellipse, diamond or another shape.
2. The user draws it on the canvas.
3. The new shape is blank by default.
4. The user double-clicks inside it to begin text editing.
5. Text appears inside the shape with proper alignment and padding.
6. The shape expands or wraps content appropriately within reasonable limits.
7. Clicking outside ends editing without losing the text.

Do not apply this rule blindly to semantic architecture nodes, AI-generated diagrams, imported documents or existing saved boards that intentionally contain labels.

Preserve existing content and backward compatibility.

Support sensible defaults for manually created shapes while keeping AI-generated diagram nodes and semantic shapes functional.

# 4. IMPLEMENT PROPER CONNECTOR SNAPPING

This is one of the most important interaction defects.

Currently, selecting the arrow tool does not reliably attach an arrow to a shape when the pointer hovers over it. Users must manually position endpoints, which feels unintuitive.

Implement a proper connector creation state machine.

Expected workflow:

1. Activate the arrow/connector tool.
2. Move the pointer over a shape.
3. Show a visible attachment indicator or candidate anchor.
4. Begin the connector at the intended source point or source shape.
5. Move the pointer toward the target shape.
6. Highlight valid target anchors while hovering.
7. Snap the endpoint to the target shape when released.
8. Preserve the connection when either shape moves or resizes.

Support:

- Top, right, bottom and left anchors.
- Automatic anchor selection based on connection direction.
- Manual selection of anchors where useful.
- Straight and orthogonal routing, consistent with existing support.
- Arrowheads, line styles and edge colors.
- Connector labels.
- Multiple connectors attached to the same shape.
- Connections between nearby and overlapping shapes.
- Cancellation with Escape.
- Moving an endpoint to another shape.
- Disconnecting an endpoint deliberately.
- Correct hit testing at different zoom levels.
- Clear feedback when no valid target exists.

Do not rely on arbitrary pixel offsets or a large invisible hit area that causes incorrect attachment.

Implement deterministic anchor selection and connector geometry using the actual shape bounds.

Preserve the existing `-`, `--`, `-->` diagram-code semantics and edge styling. Do not introduce regressions in the parser or serializer.

# 5. FIX SHAPE GEOMETRY AND CORNER RADII

The current shape and arrow styling looks too rounded in places and visually inconsistent.

Establish a coherent geometry system.

- Use appropriate corner radii for rectangles, rounded rectangles, pills and other shape types.
- Keep ordinary rectangles relatively restrained rather than excessively rounded.
- Preserve circles and ellipses as true geometric shapes.
- Use consistent stroke widths and selection outlines.
- Keep arrowheads proportional to their line widths.
- Ensure connectors meet shape boundaries cleanly.
- Make resize handles and anchor indicators consistent.
- Keep node dimensions and text padding predictable.
- Avoid distorted geometry during resizing.
- Use consistent visual tokens rather than scattered arbitrary radius values.

Do not apply a single radius to every shape. Each semantic shape must retain its intended geometry.

# 6. REBUILD THE ICON PICKER AND ICON INSERTION EXPERIENCE

The screenshots show a searchable icon picker with categories, a grid of recognizable icons and keyboard navigation.

Inspect the current icon registry and UI before changing anything.

Implement or complete:

- A searchable icon picker.
- Useful category navigation.
- General-purpose icons.
- Technical and developer-tool logos.
- Cloud-provider and infrastructure icons.
- Custom icons if supported by the current architecture.
- Keyboard navigation and Enter to insert.
- Loading, empty and unknown-icon states.
- Correct previews and insertion.
- Appropriate sizing, alignment and hit testing.
- Consistent rendering in the editor and exported diagrams.

Clicking an icon should insert it as an editable canvas element at a sensible position or through the existing insertion workflow.

Do not merely show icons in a palette. Verify that insertion, selection, dragging, resizing where supported, duplication, deletion, persistence and export work.

Prefer the existing icon registry and existing assets. Reuse the real technical SVG icons already present wherever possible.

Do not introduce arbitrary letter badges as substitutes for available icons.

Do not download assets from unauthorized sources. Ensure SVG assets are handled safely.

# 7. IMPLEMENT OBJECT ORDERING AND CONTEXT MENUS

The screenshots show a context menu with object-order actions:

- Bring to front.
- Send to back.
- Bring forward.
- Send backward.
- Copy/paste actions.
- Export selection.

Inspect the existing document model to determine how draw order is currently represented.

Implement missing object-order operations through the existing state and history architecture.

Requirements:

- Support selection of one or multiple elements.
- Preserve relative order of selected elements where appropriate.
- Ensure ordering affects actual rendering and hit testing.
- Make ordering undoable and redoable.
- Preserve ordering after saving and reloading.
- Avoid changing connector attachment semantics when changing visual order.
- Ensure keyboard shortcuts do not conflict with text editing or browser shortcuts.
- Use consistent menu placement, keyboard navigation and dismissal behavior.

If an operation already exists, fix its UI integration or bugs instead of implementing it twice.

# 8. MAKE THE DARK THEME LOOK PROFESSIONAL

The current dark theme looks poor and needs a complete visual-system review.

Do not solve this by simply changing the background to a different shade of black.

Create a cohesive dark design system with semantic tokens for:

- Application background.
- Canvas background.
- Panels and popovers.
- Toolbar surfaces.
- Borders and dividers.
- Primary and secondary text.
- Muted labels.
- Accent color.
- Selection outlines.
- Connector hover states.
- Focus indicators.
- Success, warning and error states.
- Disabled controls.
- Shadows and overlays.

Use a restrained neutral palette with clear visual hierarchy.

Improve:

- Toolbar spacing and alignment.
- Icon size and stroke consistency.
- Button dimensions and hit areas.
- Panel borders and shadows.
- Popover positioning.
- Search input styling.
- Category rows and icon grids.
- Contextual toolbars.
- Selection handles.
- Hover and active states.
- Keyboard shortcut hints.
- Empty-canvas messaging.
- Loading indicators.
- Error feedback.

The canvas should remain visually quiet so diagrams stand out. Panels must be distinguishable from the canvas without excessive borders or heavy shadows.

Do not use bright accents everywhere. Reserve them for selection, active tools, focus and primary actions.

If the app supports light mode, preserve it and use shared semantic tokens rather than hardcoding colors throughout the components.

Ensure sufficient contrast and visible focus indicators.

# 9. REFACTOR THE TOOLBAR AND INTERACTION MODEL

Create a consistent interaction model for all existing tools.

Audit and improve:

- Selection tool.
- Rectangle and other shape tools.
- Ellipse tool.
- Arrow and connector tools.
- Line tool.
- Freehand drawing.
- Text tool.
- Icon insertion.
- Comments.
- AI diagram generation.
- Zoom controls.
- Contextual formatting controls.

Every tool should have a clear active state, sensible cursor, discoverable shortcut and predictable cancellation behavior.

Use reusable toolbar components where appropriate.

Avoid duplicated event handlers and conflicting global keyboard listeners.

Ensure keyboard shortcuts behave correctly when the user is editing text or typing into inputs.

Support Escape to cancel temporary actions and return to a safe interaction state.

Improve pointer handling for mouse, trackpad and touch where supported.

Avoid stale closures, accidental duplicate event listeners and state transitions that leave the editor stuck in a drawing or editing mode.

# 10. SMOOTH UX AND POLISHED INTERACTIONS

The application should feel responsive and deliberate.

Improve:

- Hover feedback.
- Active-tool feedback.
- Dragging and resizing.
- Selection and deselection.
- Snapping previews.
- Connector anchor previews.
- Inline text editing.
- Contextual toolbars.
- Menus and popovers.
- Undo/redo feedback.
- Saving indicators.
- Error and recovery states.
- Keyboard navigation.
- Focus management.

Use restrained transitions for menus, toolbars and panels where they improve clarity.

Do not animate geometry in ways that make drawing or dragging feel delayed.

Avoid unnecessary rerenders, full-scene recomputation and expensive layout work during pointer movement.

Preserve pointer responsiveness and existing board state.

# 11. AUDIT THE ENTIRE EXISTING CANVAS ARCHITECTURE

Inspect the actual implementation before choosing a target design.

Identify duplication and bugs across:

- Canvas rendering.
- Coordinate transforms.
- Shape geometry.
- Text measurement.
- Text editing.
- Hit testing.
- Connector routing.
- Selection.
- Dragging and resizing.
- Toolbar state.
- Keyboard shortcuts.
- History and undo/redo.
- Icon insertion.
- Layer ordering.
- Persistence.
- Export.

Refactor shared logic into well-defined abstractions only where the existing architecture benefits.

Rendering, hit testing and connector attachment should use consistent geometry contracts.

User interactions must update state through the existing state-management and history systems rather than bypassing them.

Do not replace the canvas library or rewrite the entire renderer without demonstrating why the current architecture cannot support the required behavior.

Preserve saved-board compatibility, the existing LangGraph pipeline and all working AI-provider integrations.

Do not regress the diagram-code fixes or any completed export work.

# 12. TEST EVERYTHING IN A REAL BROWSER

Unit tests alone are insufficient.

Inspect the existing browser-test setup and run the application locally. Use the existing Playwright infrastructure if available.

Add and execute tests for:

1. Draw a blank rectangle.
2. Double-click the rectangle and enter multiline text.
3. Edit existing text without accidentally moving the shape.
4. Resize a shape containing multiline text.
5. Draw an ellipse and a diamond.
6. Create a connector by snapping to two shapes.
7. Move and resize connected shapes.
8. Change connector endpoints.
9. Insert an icon from the icon picker.
10. Search and navigate icon categories.
11. Change the order of overlapping objects.
12. Undo and redo layer changes.
13. Save and reload the board.
14. Export diagrams containing icons, text and connectors.
15. Test long labels and Unicode.
16. Zoom and pan while preserving interaction accuracy.
17. Cancel drawing and editing operations using Escape.
18. Test keyboard shortcuts while editing text.
19. Test context menus and outside-click dismissal.
20. Verify light/dark theme consistency where applicable.

Capture screenshots before and after changes where feasible.

Use actual browser interactions and inspect rendered output. Do not claim a feature works simply because its component renders.

If browser testing is blocked by authentication or unavailable services, document the exact limitation and complete all other feasible verification.

# 13. IMPLEMENTATION ORDER

Work incrementally in this order:

P0 — Fix multiline text, editing behavior, shape defaults and connector snapping.

P1 — Fix shape geometry, icon insertion and object ordering.

P2 — Refactor the dark theme, toolbars, menus and interaction feedback.

P3 — Consolidate geometry, event handling, history integration and rendering contracts.

P4 — Improve performance, accessibility and maintainability.

P5 — Complete regression testing, browser verification and documentation.

If inspection reveals a more severe data-integrity or security problem, address it appropriately without abandoning the core UX work.

# 14. REQUIRED COMPLETION REPORT

Update existing project documentation rather than creating duplicate reports unnecessarily.

At completion, report:

- What was already implemented before this task.
- What was newly implemented.
- Which architectural issues were fixed.
- Which text-editing and connector behaviors now work.
- Which shapes and icons were tested.
- Whether object ordering persists and supports undo/redo.
- What changed in the dark theme and toolbar.
- Browser tests actually executed.
- Unit tests, lint, type checking and production build results.
- Any remaining bugs or blocked features.
- Files and subsystems changed.

Do not claim full Eraser parity without evidence.

Do not commit or deploy.

## FINAL EXECUTION INSTRUCTION

Start by examining the current repository, Git diff, existing feature matrix, recent implementation changes and available skills.

Create a short, evidence-based implementation plan, then execute it.

Do not stop after the plan. Do not repeat work that is already complete. Do not weaken tests. Do not overwrite existing user changes. Implement the highest-priority fixes, test them in the real browser and continue until the scoped refactor is complete or a genuine blocker is reached.