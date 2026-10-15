# Icon system implementation plan (executed)

Spec: `docs/superpowers/specs/2026-10-16-icon-system-design.md`

- [x] 1. Glyph generator + `core/icons/glyphs.ts`; registry with kinds, aliases, `iconForNode` (`core/icons/registry.ts`, `icons.test.ts`).
- [x] 2. `drawIconTile` with badge fallback; `semantic-node/renderer.ts` uses it, old badge table deleted.
- [x] 3. `icon` on `AIDiagramNode`, `element.ai`, model schema; `normalizeSemanticKind` vendor mapping; `normalizeIconReference`; compiler stores `ai.icon`; prompt hint.
- [x] 4. Diagram code: `ParsedNode.icon`, serialize/`graphFromElements`, old `icon:` spelling kept.
- [x] 5. Tests: `features/ai/server/icon-integration.test.ts`; Chrome `tests/browser/icons.browser.test.ts`.
- [x] 6. Verify: tsc, lint, vitest, browser tests, `next build`.

Bug found by the Chrome test during step 5: concatenating a multi-shape icon's paths into one string let a relative `m` continue from the previous shape (garbled icons). Paths are now kept as separate strings.
