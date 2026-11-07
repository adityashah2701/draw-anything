# Project Structure & Architecture Guide

A comprehensive, in-depth directory tree and architectural reference for **Draw Anything** — a production-grade, collaborative AI diagramming platform.

---

## 1. High-Level System Architecture

The project is structured with a strict separation of concerns across multiple layers:

| Layer / Directory | Primary Technologies | Core Responsibility |
| :--- | :--- | :--- |
| **`app/`** | Next.js 15 App Router, React 19 | Route definitions, page layouts, API endpoints (`/api/ai/canvas-agent`, `/api/liveblocks-auth`), and metadata. |
| **`core/`** | TypeScript, Pure Math / Geometry | Canvas engine primitives: orthogonal routing, hit testing, bounding boxes, frame hierarchies, layout engines, and theme math. Zero UI dependency. |
| **`features/whiteboard/`**| React, Canvas / SVG rendering, Liveblocks | Interactive whiteboard interface: pointer event loop, tools, overlays, zoom/pan viewport, inspector, and file exports (SVG/PNG/PDF). |
| **`features/ai/`** | LangChain, Vercel AI SDK, Multi-LLM | Diagram generation engine, multi-provider abstraction (Claude, OpenAI, Gemini, Groq), system prompts, and canvas compiler. |
| **`features/canvas-tools/`** | TypeScript, Tool Registry | Server & client AI canvas editing tools (create, connect, inspect, rearrange, code sync). |
| **`features/diagram-code/`** | Custom DSL Parser, AST Compiler | Bidirectional DSL allowing diagrams to be written and edited as code (Eraser-like diagram language). |
| **`convex/`** | Convex Backend, TypeScript | Real-time database and serverless functions (boards, user authentication, comments, org memberships). |
| **`components/`** | Tailwind CSS v4, Radix UI, Lucide | Design system components, desktop/mobile navigation bars, sidebars, and dialog modals. |
| **`tests/`** | Playwright, Vitest (browser harness) | End-to-end browser fixtures, mock backend providers, and UI test harnesses. |
| **`lib/`** | Utility functions, CSP, Authz | Cross-cutting utilities, room authorization logic, security policies, and SEO builders. |
| **`docs/`** | Markdown specifications | Architecture blueprints, benchmark reports, and refactoring roadmaps. |

---

## 2. In-Depth Folder Structure Tree

```
draw-anything/
├── .agents
│   ├── original_prompt.md
│   └── skills
│       ├── audit-codebase
│       │   ├── LICENSE
│       │   ├── README.md
│       │   ├── SKILL.md
│       │   ├── frameworks
│       │   │   ├── django.md
│       │   │   ├── fastapi.md
│       │   │   ├── nestjs.md
│       │   │   └── nextjs.md
│       │   ├── technologies
│       │   │   ├── auth0.md
│       │   │   ├── firebase_firestore.md
│       │   │   └── supabase.md
│       │   └── vulnerabilities
│       │       ├── authentication_jwt.md
│       │       ├── broken_function_level_authorization.md
│       │       ├── business_logic.md
│       │       ├── csrf.md
│       │       ├── header_injection.md
│       │       ├── http_request_smuggling.md
│       │       ├── idor.md
│       │       ├── information_disclosure.md
│       │       ├── insecure_deserialization.md
│       │       ├── insecure_file_uploads.md
│       │       ├── llm_prompt_injection.md
│       │       ├── mass_assignment.md
│       │       ├── nosql_injection.md
│       │       ├── open_redirect.md
│       │       ├── path_traversal_lfi_rfi.md
│       │       ├── prototype_pollution.md
│       │       ├── race_conditions.md
│       │       ├── rce.md
│       │       ├── sql_injection.md
│       │       ├── ssrf.md
│       │       ├── ssti.md
│       │       ├── subdomain_takeover.md
│       │       ├── xss.md
│       │       └── xxe.md
│       ├── aws-diagrams
│       │   └── SKILL.md
│       ├── azure-diagrams
│       │   └── SKILL.md
│       ├── bicep-diagrams
│       │   └── SKILL.md
│       ├── eraser-diagrams
│       │   ├── SKILL.md
│       │   └── references
│       │       ├── architecture-syntax.md
│       │       ├── bpmn-syntax.md
│       │       ├── erd-syntax.md
│       │       ├── flowchart-syntax.md
│       │       └── sequence-syntax.md
│       ├── reverse-engineer-anything
│       │   ├── SKILL.md
│       │   └── references
│       │       ├── android-applications.md
│       │       ├── connection-and-recovery.md
│       │       ├── evidence-workflows.md
│       │       ├── javascript-applications.md
│       │       ├── native-and-artifacts.md
│       │       └── runtime-observation.md
│       └── terraform-diagrams
│           └── SKILL.md
├── .claude
│   ├── settings.local.json
│   └── skills
│       ├── audit-codebase
│       │   ├── LICENSE
│       │   ├── README.md
│       │   ├── SKILL.md
│       │   ├── frameworks
│       │   │   ├── django.md
│       │   │   ├── fastapi.md
│       │   │   ├── nestjs.md
│       │   │   └── nextjs.md
│       │   ├── technologies
│       │   │   ├── auth0.md
│       │   │   ├── firebase_firestore.md
│       │   │   └── supabase.md
│       │   └── vulnerabilities
│       │       ├── authentication_jwt.md
│       │       ├── broken_function_level_authorization.md
│       │       ├── business_logic.md
│       │       ├── csrf.md
│       │       ├── header_injection.md
│       │       ├── http_request_smuggling.md
│       │       ├── idor.md
│       │       ├── information_disclosure.md
│       │       ├── insecure_deserialization.md
│       │       ├── insecure_file_uploads.md
│       │       ├── llm_prompt_injection.md
│       │       ├── mass_assignment.md
│       │       ├── nosql_injection.md
│       │       ├── open_redirect.md
│       │       ├── path_traversal_lfi_rfi.md
│       │       ├── prototype_pollution.md
│       │       ├── race_conditions.md
│       │       ├── rce.md
│       │       ├── sql_injection.md
│       │       ├── ssrf.md
│       │       ├── ssti.md
│       │       ├── subdomain_takeover.md
│       │       ├── xss.md
│       │       └── xxe.md
│       ├── aws-diagrams
│       │   └── SKILL.md
│       ├── azure-diagrams
│       │   └── SKILL.md
│       ├── bicep-diagrams
│       │   └── SKILL.md
│       ├── eraser-diagrams
│       │   ├── SKILL.md
│       │   └── references
│       │       ├── architecture-syntax.md
│       │       ├── bpmn-syntax.md
│       │       ├── erd-syntax.md
│       │       ├── flowchart-syntax.md
│       │       └── sequence-syntax.md
│       ├── reverse-engineer-anything
│       │   ├── SKILL.md
│       │   └── references
│       │       ├── android-applications.md
│       │       ├── connection-and-recovery.md
│       │       ├── evidence-workflows.md
│       │       ├── javascript-applications.md
│       │       ├── native-and-artifacts.md
│       │       └── runtime-observation.md
│       └── terraform-diagrams
│           └── SKILL.md
├── .env.local
├── .gitignore
├── AGENTS.md
├── LICENSE
├── MASTER_PROMPT.md
├── README.md
├── app
│   ├── (main-page)
│   │   ├── billing
│   │   │   └── page.tsx
│   │   ├── create-org
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── actions
│   │   └── organization.ts
│   ├── api
│   │   ├── ai
│   │   │   └── canvas-agent
│   │   │       └── route.ts
│   │   └── liveblocks-auth
│   │       └── route.ts
│   ├── apple-icon.png
│   ├── favicon.ico
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx
│   ├── manifest.ts
│   ├── not-found.tsx
│   ├── og.png
│   │   └── route.tsx
│   ├── robots.ts
│   ├── sitemap.ts
│   └── whiteboard
│       └── [id]
│           ├── error.tsx
│           ├── layout.tsx
│           └── page.tsx
├── claude.md
├── components
│   ├── layout
│   │   ├── navbar
│   │   │   ├── desktop-navbar.tsx
│   │   │   ├── mobile-navbar.tsx
│   │   │   └── navbar.tsx
│   │   └── sidebar
│   │       ├── app-sidebar.tsx
│   │       └── sidebar-view.tsx
│   ├── seo
│   │   └── json-ld.tsx
│   ├── shared
│   │   ├── empty-sheet.tsx
│   │   ├── loader.tsx
│   │   ├── logo-mark.tsx
│   │   └── section-label.tsx
│   └── ui
│       ├── avatar.tsx
│       ├── button.tsx
│       ├── command.tsx
│       ├── context-menu.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── kbd.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sidebar.tsx
│       ├── skeleton.tsx
│       ├── sonner.tsx
│       ├── switch.tsx
│       ├── toggle-group.tsx
│       ├── toggle.tsx
│       └── tooltip.tsx
├── components.json
├── convex
│   ├── README.md
│   ├── _generated
│   │   ├── api.d.ts
│   │   ├── api.js
│   │   ├── dataModel.d.ts
│   │   ├── server.d.ts
│   │   └── server.js
│   ├── aiConversation.ts
│   ├── aiMemory.ts
│   ├── auth.config.ts
│   ├── comments.ts
│   ├── http.ts
│   ├── lib
│   │   ├── access.ts
│   │   ├── accessRules.ts
│   │   └── commentRules.ts
│   ├── schema.ts
│   ├── tsconfig.json
│   ├── users.ts
│   └── whiteboard.ts
├── core
│   ├── anchors
│   │   ├── anchor-geometry.ts
│   │   ├── generate-anchors.ts
│   │   └── ports.ts
│   ├── arrow
│   │   ├── connector-router.ts
│   │   └── use-arrow-connections.ts
│   ├── collision
│   │   └── aabb.ts
│   ├── color
│   │   ├── adaptive-color.ts
│   │   ├── contrast.ts
│   │   └── named-colors.ts
│   ├── frames
│   │   ├── containment.ts
│   │   ├── frame-api.ts
│   │   ├── frame-index.ts
│   │   ├── frame-model.ts
│   │   ├── paint-order.ts
│   │   ├── payload.ts
│   │   ├── test-box.ts
│   │   └── test-helpers.ts
│   ├── geometry
│   │   └── box.ts
│   ├── groups
│   │   ├── clone.ts
│   │   ├── group-commands.ts
│   │   ├── group-index.ts
│   │   ├── order.ts
│   │   ├── patch.ts
│   │   ├── test-helpers.ts
│   │   ├── transform.ts
│   │   ├── units.ts
│   │   └── visibility.ts
│   ├── icons
│   │   ├── catalog.json
│   │   ├── custom-icon.ts
│   │   ├── draw.ts
│   │   ├── glyphs-extra.ts
│   │   ├── glyphs.ts
│   │   ├── library.ts
│   │   ├── logos.ts
│   │   ├── path-data.ts
│   │   └── registry.ts
│   ├── layout
│   │   ├── __fixtures__
│   │   │   └── legacy-corpus.golden.json
│   │   ├── elk
│   │   │   ├── gate.ts
│   │   │   └── loader.ts
│   │   ├── engines
│   │   │   ├── bpmn
│   │   │   │   └── index.ts
│   │   │   ├── er
│   │   │   │   └── index.ts
│   │   │   ├── freeform
│   │   │   │   └── index.ts
│   │   │   ├── mind-map
│   │   │   │   └── index.ts
│   │   │   ├── sequence
│   │   │   │   └── index.ts
│   │   │   └── uml
│   │   │       └── index.ts
│   │   ├── flags.ts
│   │   ├── kit
│   │   │   ├── diff.ts
│   │   │   ├── fixed.ts
│   │   │   ├── free-slot.ts
│   │   │   ├── graph.ts
│   │   │   ├── layered-order.ts
│   │   │   ├── layered.ts
│   │   │   ├── natural.ts
│   │   │   ├── overlap.ts
│   │   │   ├── rect.ts
│   │   │   └── stats.ts
│   │   ├── legacy-corpus.ts
│   │   ├── placement.ts
│   │   ├── record.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   ├── mindmap
│   │   └── tree-api.ts
│   ├── routing
│   │   ├── adjacency-map.ts
│   │   ├── congestion-map.ts
│   │   ├── connection-handles.ts
│   │   ├── crossing-minimizer.ts
│   │   ├── curve.ts
│   │   ├── endpoint-stubs.ts
│   │   ├── grid-route.ts
│   │   ├── lane-manager.ts
│   │   ├── obstacle-avoidance.ts
│   │   ├── obstacle-detector.ts
│   │   ├── orthogonal-router.ts
│   │   ├── parallel-edge-manager.ts
│   │   ├── path-cache.ts
│   │   ├── path-editing.ts
│   │   ├── path-normalizer.ts
│   │   ├── route-engine.ts
│   │   ├── routing-guards.ts
│   │   ├── routing-utils.ts
│   │   ├── segment-conflict-resolver.ts
│   │   ├── spatial-hash-grid.ts
│   │   └── types.ts
│   ├── shapes
│   │   ├── arrow
│   │   │   ├── anchors.ts
│   │   │   ├── arrow-utils.ts
│   │   │   ├── arrowhead.ts
│   │   │   ├── corner-radius.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── relations.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── base
│   │   │   ├── base-shape-definition.ts
│   │   │   ├── create-shape-definition.ts
│   │   │   ├── geometry-tokens.ts
│   │   │   ├── resize-box.ts
│   │   │   ├── shape-capability.ts
│   │   │   ├── shape-geometry-utils.ts
│   │   │   └── shape-label-renderer.ts
│   │   ├── bidirectional-arrow
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── capabilities
│   │   │   ├── connectable.ts
│   │   │   ├── labelable.ts
│   │   │   ├── movable.ts
│   │   │   ├── resizable.ts
│   │   │   └── rotatable.ts
│   │   ├── circle
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── diamond
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── ellipse
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── entity-table
│   │   │   ├── definition.ts
│   │   │   ├── layout.ts
│   │   │   └── rows.ts
│   │   ├── frame
│   │   │   ├── definition.ts
│   │   │   ├── interaction.ts
│   │   │   └── renderer.ts
│   │   ├── freehand
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── icon
│   │   │   ├── anchors.ts
│   │   │   ├── caption.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── lifeline
│   │   │   └── definition.ts
│   │   ├── line
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── mindmap-node
│   │   │   └── definition.ts
│   │   ├── outline
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── icon.tsx
│   │   │   ├── interaction.ts
│   │   │   ├── markers.ts
│   │   │   ├── path.ts
│   │   │   ├── renderer.ts
│   │   │   ├── types.ts
│   │   │   └── variants.ts
│   │   ├── pill
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── rectangle
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── register-shapes.ts
│   │   ├── resize-handle-hit.ts
│   │   ├── semantic-node
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── icon-tone.ts
│   │   │   ├── interaction.ts
│   │   │   ├── layout.ts
│   │   │   ├── renderer.ts
│   │   │   ├── selection.ts
│   │   │   ├── style.ts
│   │   │   └── types.ts
│   │   ├── shape-registry.ts
│   │   ├── shape-runtime.ts
│   │   ├── shape-tool-registry.ts
│   │   ├── structured
│   │   │   └── box-definition.ts
│   │   ├── text
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   ├── text-metrics.ts
│   │   │   └── types.ts
│   │   ├── triangle
│   │   │   ├── anchors.ts
│   │   │   ├── definition.ts
│   │   │   ├── geometry.ts
│   │   │   ├── interaction.ts
│   │   │   ├── renderer.ts
│   │   │   └── types.ts
│   │   ├── uml-classifier
│   │   │   ├── definition.ts
│   │   │   ├── layout.ts
│   │   │   └── members.ts
│   │   └── vocabulary
│   │       ├── entries.ts
│   │       ├── index.ts
│   │       └── types.ts
│   ├── snap
│   │   ├── alignment.ts
│   │   └── use-magnetic-snap.ts
│   ├── text
│   │   ├── baseline.ts
│   │   ├── estimate.ts
│   │   ├── inter-advances.ts
│   │   ├── label-layout.ts
│   │   ├── label-region.ts
│   │   ├── measure-context.ts
│   │   ├── node-size.ts
│   │   └── typography.ts
│   ├── theme
│   │   ├── render-theme.ts
│   │   └── selection-ink.ts
│   └── utils
│       └── distance.ts
├── docs
│   ├── agent-layout-audit.md
│   ├── architecture
│   │   ├── REFACTORING_CHANGELOG.md
│   │   ├── REFACTORING_PLAN.md
│   │   └── draw-anything-target-architecture.md
│   ├── audits
│   │   ├── dependency-upgrade-2026-10-16.md
│   │   ├── draw-anything-security-audit.md
│   │   └── eraser-feature-matrix.md
│   ├── design
│   │   ├── brand.md
│   │   └── system.md
│   ├── diagram-code
│   │   └── README.md
│   ├── plans
│   │   ├── 2026-10-14-reliability-and-ai-quality.md
│   │   ├── 2026-10-20-first-class-frames.md
│   │   ├── 2026-11-05-1345-feat-production-diagram-agent-plan.md
│   │   ├── 2026-11-06-phase-c-pluggable-layout-architecture.md
│   │   ├── 2026-11-07-session-handoff-and-agent-refactor.md
│   │   └── unified-agent.md
│   ├── refactor
│   │   └── implementation-report.md
│   ├── routing-audit.md
│   ├── superpowers
│   │   ├── notes
│   │   │   └── 2026-10-16-handoff-ai-shapes-colors.md
│   │   ├── plans
│   │   │   ├── 2026-10-15-layout-and-routing-plan.md
│   │   │   ├── 2026-10-15-text-foundation-plan.md
│   │   │   ├── 2026-10-16-canvas-ux-plan.md
│   │   │   └── 2026-10-16-icon-system-plan.md
│   │   ├── reports
│   │   │   ├── 2026-10-16-layout-benchmark.md
│   │   │   ├── ai-baseline-2026-11-05.md
│   │   │   ├── ai-builder-eval-2026-10-17.md
│   │   │   └── ai-eval-2026-10-17.md
│   │   └── specs
│   │       ├── 2026-10-15-layout-and-routing-design.md
│   │       ├── 2026-10-15-text-foundation-design.md
│   │       ├── 2026-10-16-ai-diagram-agent-design.md
│   │       ├── 2026-10-16-canvas-ux-design.md
│   │       ├── 2026-10-16-icon-system-design.md
│   │       ├── 2026-10-19-canvas-ai-tools-design.md
│   │       ├── 2026-10-19-groups-guides-precision-design.md
│   │       ├── 2026-10-19-semantic-node-design.md
│   │       └── 2026-10-20-diagram-language-design.md
│   └── testing
│       ├── canvas-ai-tools-tests.md
│       ├── canvas-regression-matrix.md
│       ├── export-test-report.md
│       ├── groups-guides-precision-tests.md
│       ├── semantic-node-tests.md
│       └── signed-in-smoke-test.md
├── eslint.config.mjs
├── features
│   ├── ai
│   │   ├── default-provider.ts
│   │   ├── diagram-agent
│   │   │   ├── builder
│   │   │   │   ├── icon-hints.ts
│   │   │   │   └── render-png.ts
│   │   │   ├── eval
│   │   │   │   ├── golden-prompts.ts
│   │   │   │   ├── rubric.ts
│   │   │   │   └── score.ts
│   │   │   ├── frame.ts
│   │   │   ├── profiles
│   │   │   │   └── index.ts
│   │   │   ├── prompt
│   │   │   │   ├── examples.ts
│   │   │   │   ├── icon-vocabulary.ts
│   │   │   │   ├── playbooks.ts
│   │   │   │   ├── prompt-context.ts
│   │   │   │   └── system-design.ts
│   │   │   ├── tools
│   │   │   │   ├── check-diagram.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── lint.ts
│   │   │   ├── transports
│   │   │   │   ├── create.ts
│   │   │   │   ├── fallback.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── native.ts
│   │   │   │   ├── text-protocol.ts
│   │   │   │   └── text.ts
│   │   │   └── types.ts
│   │   ├── nvidia-models.ts
│   │   ├── schemas.ts
│   │   ├── server
│   │   │   ├── canvas-compiler.ts
│   │   │   ├── errors.ts
│   │   │   ├── layout
│   │   │   │   ├── aesthetics.ts
│   │   │   │   ├── architecture-engine.ts
│   │   │   │   ├── benchmark
│   │   │   │   │   └── elk-placement.ts
│   │   │   │   ├── bus.ts
│   │   │   │   ├── channels.ts
│   │   │   │   ├── direction.ts
│   │   │   │   ├── edge-labels.ts
│   │   │   │   ├── family-placement.ts
│   │   │   │   ├── fixtures
│   │   │   │   │   ├── architecture.ts
│   │   │   │   │   ├── auth-flow.ts
│   │   │   │   │   ├── base.ts
│   │   │   │   │   ├── flowchart.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── mind-map.ts
│   │   │   │   │   └── stress.ts
│   │   │   │   ├── frame-constants.ts
│   │   │   │   ├── geometry.ts
│   │   │   │   ├── grid-placement.ts
│   │   │   │   ├── group-headings.ts
│   │   │   │   ├── group-separation.ts
│   │   │   │   ├── handle-selection.ts
│   │   │   │   ├── layered-order.ts
│   │   │   │   ├── layered-placement.ts
│   │   │   │   ├── metrics.ts
│   │   │   │   ├── pins.ts
│   │   │   │   ├── register-engines.ts
│   │   │   │   └── types.ts
│   │   │   ├── model-providers.ts
│   │   │   ├── request-guard.ts
│   │   │   ├── retry.ts
│   │   │   └── validation.ts
│   │   └── types.ts
│   ├── billing
│   │   └── components
│   │       ├── billing-page.tsx
│   │       └── pricing-modal.tsx
│   ├── canvas-tools
│   │   ├── agent
│   │   │   ├── client.ts
│   │   │   ├── format.ts
│   │   │   ├── groups.ts
│   │   │   ├── handler.ts
│   │   │   ├── history.ts
│   │   │   ├── images.ts
│   │   │   ├── prompt.ts
│   │   │   ├── report.ts
│   │   │   ├── run-agent.ts
│   │   │   ├── state-message.ts
│   │   │   ├── test-support.ts
│   │   │   ├── transport.ts
│   │   │   └── types.ts
│   │   ├── args.ts
│   │   ├── editor
│   │   │   ├── editor-host.ts
│   │   │   ├── generation-preview.ts
│   │   │   ├── image-attachments.ts
│   │   │   ├── live-code.ts
│   │   │   ├── persisted-messages.ts
│   │   │   ├── reveal.ts
│   │   │   └── use-canvas-agent.ts
│   │   ├── errors.ts
│   │   ├── executor.ts
│   │   ├── integrity.ts
│   │   ├── memory-host.ts
│   │   ├── plan.ts
│   │   ├── registry.ts
│   │   ├── review.ts
│   │   ├── revision.ts
│   │   ├── runtime.ts
│   │   ├── schemas.ts
│   │   ├── test-helpers.ts
│   │   ├── tool-names.ts
│   │   ├── tools
│   │   │   ├── arrange.ts
│   │   │   ├── builder.ts
│   │   │   ├── code.ts
│   │   │   ├── connectors.ts
│   │   │   ├── create.ts
│   │   │   ├── design.ts
│   │   │   ├── document.ts
│   │   │   ├── edit.ts
│   │   │   ├── frames.ts
│   │   │   ├── helpers.ts
│   │   │   ├── inspect.ts
│   │   │   ├── layout.ts
│   │   │   ├── memory.ts
│   │   │   ├── nodes.ts
│   │   │   ├── organize.ts
│   │   │   └── promote-groups.ts
│   │   ├── types.ts
│   │   └── validate.ts
│   ├── dashboard
│   │   ├── components
│   │   │   ├── board-tile.tsx
│   │   │   ├── dashboard
│   │   │   │   ├── dashboard-home.tsx
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── no-organization.tsx
│   │   │   │   └── organization-loading.tsx
│   │   │   ├── home-shell.tsx
│   │   │   ├── landing
│   │   │   │   ├── cta-section.tsx
│   │   │   │   ├── features-section.tsx
│   │   │   │   ├── footer-section.tsx
│   │   │   │   ├── hero-demo.tsx
│   │   │   │   ├── hero-scenes.ts
│   │   │   │   ├── hero-section.tsx
│   │   │   │   ├── how-section.tsx
│   │   │   │   ├── landing-nav.tsx
│   │   │   │   ├── reveal.tsx
│   │   │   │   └── routing-demo.tsx
│   │   │   ├── unauthenticated-page.tsx
│   │   │   ├── whiteboard-dropdown.tsx
│   │   │   └── whiteboards
│   │   │       ├── whiteboard-empty-state.tsx
│   │   │       └── whiteboard.tsx
│   │   ├── constants
│   │   ├── dialogs
│   │   │   ├── custom-dialog.tsx
│   │   │   ├── delete-dialog.tsx
│   │   │   ├── image-upload-dialog.tsx
│   │   │   └── rename-dialog.tsx
│   │   ├── hooks
│   │   │   └── use-board-thumbnail.ts
│   │   └── lib
│   │       └── format.ts
│   ├── diagram-code
│   │   ├── apply.ts
│   │   ├── canvas.ts
│   │   ├── frames.ts
│   │   ├── language
│   │   │   ├── ast.ts
│   │   │   ├── bpmn.ts
│   │   │   ├── compile.ts
│   │   │   ├── diagnostics.ts
│   │   │   ├── format.ts
│   │   │   ├── index.ts
│   │   │   ├── ir.ts
│   │   │   ├── parser.ts
│   │   │   ├── resolve.ts
│   │   │   ├── source.ts
│   │   │   ├── strings.ts
│   │   │   ├── structured.ts
│   │   │   ├── suggest.ts
│   │   │   ├── tooling
│   │   │   │   ├── caret.ts
│   │   │   │   ├── complete.ts
│   │   │   │   ├── highlight.ts
│   │   │   │   ├── hover.ts
│   │   │   │   └── indent.ts
│   │   │   └── vocab.ts
│   │   ├── parse.ts
│   │   ├── pins.ts
│   │   ├── serialize.ts
│   │   └── types.ts
│   ├── invitations
│   │   ├── components
│   │   │   ├── invitations-notice.tsx
│   │   │   └── pending-workspaces.tsx
│   │   ├── invitations-model.ts
│   │   └── use-pending-workspaces.ts
│   ├── organizations
│   │   └── components
│   │       └── create-org-form.tsx
│   ├── team
│   │   ├── components
│   │   │   ├── team-page.tsx
│   │   │   └── team-view.tsx
│   │   └── team-model.ts
│   └── whiteboard
│       ├── commands
│       │   ├── arrange.ts
│       │   ├── connectors.ts
│       │   ├── context.ts
│       │   ├── duplicate.ts
│       │   ├── editable.ts
│       │   ├── frame-actions.ts
│       │   ├── frame.ts
│       │   ├── layout-engine.ts
│       │   ├── layout.ts
│       │   ├── remove.ts
│       │   ├── style.ts
│       │   └── visibility.ts
│       ├── components
│       │   ├── canvas
│       │   │   ├── canvas-context-menu.tsx
│       │   │   ├── canvas-empty-state.tsx
│       │   │   ├── canvas-text-block.tsx
│       │   │   ├── comment-layer.tsx
│       │   │   ├── cursors.tsx
│       │   │   ├── minimap.tsx
│       │   │   ├── text-block-style.ts
│       │   │   ├── whiteboard-canvas-room.tsx
│       │   │   └── whiteboard-canvas-stage.tsx
│       │   ├── chrome
│       │   │   ├── floating-properties-panel.tsx
│       │   │   ├── selection-inspector.tsx
│       │   │   ├── sidebar.tsx
│       │   │   ├── snap-settings-menu.tsx
│       │   │   ├── toolbar-model.ts
│       │   │   ├── top-toolbar.tsx
│       │   │   └── whiteboard-chrome.tsx
│       │   ├── overlays
│       │   │   ├── agent-examples.ts
│       │   │   ├── agent-markdown.tsx
│       │   │   ├── ai-panel.tsx
│       │   │   ├── canvas-agent-view.tsx
│       │   │   ├── command-menu.tsx
│       │   │   ├── diagram-code-editor.tsx
│       │   │   ├── diagram-code-field.tsx
│       │   │   ├── diagram-code-panel.tsx
│       │   │   ├── export-dialog.tsx
│       │   │   ├── frame-title-editor.tsx
│       │   │   ├── icon-picker.tsx
│       │   │   ├── keyboard-shortcuts.tsx
│       │   │   ├── layout-panel.tsx
│       │   │   ├── panel-layout.ts
│       │   │   ├── shape-label-editor-style.ts
│       │   │   ├── shape-picker.tsx
│       │   │   ├── structured-editor.tsx
│       │   │   ├── text-toolbar.tsx
│       │   │   ├── use-image-attachments.ts
│       │   │   └── whiteboard-editing-overlays.tsx
│       │   └── properties
│       │       ├── bar-primitives.tsx
│       │       ├── icon-glyph.tsx
│       │       ├── number-field.tsx
│       │       └── text-field.tsx
│       ├── export
│       │   ├── deliver.ts
│       │   ├── errors.ts
│       │   ├── export-scene.ts
│       │   ├── pdf.ts
│       │   ├── scene.ts
│       │   ├── selection-policy.ts
│       │   └── svg-context.ts
│       ├── hooks
│       │   ├── access
│       │   │   ├── use-whiteboard-access.ts
│       │   │   └── whiteboard-access.ts
│       │   ├── canvas
│       │   │   ├── use-canvas-engine.ts
│       │   │   └── use-canvas-viewport.ts
│       │   ├── controller
│       │   │   ├── diagram-placement.ts
│       │   │   ├── editing-text.ts
│       │   │   ├── storage-writes.ts
│       │   │   ├── use-connector-style.ts
│       │   │   ├── use-editing-text.ts
│       │   │   ├── use-selected-arrow.ts
│       │   │   ├── use-selection-inspector.ts
│       │   │   ├── use-selection-style.ts
│       │   │   └── use-whiteboard-page-controller.ts
│       │   ├── data
│       │   │   ├── autosave-controller.ts
│       │   │   ├── saved-content.ts
│       │   │   ├── use-comments.ts
│       │   │   └── use-whiteboard-auto-save.ts
│       │   ├── export
│       │   │   └── use-board-export.ts
│       │   ├── interaction
│       │   │   ├── arrow-bend-edit.ts
│       │   │   ├── connector-arrow.ts
│       │   │   ├── draft-element.ts
│       │   │   ├── drag-session.ts
│       │   │   ├── gesture-history.ts
│       │   │   ├── gesture-scratch.ts
│       │   │   ├── gesture-state.ts
│       │   │   ├── group-selection.ts
│       │   │   ├── keyboard-policy.ts
│       │   │   ├── selection.ts
│       │   │   ├── use-element-commands.ts
│       │   │   ├── use-frame-commands.ts
│       │   │   ├── use-group-commands.ts
│       │   │   ├── use-organize-commands.ts
│       │   │   ├── use-semantic-node-commands.ts
│       │   │   ├── use-whiteboard-drawing.ts
│       │   │   └── use-whiteboard-keyboard.ts
│       │   ├── state
│       │   │   └── use-whiteboard-ui-state.ts
│       │   └── utils
│       │       └── use-whiteboard-utils.ts
│       ├── types
│       │   └── whiteboard.types.ts
│       └── utils
│           ├── arrange.ts
│           ├── canvas-render-utils.ts
│           ├── clipboard.ts
│           ├── comments.ts
│           ├── draw-guides.ts
│           ├── draw-layout-preview.ts
│           ├── draw-selection-overlay.ts
│           ├── frame-resize.ts
│           ├── icon-picker.ts
│           ├── inspector-edit.ts
│           ├── inspector-model.ts
│           ├── minimap-math.ts
│           ├── move-plan.ts
│           ├── properties-bar-model.ts
│           ├── rich-text-layout.ts
│           ├── rich-text-markup.ts
│           ├── rich-text-renderer.ts
│           ├── selection-overlay.ts
│           ├── semantic-node-edit.ts
│           ├── shape-picker.ts
│           ├── shape-preview.ts
│           ├── snap-settings.ts
│           ├── structured-edit.ts
│           ├── text-baseline.ts
│           └── viewport-math.ts
├── hooks
│   ├── use-api-mutation.ts
│   ├── use-api-query.ts
│   └── use-mobile.ts
├── lib
│   ├── authz
│   │   └── room-access.ts
│   ├── brand.ts
│   ├── security
│   │   └── csp.ts
│   ├── seo
│   │   ├── metadata.ts
│   │   ├── site.ts
│   │   └── structured-data.ts
│   ├── utils.ts
│   └── whiteboard-id.ts
├── liveblocks.config.ts
├── middleware.ts
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── providers
│   ├── convex-client-provider.tsx
│   └── theme-provider.tsx
├── public
│   ├── brand
│   │   ├── favicon.svg
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   ├── logo-dark.svg
│   │   ├── logo-light.svg
│   │   ├── mark-dark.svg
│   │   └── mark-light.svg
│   ├── image.png
│   └── placeholders
│       ├── 1.svg
│       ├── 10.svg
│       ├── 11.svg
│       ├── 12.svg
│       ├── 13.svg
│       ├── 14.svg
│       ├── 15.svg
│       ├── 16.svg
│       ├── 17.svg
│       ├── 18.svg
│       ├── 19.svg
│       ├── 2.svg
│       ├── 20.svg
│       ├── 21.svg
│       ├── 22.svg
│       ├── 23.svg
│       ├── 24.svg
│       ├── 25.svg
│       ├── 26.svg
│       ├── 27.svg
│       ├── 28.svg
│       ├── 29.svg
│       ├── 3.svg
│       ├── 30.svg
│       ├── 31.svg
│       ├── 32.svg
│       ├── 33.svg
│       ├── 34.svg
│       ├── 4.svg
│       ├── 5.svg
│       ├── 6.svg
│       ├── 7.svg
│       ├── 8.svg
│       └── 9.svg
├── scripts
│   ├── generate-brand-assets.mjs
│   ├── generate-icon-glyphs.mjs
│   ├── generate-logo-glyphs.mjs
│   └── nvidia-smoke.mjs
├── skills-lock.json
├── tests
│   └── browser
│       ├── baseline-fixtures.ts
│       ├── calibration-corpus.ts
│       ├── css.ts
│       ├── editor
│       │   ├── bundle.ts
│       │   ├── editor-entry.tsx
│       │   ├── fakes
│       │   │   ├── controller-probe.ts
│       │   │   ├── convex-api.ts
│       │   │   ├── convex-backend.ts
│       │   │   ├── convex-react.ts
│       │   │   ├── liveblocks.ts
│       │   │   ├── next-link.tsx
│       │   │   └── next-navigation.ts
│       │   ├── group-fixtures.ts
│       │   ├── open-editor.ts
│       │   └── types.ts
│       ├── entry.ts
│       ├── fixtures
│       │   ├── README.md
│       │   └── inter-latin-var.woff2
│       ├── harness.ts
│       ├── page-helpers.ts
│       └── ui-entry.tsx
├── tsconfig.json
├── vitest.browser.config.ts
├── vitest.config.ts
└── vitest.eval.config.ts
```

---

## 3. Deep-Dive Directory & Module Breakdown

### 3.1 `core/` (Diagram Engine Foundations)
The foundation layer is pure TypeScript and geometry math without direct React or DOM dependencies:
- **`core/anchors/`**: Port detection, edge attachment anchor calculations.
- **`core/arrow/`**: Connector line math and bend calculations.
- **`core/color/`**: Adaptive color engine, contrast ratios, and theme palette mapping.
- **`core/frames/`**: First-class frame model, nested frame indices, child-parent bounding box computations, and depth-aware paint order.
- **`core/groups/`**: Group creation, unit transforms, group serialization, bounds calculations, and atomic document patches.
- **`core/icons/`**: SVG path data extraction, custom icon library registry, and glyph catalogs.
- **`core/layout/`**:
  - `boundary.ts`: Architectural boundary enforcement to guarantee layout engines remain isolated.
  - `record.ts`: Diagram layout records stored in element arrays.
  - `engines/`: Concrete layout implementations (e.g. `freeform`).
  - `elk/`: ELK.js algorithm gates and lazy loading.
- **`core/routing/`**:
  - `route-engine.ts`: Orthogonal A* and Manhattan connector routing engine.
  - `grid-route.ts`: Spatial grid representation for obstacle avoidance.
  - `stub-pinning.ts`: Fixed port stub constraints to prevent connector clipping.
  - `curve.ts` & `path-normalizer.ts`: Bezier curve smoothing and redundant waypoint simplification.
- **`core/shapes/`**: Primitive shape definitions and hit testing:
  - `rectangle/`, `pill/`, `outline/`, `arrow/`, `semantic-node/`, `frame/`, `entity-table/`, `icon/`.
  - `base/`: Hit tolerance checks, resize bounding boxes, text coloring.
  - `rotation.ts`: Coordinate transformation matrices for rotated elements.
- **`core/snap/`**: Alignment guidelines, point snapping, and edge magnetic snapping math.
- **`core/text/`**: Font metric measurement, dynamic label resizing, and baseline calculations.
- **`core/theme/`**: Canvas themes (light/dark/custom canvas background rendering).

---

### 3.2 `features/` (Domain-Driven Modules)

#### `features/whiteboard/`
The visual whiteboard user interface:
- **`components/`**:
  - `canvas/`: Main canvas render surface, selection marquees, element render loops.
  - `chrome/`: Floating toolbars, zoom controls, minimap, collaboration avatar stack.
  - `overlays/`: Properties bar, shape picker, icon picker, layout options panel, export modal, and AI chat panel.
- **`hooks/`**:
  - `controller/`: Top-level whiteboard controller coordinating storage writes, text editing, and placements.
  - `interaction/`: Pointer gestures (drag sessions, selection box, connector arrow dragging, keyboard shortcuts).
  - `access/`: Room permission policies and read-only spectator guards.
  - `export/`: High-resolution canvas rasterization and PDF/SVG serialization.
  - `state/`: Local UI state (active tool, selected element IDs, active zoom level).
- **`utils/`**: Clipboard serialization, rich text parsing, minimap coordinate transforms, snap configurations.

#### `features/ai/`
The autonomous diagramming intelligence:
- **`diagram-agent/`**:
  - `builder/`: Diagram structure generator and icon hint resolution.
  - `eval/`: Layout scoring and quality benchmarks.
  - `profiles/`: Diagram type profiles (architecture, sequence, flowchart, ER diagram, mind map).
  - `prompt/`: Multi-shot system prompts, diagram style guides, and example corpuses.
  - `tools/`: Diagram linting, connectivity verification, and semantic validation.
- **`server/`**:
  - `canvas-compiler.ts`: Compiles high-level AI diagram DSL into concrete whiteboard elements.
  - `model-providers.ts`: Universal adapter connecting Anthropic (Claude 3.5 Sonnet), OpenAI (GPT-4o), Google GenAI (Gemini 1.5/2.0), and Groq.
  - `layout/`: Aesthetic metrics, bus routing, channel allocation, and port distribution.

#### `features/canvas-tools/`
The execution environment for agent interactions:
- **`agent/`**: Handlers, timeout controls, multi-turn message history, and execution scenarios.
- **`editor/`**: Live diagram code sync host and persisted chat message bridge.
- **`tools/`**: Granular agent tools: `create`, `connect`, `edit`, `arrange`, `organize`, `document`, `inspect`, and `layout`.

#### `features/diagram-code/`
Code-to-diagram language compiler:
- **`language/`**: Lexer, grammar definitions, syntax tokenizers, formatting utilities.
- Parser, AST validator, round-trip serializer, and code-to-canvas synchronizer.

#### `features/team/` & `features/invitations/`
Team management, organization roles, and whiteboard sharing links.

---

### 3.3 `convex/` (Backend & Database)
Serverless backend running on Convex:
- **`schema.ts`**: Relational document schema for boards, orgs, user profiles, comments, and AI conversation logs.
- **`whiteboards.ts`**: Board CRUD, permission queries, fork operations, and soft deletion.
- **`comments.ts`**: Real-time pinned canvas commentary threads.
- **`aiConversation.ts`**: Persistent chat thread storage for AI assistant turns.
- **`users.ts`**: User profile sync with Clerk authentication.
- **`subscriptions.ts`**: Organization billing tier validation.
- **`auth.config.ts`**: JWT verification configuration for Clerk.

---

### 3.4 `app/` (Next.js Application Layer)
Next.js 15 App router architecture:
- **`app/page.tsx`**: Landing page and workspace board explorer.
- **`app/whiteboard/[id]/page.tsx`**: The collaborative canvas page loading Liveblocks room and Convex sync.
- **`app/billing/` & `app/create-org/`**: Subscription and organization onboarding.
- **`app/api/ai/canvas-agent/route.ts`**: Streaming HTTP endpoint powering AI agent conversations.
- **`app/api/liveblocks-auth/route.ts`**: Room authorization handshake for real-time WebSocket sessions.

---

### 3.5 `components/` (Shared UI Library)
- **`components/ui/`**: Headless, accessible primitives styled with Tailwind CSS (Dialog, DropdownMenu, Tooltip, Sonner, Command, Kbd, Switch, Sheet).
- **`components/layout/`**: Desktop/mobile responsive top navigation, app sidebar, and breadcrumbs.
- **`components/seo/`**: JSON-LD structured data and meta tags.

---

### 3.6 Supporting Infrastructure
- **`liveblocks.config.ts`**: Typed Liveblocks Presence, Storage (DrawingElements), and UserMeta.
- **`middleware.ts`**: Clerk authentication middleware guarding protected routes.
- **`scripts/`**: Build utilities for generating icon glyphs, logo variants, and brand assets.
- **`tests/`**: Playwright browser test harness, fixtures (`baseline-fixtures.ts`, fonts), and backend fakes.
- **`docs/`**: Comprehensive product documentation, architectural decisions, and layout benchmarks.
