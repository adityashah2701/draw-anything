# Brand identity

The mark replaces the earlier four-quarter silhouette (recoloured to four strengths of ink in PR #41). That mark was not kept or adjusted: the brief was a new identity chosen on its merits.

## Concept

**A D made of a node, a line and a node.** The two squares are the selection handles every shape in the editor shows when selected. The bowl is a connector that leaves one node and arrives at the other, with the same round corner the routing engine draws. A stem joins them. Read as a letter it is "D" for Draw; read as a diagram it is two things and the line that relates them, the product's two primitives. It is drawn with the editor's own parts, so it belongs to the tool and not to a generic "AI" vocabulary.

Concepts explored (rendered at 16, 24, 32, 64 and 128px, on paper and graphite, before choosing):

| | Idea | Verdict |
|---|---|---|
| 1 | D from two nodes and a connector, no stem | Read as a horseshoe or headphone band. The stem is what makes it a D. |
| 2 | Origin corner: an L-shaped crop mark and a dot | Clean, but a corner bracket and a dot say nothing about diagrams; closest to a template symbol. |
| 3 | Pen stroke that resolves into a square node | Distinctive at large sizes, but the stroke has no letter and at 16px it is a comma. |
| 4 | Selection frame: a square with four corner handles | Reads as "crop" or "select tool"; mush at 16px. |
| **1b** | **D whose stem ends are selection nodes and whose bowl is a connector** | **Chosen.** Reads as D at 16px, as a diagram at 64px, and uses the editor's own vocabulary. |

Rejected on principle: sparkles, gradients, blobs, a pencil or a lightbulb.

## Colour and type

- The mark is **one colour: ink** (`--primary`), `#1d54c1` on paper and `#7daafd` on graphite. Orange is reserved for the agent (system.md) and never appears in the mark. No gradient, no second colour, no outline variant.
- The wordmark is **Geist SemiBold**, tracked -0.025em, sentence case ("Draw Anything"). Geist is already the app's sans (`next/font` in `app/layout.tsx`), so **no font is added and nothing extra loads**. In the app the wordmark is live text in the surrounding font; the outlined path (`WORDMARK_PATH` in `lib/brand.ts`, Geist SemiBold outlines generated with opentype.js from the OFL `geist` package) exists for SVG files and images that cannot load fonts.
- The mark is as tall as about two cap heights, so it leads the wordmark.

## Logo system

| Piece | Use |
|---|---|
| **Mark** (`LogoMark`, `mark-light.svg`, `mark-dark.svg`) | Sidebar, collapsed rail, toolbars, auth screens, anywhere space is under about 160px wide. This is also the **compact mark**. |
| **Lockup** (mark + live wordmark in components, `logo-light.svg` / `logo-dark.svg` as files) | Landing nav and footer, social images, docs. |
| **Tile icon** (paper mark on an ink rounded square) | App icons only: favicon.ico, apple-touch icon, manifest icons. Tiles keep the mark legible on any browser chrome. |
| **Adaptive favicon** (`favicon.svg`, `app/icon.svg`) | Transparent mark that switches ink with `prefers-color-scheme`. |
| **Loader** (`LogoLoader`) | Full-page or panel loading. The two nodes take turns dimming (1.2s, opacity only, still under `prefers-reduced-motion`). |

### Rules

- Minimum size: **16px** for the mark (favicon), **96px wide** for the lockup. Below that use the mark.
- Clear space: half the mark's width on every side.
- Light grounds use `*-light.svg`, dark grounds `*-dark.svg`. In React use `LogoMark`, which follows `--primary`.
- Do not recolour, outline, rotate, add effects, put it on a photo or in a gradient tile, or set the wordmark in another face.
- Do not place orange next to the mark to imply the agent.

## Source of truth and assets

Geometry and colours live in **`lib/brand.ts`** (`MARK_PATH`, `MARK_RING_PATH`, `MARK_NODE_PATHS`, `WORDMARK_PATH`, `BRAND_COLORS`). The React components and the OG image should import from it. **`node scripts/generate-brand-assets.mjs`** regenerates every file below; `lib/brand.test.ts` fails if they drift.

| File | Purpose |
|---|---|
| `public/brand/mark-light.svg`, `mark-dark.svg` | Mark for light / dark grounds |
| `public/brand/logo-light.svg`, `logo-dark.svg` | Outlined lockup for light / dark grounds |
| `public/brand/favicon.svg`, `app/icon.svg` | Adaptive tab icon (Next serves `app/icon.svg` as the `<link rel="icon">`) |
| `app/favicon.ico` | 16, 32, 48px tiles for legacy browsers |
| `app/apple-icon.png` | 180px apple-touch icon |
| `public/brand/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Web app manifest icons (`app/manifest.ts`) |

Where it is used: sidebar header, landing nav and footer, the legacy top bar, the three loading screens (`components/shared/loader.tsx`, board access check, board stage), Clerk's sign-in and sign-up modals (`layout.logoImageUrl`, picked by theme), tab icon, apple-touch icon and web app manifest. The editor toolbar has no brand slot (it starts with a Back button), so none was added.
