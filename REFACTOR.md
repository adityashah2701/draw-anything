# Draw Anything — Full Architecture & AI Diagram Engine Refactor

You are the principal software architect, reverse engineer, senior graphics-engine engineer, and AI systems engineer responsible for transforming my existing **Draw Anything** project into a polished, production-quality diagramming platform comparable to Eraser.io.

This is a **full refactoring and redesign task**, not a superficial UI update or a greenfield rewrite.

## 1. Enter the Project and Understand Everything First

Before making changes:

- Explore the entire repository, monorepo structure, package manifests, application entry points, canvas implementation, rendering engine, state management, persistence, AI integrations, diagram generation, text handling, connectors, and existing tests.
- Trace the complete lifecycle of a diagram: user prompt → AI provider → generated diagram representation → parsing → layout → canvas objects → rendering → editing → serialization → reload.
- Identify duplicated logic, architectural bottlenecks, race conditions, incorrect assumptions, legacy implementations, dead code, and hidden bugs.
- Inspect Git history and existing conventions where useful.
- Run the existing application and relevant tests. Reproduce existing problems before attempting to fix them.
- Do not assume that existing architecture is correct. Challenge it with evidence from the code.

**Do not start randomly editing files.** First establish how the application actually works and identify the root causes of its limitations.

## 2. Use Skills and Reverse Engineering Tools

Use the available skills aggressively.

1. Use the **Superpowers Brainstorming** skill to investigate requirements, explore alternative designs, and establish a coherent target architecture.
2. Find, inspect, and use the **Reverse Engineering Anything** skill or the closest available equivalent. Follow its actual instructions.
3. Discover relevant installed skills and available MCP tools. If a required skill is missing, search for a suitable skill through the supported discovery or installation mechanism, inspect its contents, and install it only when appropriate and permitted.
4. Use additional relevant skills for architecture design, frontend engineering, TypeScript, debugging, testing, performance profiling, UI/UX, and code review.
5. Use parallel agents for independent audits when supported, but establish one shared architecture and avoid conflicting edits.
6. Review the repository's actual implementation against expected canvas and diagram-editor behavior.

Do not pretend to have used a skill, tool, or repository that you could not access. If something is unavailable, use the best available alternative and document the limitation.

Reference implementation to reverse-engineer:

https://github.com/morluto/rea.git

Clone or inspect the repository using the available Git tools. Study its actual source code, canvas architecture, interactions, rendering, object models, and relevant features. Compare its implementation with Draw Anything and extract applicable engineering patterns.

The goal is to understand and reproduce desirable behavior through our own maintainable implementation, not blindly copy code or assume the reference implements every feature.

## 3. Create a Real Refactoring Plan

Before implementation, produce a concise but technically meaningful plan covering:

- Current architecture and discovered problems.
- Root causes of AI diagram and canvas failures.
- Target architecture and key design decisions.
- Proposed modules, interfaces, and data flow.
- Migration strategy and backward compatibility.
- Test strategy and measurable acceptance criteria.
- Implementation phases and dependencies.

Prioritize foundational problems before cosmetic improvements.

After creating the plan, **continue into implementation without waiting for me to approve every phase**. Ask a question only when a genuinely blocking decision cannot be reasonably resolved from the codebase or project requirements.

Do not stop after producing a report, architecture proposal, checklist, mockup, or implementation plan.

## 4. Redesign the Diagram-as-Code Engine

This is one of the most important parts of the refactor.

Currently, diagram-as-code generation and rendering have inconsistencies, especially around text inside shapes, ordinary text objects, and complex diagrams.

Redesign the pipeline so AI-generated diagrams become reliable, editable, correctly positioned canvas objects.

The engine should support, where appropriate:

- System architecture diagrams.
- Software architecture and infrastructure diagrams.
- Flowcharts and decision trees.
- Mind maps and concept maps.
- Block diagrams.
- Sequence diagrams.
- Entity relationship diagrams.
- Network diagrams.
- Process workflows and data-flow diagrams.

Investigate whether the current implementation should be improved or replaced with a typed intermediate representation (IR). Prefer a structured, validated diagram model over fragile string manipulation or loosely defined AI output.

Establish a clean pipeline:

**Natural-language prompt → structured diagram specification → validation and normalization → semantic layout → geometry calculation → canvas rendering → editable diagram objects.**

Requirements:

- Use schemas and strict validation for AI-generated structures.
- Support nodes, edges, ports, groups, labels, icons, metadata, styles, and layout constraints.
- Define stable identifiers and explicit object types.
- Separate diagram semantics, layout, geometry, and rendering.
- Use deterministic rendering for identical validated inputs.
- Support nested groups and container relationships where appropriate.
- Preserve connections when nodes move or resize.
- Prevent malformed output, overlapping labels, missing edges, invalid coordinates, and inconsistent object dimensions.
- Handle partial or invalid AI responses gracefully.
- Provide useful validation errors and a repair/retry path rather than silently rendering broken diagrams.
- Preserve compatibility with existing saved diagrams through migrations or adapters.

Do not create a giant monolithic parser or renderer. Use clear modules and interfaces.

## 5. Fix Text Rendering and Editing at the Foundation

Text is a critical subsystem, not an afterthought.

Audit and fix text behavior across every supported shape and ordinary text object.

Investigate:

- Text measurement and font metrics.
- Horizontal and vertical alignment.
- Padding and inner content bounds.
- Wrapping and line height.
- Dynamic resizing and auto-sizing.
- Text overflow and clipping.
- Font size, weight, family, and style.
- Multiline editing.
- Selection and caret positioning.
- Keyboard input and IME behavior.
- Text editing overlays versus canvas rendering.
- Zoom-independent text editing.
- Hit testing and selection.
- Serialization and restoration.
- Text updates after shape resizing.
- Browser font loading and measurement inconsistencies.

A shape's text, standalone text objects, and connector labels should share consistent typography and editing primitives wherever practical.

Text must remain readable and correctly positioned at different zoom levels. Editing text must not unexpectedly move objects, alter dimensions, break connections, or corrupt diagram state.

Create regression tests for these issues instead of fixing individual visual symptoms with arbitrary offsets.

## 6. Make AI Diagram Generation Intelligent

Improve the complete AI diagram generation workflow using the project's existing Groq integration.

First inspect the current provider implementation, supported models, structured-output capabilities, retry behavior, prompt construction, token limits, and error handling.

Then implement a reliable provider abstraction so model configuration is not scattered across canvas components.

The AI should understand the user's intent and generate visually coherent, technically meaningful diagrams.

Examples of desired requests:

- "Create a beautiful system architecture for a Next.js application using PostgreSQL, Redis, S3, and a CI/CD pipeline."
- "Create a flowchart for user authentication, including success, failure, and retry paths."
- "Create a mind map explaining operating-system process scheduling."
- "Create a block diagram for an embedded system with an Arduino, sensors, relay, and actuator."
- "Create a cloud infrastructure diagram with clear trust boundaries and network connections."

Implement, where appropriate:

- Intent detection and diagram-type selection.
- Context-aware prompt construction.
- Structured outputs validated against the diagram schema.
- Layout-aware generation.
- Semantic relationships and meaningful labels.
- Correct edge directions and arrowheads.
- Sensible spacing, alignment, hierarchy, and grouping.
- Provider timeout handling, cancellation, and retry limits.
- Safe recovery from malformed or truncated responses.
- Clear loading, error, and regeneration states.
- Preservation of the user's existing canvas when generation fails.
- Support for refining or regenerating a diagram without unnecessarily destroying unrelated work.

Use models and parameters supported by the actual provider and available credentials. Verify current model availability instead of hardcoding an assumed model.

**Do not rely on the LLM alone to position every object.** Let AI define semantic content and constraints; use deterministic layout algorithms and geometry rules to produce the final arrangement.

## 7. Add Proper Icons and Visual Semantics

The current application lacks proper diagram icons.

Design a consistent icon system for technical diagrams.

Support appropriate icons for:

- Cloud providers and infrastructure services.
- Databases, caches, storage, and queues.
- Frontend applications and backend services.
- APIs, authentication, gateways, and load balancers.
- CI/CD, source control, and deployment.
- Networking, security, monitoring, and observability.
- Embedded hardware, sensors, and controllers where applicable.

Investigate suitable icon libraries and vendor icon packs. Reuse existing dependencies if practical and introduce new ones only when justified.

Requirements:

- Icons must render consistently inside nodes at different zoom levels.
- Maintain aspect ratio and predictable sizing.
- Support icon-plus-label layouts and configurable placement.
- Prevent broken icon references and missing assets.
- Use appropriate fallbacks for unavailable icons.
- Keep icon metadata serializable and restorable.
- Avoid embedding huge base64 assets unnecessarily.
- Avoid using arbitrary emoji as a substitute for a coherent technical icon system.

Support custom icons and extensible icon registries where practical.

## 8. Build Beautiful Layouts, Not Merely Valid Diagrams

The current architecture diagram demonstrates why a layout engine is needed: connectors overlap labels, multiple lines converge around nodes, relationships are difficult to follow, and the visual hierarchy is weak.

Refactor the layout system to produce clean, presentation-ready diagrams.

Investigate suitable algorithms and libraries, including layered directed-graph layouts, hierarchical layouts, force-directed layouts, and tree layouts. Select algorithms according to diagram type and graph characteristics rather than using one layout for everything.

Where appropriate, use a layout engine such as ELK.js, Dagre, or another well-maintained solution after checking compatibility and licensing.

Implement:

- Automatic node positioning.
- Consistent spacing and alignment.
- Edge routing with orthogonal paths where appropriate.
- Ports and connection anchors.
- Arrowheads and directional semantics.
- Label placement that avoids collisions.
- Grouping and visual hierarchy.
- Fit-to-content and fit-to-viewport.
- Stable layouts and predictable regeneration.
- Manual positioning that is not unexpectedly destroyed.
- Re-layout controls when users explicitly request them.

Avoid excessive crossings, overlapping edges, text collisions, and connectors passing through unrelated nodes wherever feasible.

Do not add a new dependency simply because it is popular. Validate that it integrates with the existing rendering architecture.

## 9. Refactor the Entire Canvas Architecture

Audit the canvas implementation and improve it to provide a coherent, professional diagram-editor experience comparable to Eraser.io.

Use the reference repository to guide the audit, but verify each feature against the actual source code.

Review and implement applicable improvements for:

- Pan and zoom.
- Selection, multi-selection, and marquee selection.
- Dragging, resizing, and rotation where supported by the object model.
- Shape creation and editing.
- Connectors, ports, and automatic edge attachment.
- Text editing.
- Grouping and ungrouping.
- Copy, paste, duplicate, and delete.
- Undo and redo.
- Keyboard shortcuts.
- Alignment and distribution.
- Snapping and alignment guides.
- Grid visibility and snapping.
- Context menus.
- Layers and z-order.
- Canvas navigation and minimap where useful.
- Import, export, and persistence.
- Autosave and recovery.
- Responsive toolbars and panels.
- Smooth interactions on large diagrams.

Do not assume that every feature must be implemented identically to the reference. Prioritize features that fit Draw Anything's existing product and architecture.

Preserve working functionality. Refactor incrementally, avoid breaking saved documents, and eliminate duplicated interaction logic.

## 10. Fix State Management, History, and Performance

Investigate the existing canvas state model and introduce a coherent approach to document state and history.

Requirements:

- A single authoritative diagram document model.
- Predictable state transitions.
- Correct undo/redo behavior for compound actions.
- Efficient updates during dragging and resizing.
- No unnecessary rerenders of the entire canvas for every pointer movement.
- Stable object identity.
- Safe asynchronous AI operations.
- No stale state overwrites after concurrent edits or generation requests.
- Consistent persistence and serialization.
- Performance profiling on realistic, larger diagrams.

Use spatial indexing, viewport culling, memoization, batching, or other optimizations only where profiling shows they are useful.

Do not sacrifice correctness for premature optimization.

## 11. UI/UX Redesign

Redesign the diagram creation experience to feel modern, intentional, and polished.

Target qualities:

- A clean infinite canvas.
- Minimal but discoverable controls.
- Clear object-selection states.
- A useful AI prompt and generation experience.
- Consistent node styling and typography.
- Carefully chosen colors and spacing.
- High-quality architecture diagram templates.
- Useful empty states and loading states.
- Accessible controls and keyboard navigation.
- A coherent light and dark theme.
- No visual clutter or overlapping toolbars.

The generated diagrams should look like professionally designed technical documentation, not randomly placed colored rectangles connected by lines.

Create reusable design tokens and components instead of introducing inconsistent one-off styling.

Do not redesign the UI in isolation from the engine. The UI, object model, layout engine, and editing behavior must work together.

## 12. Engineering Quality and Safety

Throughout the refactor:

- Follow existing project conventions unless there is a clear reason to change them.
- Use strict typing where the project supports it.
- Avoid unnecessary `any`, unsafe casts, duplicated implementations, and oversized components.
- Add unit tests for parsers, schemas, geometry, routing, and serialization.
- Add integration tests for diagram generation and editing.
- Add regression tests for text, connectors, undo/redo, and persistence.
- Add end-to-end tests for important user workflows when feasible.
- Run linting, type checking, tests, and production builds.
- Fix regressions introduced by your changes.
- Inspect browser console errors and relevant performance traces.
- Keep secrets and API keys on the server; never expose Groq credentials in client bundles.
- Avoid logging sensitive prompts or credentials unnecessarily.
- Document architectural decisions and migration requirements.

Do not silently remove existing functionality or replace working modules without understanding their dependencies.

Do not claim that a test passed unless you actually ran it.

## 13. Required Implementation Workflow

Work in the following order, adjusting the sequence when repository evidence justifies it:

**Phase A — Discovery**
Inspect the repository, map the architecture, reproduce bugs, and inspect the reference project and relevant skills.

**Phase B — Architecture**
Use brainstorming to evaluate alternatives. Define the target architecture, document model, diagram schema, migration plan, and acceptance criteria.

**Phase C — Foundations**
Fix core state management, object identity, serialization, text primitives, and shared geometry.

**Phase D — Diagram Engine**
Refactor parsing, validation, AI output normalization, layout, edge routing, icon support, and rendering.

**Phase E — Canvas**
Improve editing interactions, selection, history, snapping, shortcuts, and other applicable features identified in the audit.

**Phase F — AI Experience**
Improve Groq integration, prompt construction, structured generation, error handling, regeneration, and layout quality.

**Phase G — UI/UX**
Polish the canvas, toolbars, node styles, typography, themes, and generation experience.

**Phase H — Verification**
Run tests, type checks, lint, production builds, and realistic manual or automated diagram scenarios. Fix failures before declaring completion.

Commit or checkpoint logical stages when the environment and repository workflow support it. Do not overwrite unrelated user changes.

## 14. Definition of Done

The refactor is not complete merely because the application compiles.

Verify that:

1. AI can generate coherent system architecture diagrams with meaningful nodes, icons, labels, and correctly routed connectors.
2. Flowcharts correctly represent branches, decisions, and directed transitions.
3. Mind maps have clear hierarchy and readable layouts.
4. Block diagrams show clean component relationships.
5. Shape text and standalone text remain correct while editing, resizing, zooming, saving, and reloading.
6. Diagram objects can be edited individually after AI generation.
7. Invalid AI output does not corrupt the canvas.
8. Undo and redo restore the correct document state.
9. Existing saved documents remain usable or are migrated safely.
10. Important canvas interactions remain smooth and predictable.
11. The icon system supports fallbacks and consistent rendering.
12. Automated tests cover the most important engine and editing regressions.
13. The application passes the relevant checks that can actually be run in the environment.

Use representative, nontrivial diagrams rather than testing only a three-node example.

## 15. Final Report

When implementation is complete, provide:

- The original architectural problems discovered.
- The root causes confirmed through code inspection.
- The target architecture and key design decisions.
- The files and modules changed.
- Features implemented and existing bugs fixed.
- Skills and reference resources actually used.
- Tests, builds, and checks executed, including failures.
- Remaining limitations and technical debt.
- Any setup steps or migrations required.

Distinguish implemented features from planned or partially implemented features.

### Final instruction

Take ownership of the entire refactoring process. Investigate deeply, challenge weak architectural decisions, use available skills, plan carefully, implement systematically, and verify the result.

**I want a genuinely better Draw Anything engine—not just a prettier canvas or a wrapper around an LLM.** Prioritize correctness, maintainability, visual quality, extensibility, and a reliable diagram-as-code pipeline.

Begin by inspecting the actual repository and the available skills. Then proceed through discovery, planning, implementation, and verification.