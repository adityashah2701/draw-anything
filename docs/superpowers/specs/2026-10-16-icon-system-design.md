# Sub-project C: icon system and node visuals (spec)

## Audit (how it worked before)
- A semantic node is a `semantic-node` element; its only icon was a 2-4 letter text badge chosen in `core/shapes/semantic-node/renderer.ts` from `ai.semanticKind` (a second, unused copy lived in `features/ai/server/tools/icon-resolver.ts`).
- The kind is a closed enum (`aiSemanticNodeKindSchema`, 50 values); models outside it are coerced to `generic` by `normalizeSemanticKind`. Models could not name a technology.
- Icon geometry (size <= 28, left margin 14, gap 12) lives only in `core/text/label-region.ts`; node sizing (`node-size.ts`) and the label region read it. This is the single place that must keep owning geometry.
- Stored format: `element.ai.semanticKind` (string). The diagram-code DSL's `icon:` key was an alias of `kind`.
- Dependencies: `lucide-react` (ISC) is installed but is a React-component library; canvas drawing needs path data.
- The `rea` repo is a reverse-engineering MCP server with no canvas code; REA was not applicable to this source-only audit.

## Decisions
1. **Registry** (`core/icons/registry.ts`): id, category, SVG path list, viewBox, text badge. Neutral technology ids (`database`, `message-broker`, `microcontroller`, `bus`...); vendor words (`postgres`, `kafka`, `s3`, `nginx`, `esp32`, `can-bus`) are aliases. `registerIcon` lets a pack add icons without touching anything else.
2. **Glyphs**: 65 lucide icons (ISC) vendored as path strings by `scripts/generate-icon-glyphs.mjs` into `core/icons/glyphs.ts` (11.5 KB). No new dependency, no runtime import of lucide.
3. **No vendor logos.** AWS/GCP/Azure/brand logos are trademarked, and the `simple-icons` CC0 license does not clear trademark use; bundle size and a new dependency also argue against. Brand packs can be registered later through `registerIcon`.
4. **Reference**: optional `icon` on a node (`AIDiagramNode.icon`, `element.ai.icon`). Resolution order: valid `ai.icon`, else `ai.semanticKind`, else `generic`. Old boards have no `icon` and still get their kind's icon: **no migration, stored format only gains an optional field.** An icon is stored only when it differs from the kind's own.
5. **Validation is lenient** like the rest of the pipeline: junk, non-strings and unknown ids are dropped, never errors. Vendor words in `kind` map to a kind (`kafka` -> `message-broker`). Works the same for every provider, Groq included: the model gets an optional field and a hint, no strict schema change.
6. **Rendering** (`core/icons/draw.ts`): tile tinted by category + stroked glyph, everything scaled from the tile size, so it is identical at every zoom. Falls back to the text badge when `Path2D` is missing or a path is rejected. Geometry is untouched, so layout/label code does not change.
7. **Diagram code**: `icon:` is now a separate property (round-trips); old `icon: db` still sets the kind when `kind` is absent.

## Out of scope
Icon picker UI, brand logos, shape/colour theme redesign beyond the icon tile, Sub-project D.

## Verification contract
Unit: registry coverage of every kind, alias resolution, invalid references, fallback drawing, schema leniency, compile output, DSL round trip, backward compat. Real Chrome (`npm run test:browser`): every icon draws ink inside its tile at 56 and 112 px with stable aspect. Not verified: full app (needs Clerk + Convex login), real model output from providers.
