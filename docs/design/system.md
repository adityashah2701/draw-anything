# Draw Anything design system

Status: introduced in the redesign PR series. This file is the reference for anyone adding UI.

## Audit: what was wrong

Found by reading the dashboard, shell, editor chrome, AI panel and shared components.

1. **Two products in one repo.** The editor chrome and AI panel already spoke a precise voice (hairlines, small mono labels, flat surfaces). The dashboard was a stock SaaS template: a greeting, four statistics tiles, three pastel quick-action cards, then a card grid.
2. **Colour with no role.** Blue, purple, green and orange tiles, a blue "logo" box, violet focus rings, yellow dots, each chosen locally. Nothing told you what a colour meant. The neutral palette had zero chroma, so light and dark were the same grey, inverted.
3. **Filler content.** Statistics ("Total whiteboards", "This week", "Team members") told users nothing they act on. "Upload & Edit" and "Notifications" had no behaviour (one showed a "coming soon" toast). "Browse Templates" went nowhere.
4. **The resume path was buried.** The most common visit is "open the board I was on". It sat below a header, a row of stats and a row of actions, in cards with a gradient hover, a dashed "No preview" box, two dates and an element count.
5. **Shared components had no point of view.** shadcn defaults: `shadow-xs` everywhere, 3px focus rings, black/50 overlays, arrowed tooltips, centred dialog headers.
6. **Inconsistent density and radius.** `rounded-2xl` cards next to `rounded` icon buttons, 4xl headings next to 11px mono labels.

What to keep: the mono annotation labels, hairline borders, flat panels and the quiet canvas in the editor. They are the best part of the product's character.

## Directions considered

| | A. Drafting table | B. Studio dark | C. Quiet paper |
|---|---|---|---|
| Idea | Technical-drawing conventions: paper, ink, title blocks, a reviewer's red pencil | Near-black ground, one acid accent, glow-free but high contrast | Cream ground, serif headings, terracotta accent |
| Identity | Specific to drawing; the AI gets a story (markup) | Interchangeable with every dev tool | Pleasant, but currently the default "calm" look and a serif fights a precision tool |
| Usability | Light default works for diagrams that export on white; dark is a real second material | Dark-only bias; the canvas content is mostly light | Serif is weak at 11px and in dense menus |
| Cost | Tokens plus restyling | Tokens plus restyling | Needs new font loading |
| Consistency | Mono annotation voice already exists in the editor | Would replace it | Would replace it |

**Chosen: A, Drafting table.**

## Visual thesis

Draw Anything is a drafting instrument, not a toy and not a document. Surfaces are paper (light) or graphite (dark). You work in **ink**. The assistant works in **markup**. Everything else is quiet so the diagram is the loudest thing on screen.

## Principles

1. **The canvas is the loudest thing.** Chrome is flat, hairline and low-contrast until used. No shadows except on things that float (menus, dialogs, panels over the canvas).
2. **Colour is a role.** Ink blue means "yours" (actions, selection, focus). Markup orange means "the agent" (and nothing else). Green, amber and red mean status. Anything else is neutral.
3. **Annotation, not decoration.** Metadata (counts, dates, shortcuts, coordinates) is set small, mono, uppercase or tabular, like a title block. Headlines stay modest (20-24px, weight 600, tight tracking).
4. **Resume first.** Every home surface leads with the thing you most likely want next, and shows only data we actually have.
5. **One way to do each thing.** One button, one input, one menu, one dialog, one tooltip, one empty state pattern, one radius scale.
6. **Motion explains.** 120-150ms fades and slides to show where something came from. Nothing loops except loading. `prefers-reduced-motion` removes it all.

## Tokens (see `app/globals.css`)

| Role | Token | Light | Dark |
|---|---|---|---|
| Ground | `--background` | warm paper | cool graphite |
| Raised surface | `--surface` / `--card` / `--popover` | near white | one step up |
| Quiet fill | `--muted`, `--accent`, `--secondary` | paper -1 | graphite +1 |
| Text | `--foreground` / `--muted-foreground` | ink / 6:1 grey | paper / 7:1 grey |
| Hairline | `--border` | paper -2 | graphite +2 |
| Control edge | `--input` | stronger hairline | stronger hairline |
| Ink (primary) | `--primary`, `--ring` | oklch(0.48 0.18 262) | oklch(0.74 0.13 262) |
| Markup (agent) | `--agent`, `--agent-muted` | oklch(0.55 0.16 50) | oklch(0.78 0.13 55) |
| Status | `--success`, `--warning`, `--destructive` | muted, same lightness family | lifted for dark |

Light and dark differ in hue as well as lightness: paper is warm (hue 85), graphite is cool (hue 262). Accent lightness flips so contrast holds on each ground.

- **Radius**: `--radius` is 6px. Controls 6px, surfaces 8px, avatars and switches round. Nothing rounder than 10px.
- **Elevation**: `shadow-float` (toolbars over the canvas), `shadow-popover` (menus, dialogs). No other shadows.
- **Type**: Geist for UI, Geist Mono for annotation (`label-mono` utility, `tnum` for numerals). Sizes: 11 annotation, 13 dense UI, 14 body, 16 dialog title, 20-24 page title. Weights 400, 500, 600.
- **Surfaces**: `bg-sheet` is the dot-grid drafting sheet used behind board previews and empty canvases.
- **Focus**: 2px ink ring with 2px offset on every interactive control.

## Components

`Button` (default = ink, `secondary`, `outline`, `ghost`, `destructive`, and `markup` for agent actions), `Input`, `Dialog` (left-aligned, 8px, popover shadow), `Tooltip` (inverted, no arrow, shortcut slot), `Kbd`, `DropdownMenu`, `ContextMenu`, `Sheet`, `Toaster` all read from the tokens above. Add new UI by composing these, not by adding colours or shadows locally.

## Sidebar

`components/layout/sidebar/sidebar-view.tsx` (presentational) and `app-sidebar.tsx` (Clerk and Convex wiring).

Concepts weighed: a 48px icon-only rail (most canvas, but four destinations plus a workspace need labels to scan), a fixed 16rem sidebar (readable, costs width on every screen), a workspace-first sidebar with the switcher on top (the workspace is a setting you change rarely, not the thing you scan). **Chosen: a fixed sidebar that collapses to the icon rail** (Ctrl+B or the top-bar button), so labels are there by default and the canvas width is one key away.

- **Brand strip** is 48px with the same hairline as the top bar, so one rule runs across the page. The mark sits on the same vertical axis as the nav icons in both states.
- **Active page** carries an ink bar on the leading edge, the quiet fill, an ink icon and medium weight. Four cues, none of them a colour block.
- **Groups**: primary pages unlabelled, then `Organization` (member count in mono), then `Recent` (newest five boards, hidden when collapsed).
- **Footer** is a title block: workspace and account rows sit flush under a hairline, no cards. Both open the shared `DropdownMenu` (above the trigger when expanded, beside it when collapsed).
- **Logo** is the D-from-nodes mark (`components/shared/logo-mark.tsx`, geometry in `lib/brand.ts`), one colour: ink. Orange is reserved for the agent. Rationale, rules and asset list: `brand.md`.
- **Motion**: 150-200ms, `--ease-out-strong`, width and colour only; rows scale to 0.98 on press; everything stops under `prefers-reduced-motion`. The collapsed rail mounts tooltips only while collapsed.

## Landing motion

The public landing page (`features/dashboard/components/landing/`) is the one place motion explains the product rather than acknowledging input. Rules, from emilkowalski/skill (`emil-design-eng`, `animate`, `review-animations`):

- **Every animation names its purpose.** Hero demo: explanation (the agent builds a diagram step by step, orange while drawing, neutral once committed). How it works: sequence. Routing demo: explanation (a straight connector crossing a shape, then the routed one). Reveals: orientation as sections arrive. Menus and buttons: feedback.
- **One vocabulary.** Enter with `--ease-out-strong`, move on screen with `--ease-in-out-strong`; reveals are 320ms and 8px, siblings step 60-120ms; buttons press to 0.97 over 150ms. Never `ease-in`, never `transition: all`, never `scale(0)` (entries start at 0.95).
- **Transitions, not keyframes, for anything the user can interrupt.** The demos are driven by `data-shown` attributes and CSS transitions, so a scene change or replay retargets from the current state. The only keyframe is the one-off hero rise on first paint.
- **Hide fast, show slow.** Elements leave in 100ms and arrive in 220-360ms, so replaying never makes the user wait for the old drawing to unwind.
- **Once.** Reveals and demos fire the first time they are seen and never again on scroll-by. Nothing loops, floats, tracks the cursor or moves with scroll.
- **Transform and opacity only** (plus `stroke-dashoffset` for drawing lines). No layout properties are animated.
- **Reduced motion** shows the finished state: reveals are visible, the demo renders fully drawn, the routing demo opens routed, smooth scrolling is off. Nothing depends on motion to be understood.
- **Cleanup.** Observers disconnect after firing or on unmount; listeners on the mobile menu exist only while it is open.

## Known gaps

- Boards store `_creationTime` but no updated-at. The dashboard can only say "created", not "last edited". Adding an `updatedAt` field is a schema change and is left for a decision.
- Text colours inside user diagrams are the user's choice and are not themed.
