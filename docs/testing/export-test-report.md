# Export test report (2026-10-16)

## What was built
`features/whiteboard/export/`: one renderer, two passes. Every format draws elements with the editor's own `drawElement` in light mode with no editor state. Pass 1 draws into `SvgContext` (a recording stand-in for the canvas context) which produces the SVG and measures the real ink (stroke width, arrowheads, text) so the bounds can never clip. PNG and PDF then draw the same elements onto a canvas at the chosen scale inside that measured box plus a 24-unit margin. UI: `export-dialog.tsx`, hook `use-board-export.ts`, opened from the command menu ("Export…") or Cmd/Ctrl+Shift+E; "Copy as image" is in the dialog and the command menu.

| Option | Behaviour |
|---|---|
| PNG | 1×, 2×, 3×; opaque white or transparent (alpha 0) |
| SVG | vector, self-contained; opaque or transparent; no `<image>`, `<script>`, `href` or external `url()` |
| PDF | one page sized to the diagram (0.75 pt per px, capped at 14400 pt keeping aspect). **Raster**: the page holds a lossless image at the chosen scale, so text is not selectable and nothing is vector. Always white (PDF has no alpha here). Not split across pages: a diagram is one page |
| Selection only | selected elements + connectors with both ends selected + those connectors' labels (`selection-policy.ts`); a connector with one selected end is left out unless selected itself |
| Copy as image | PNG at 2× via the Clipboard API (selection if any, else the board) |
| Limits | 16,384 px per side and 64 MP for PNG; 24 MP for PDF (it holds pixels three times); 50 M characters for SVG. Over the limit: a message, never a silent fallback |
| Errors | `ExportError` codes: nothing-to-export, no-selection, too-large, render-failed, unsupported, clipboard-unsupported, clipboard-denied, cancelled. Shown inside the dialog; nothing is thrown into the editor |

## Commands run and results (final run, after the last code change)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | no output (clean) |
| `npm run lint` | No ESLint warnings or errors |
| `npx vitest run` | 66 files, **742 tests passed** |
| `npx vitest run features/ai` | 31 files, 326 passed |
| `npm run test:browser` (real Chrome via playwright-core) | 10 files passed, 1 skipped; **120 passed, 11 skipped** (includes the 29 export tests and 2 XSS regression tests; the skipped file was already skipped before this work) |
| `npx vitest run --config vitest.browser.config.ts tests/browser/export` | 2 files, **29 passed** |
| `npm run build` | succeeded; `/whiteboard/[id]` 187 kB, first load 361 kB |
| `npm audit --omit=dev` | not re-run; still 15 vulnerabilities (see security audit DA-003) |

Baseline before this work: 643 unit tests passed, type check and lint clean, browser tests not recorded.

## Browser coverage actually executed (real Chrome 1× DPR and 2× DPR, Inter loaded)
`tests/browser/export.browser.test.ts` (19) and `export-dialog.browser.test.ts` (10). Pictures and files were inspected, not just asserted: PNG, SVG, SVG screenshot, and PDF of the architecture fixture and a mixed-shape board were opened and compared by eye; the PDF was also parsed independently with pdf.js (one page, 681.75 × 457.5 pt, one 1818 × 1220 RGB image of exactly w·h·3 bytes).

- PNG at 1×/2×/3×: pixel size = ceil(css size × scale); opaque to the edge; board elements unchanged afterwards.
- Transparent PNG: corner alpha 0, outer 6 px ring empty, ink starts about one margin in from every edge (nothing clipped).
- Opaque PNG corner is [255,255,255,255].
- SVG: parses as XML, correct viewBox/width, no script/image/foreignObject/use/href/on*, all labels present including `日本語 مرحبا 😀 café – naïve`.
- SVG vs PNG of the same board, rasterised inline in Chrome: same size, under 12% of inked pixels differ by more than 96/255 (anti-aliasing and text hinting). Two defects were found this way and fixed: text sat 2–3 px low (canvas `middle` vs SVG `dominant-baseline`, now baked into `y`), and some icons were wrong (separate glyph paths joined into one `d`, so a relative `m` continued from the previous path).
- Selection-only: nodes + connecting edges, smaller output, nothing unselected leaks into the file (`SECRET-C` absent).
- Nothing selected / empty board: `no-selection` / `nothing-to-export`, shown in the dialog, no unhandled page error.
- Independence: SVG bytes identical with the page in dark mode vs light, and at device pixel ratio 1 vs 2.
- Icons exported as vector glyph paths (at least one rounded-stroke path per node).
- Mixed content: multiline and very long labels, circle, diamond, triangle, freehand, line, straight dashed and orthogonal connectors, bidirectional arrow, CJK/Arabic/emoji text.
- Oversized: two shapes 40,000 px apart fail as PNG with a message but export as SVG; ~60 MP passes as PNG and is refused as PDF.
- Large board (2,370 elements, 8810 × 3610 px, one run on this machine): SVG 157 ms, PNG 559 ms, longest event-loop stall 140 ms, SVG 2.2 MB, PNG 2.2 MB, JS heap grew 129 MB during the run.
- Cancel mid-export: rejects with `cancelled`.
- Clipboard: real copy and read-back of an `image/png` with permission granted.
- Dialog (real component, hook and exporter, files caught from real downloads): defaults; SVG disables quality; PDF disables transparency and says why; selection switch disabled with nothing selected and on by default with a selection; PNG, SVG (opaque and transparent) and PDF downloads have correct magic bytes and the name `Test-Board.<ext>`; the empty-board error appears in the dialog; Cancel/Escape close it and reopening restores the defaults; Copy puts a PNG on the clipboard; a failed copy shows its reason.
- Security: hostile labels, colours, fills, font styles and a hostile title produce an SVG with no script, handler attribute or external reference; inserting that SVG into a page runs nothing; the only `url()` values are the file's own `#clipN`.
- Screenshots of the dialog (default, PDF, SVG with a selection, error) were taken with the app's real compiled Tailwind CSS and inspected.

## Not tested, and why
- **The real editor.** Reaching `/whiteboard/[id]` needs a Clerk sign-in for a real account and a real board id in the Convex deployment. I did not create or guess credentials. Not exercised: the controller wiring (command menu item, Cmd/Ctrl+Shift+E in the live canvas, the selection coming from the canvas, the board title in the file name), and export at different editor zoom levels. Zoom independence is structural, not measured: export reads only `elements` and `selectedIds`, never viewport state, and the DPR and theme independence tests passed. The unit test covers the shortcut mapping only.
- **A real clipboard denial.** Headless Chrome allows clipboard writes by default, so a denial was simulated (the API rejecting with `NotAllowedError`), plus a simulated missing `ClipboardItem`.
- Safari and Firefox. Chrome only. Safari has a smaller canvas area limit than the 64 MP used here; very large PNGs may fail there with `render-failed`.
- Memory release after many exports (one heap measurement only; no leak test).
- Opening the PDF in a PDF viewer app (parsed with pdf.js only).

## Known limitations and issues
1. SVG text is emitted one `<text>` per word (the renderer draws word by word). Selecting or searching text in the SVG works per word.
2. SVG fonts are not embedded. Viewers without the app's font use a fallback, and text inside a shape (which is clipped to the shape) may be wider than designed.
3. PDF is raster (above), single page.
4. There are no curved connectors in the product (only straight and orthogonal), so none were tested.
5. Explicit line breaks inside a label become spaces when the board is shown as diagram code (the DSL has no multi-line strings). Pre-existing.
6. Pre-existing: opening `/whiteboard/<malformed id>` (for example `abc123`) crashes the page with an unhandled Convex `ArgumentValidationError` ("Application error: a client-side exception"), instead of a not-found message. Not caused by export; reproduced unauthenticated.
7. Exports are always light mode (a deliberate decision, stated in the dialog); there is no dark-export option.
