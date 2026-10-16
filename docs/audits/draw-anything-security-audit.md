# Draw Anything security audit (2026-10-16, first pass)

Scope actually assessed: static grep and code reading of injection sinks, security headers, committed secrets, the Liveblocks auth route, `npm audit --omit=dev`. Not assessed: Convex function-by-function authz review, AI route abuse testing, live browser/XSS reproduction, CSRF, CI config, upload paths. This is not a statement that the app is vulnerability-free.

## Findings

| ID | Severity | Confidence | Status |
|----|----------|------------|--------|
| DA-001 Stored XSS via label HTML parsing | High | High (the old pattern was reproduced firing a handler in Chrome) | Fixed, regression test added |
| DA-002 No security response headers | Low | High | Fixed (no CSP) |
| DA-003 Vulnerable dependencies (Next, Clerk, transitive) | High/Critical per `npm audit` | Medium (advisory applicability not checked per CVE) | Open, needs decision |
| DA-004 No Content-Security-Policy | Low | High | Open |
| DA-005 Export review (SVG injection, tainting, limits, leaks) | n/a | High (tested in Chrome) | No vulnerability found; one resource risk fixed |
| DA-006 Invalid board id crashes the board page | Low | High (reproduced) | Open, pre-existing |

### DA-001 Stored XSS in `normalizeRichTextInput`
- File: `features/whiteboard/utils/rich-text-renderer.ts` (`editableHtmlToMarkdown`, string branch).
- Class: DOM XSS. Label text containing something that looks like HTML (`/<\/?[a-z][\s\S]*>/i`) was assigned to `innerHTML` of a detached `div`. Detached nodes do not run `<script>`, but `<img src=x onerror=...>` still fires.
- Preconditions: attacker controls label text another user opens (a collaborator in the shared org, an imported or AI-generated label, or a prompt-injected AI answer).
- Impact: script runs in the victim's Clerk session on the app origin.
- Fix: parse with `DOMParser` (inert document, no resource loading or handlers). Behaviour for valid input is unchanged.
- Regression test: `tests/browser/rich-text-xss.browser.test.ts` (real Chrome): a control case shows `innerHTML` on a detached div fires `<img onerror>`; five hostile inputs through `normalizeRichTextInput` run nothing and reduce to their text.
- Other sinks reviewed and found safe: `markdownToEditableHtml` escapes every text span before `innerHTML` assignment; `components/ui/chart.tsx` is shadcn CSS injection from static config.

### DA-002 Security headers
`next.config.ts` had no headers. Added `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`. Not verified against a running build.

### DA-003 Dependencies
`npm audit --omit=dev`: 15 vulnerabilities (3 critical, 9 high, 3 moderate). Direct: `next` 15.4.10 (fix: 15.5.x, not semver-major) and `@clerk/nextjs`. Clerk 6.39.x peers on React `~19.1.4`, but the repo pins `react@19.1.0`, so `npm audit fix` fails with ERESOLVE. Not applied: it needs a React patch bump and a lockfile rewrite (the lockfile is already out of sync) and cannot be build-verified without Clerk and Convex keys. Recommended: bump `next`, `react`, `react-dom` together, run `npm install`, `npm run build`, then re-audit.

### DA-004 CSP
Left out deliberately: Clerk, Convex, Liveblocks and Next inline scripts need a tested policy. Roll out report-only first.

## Reviewed and found sound
- `app/api/liveblocks-auth/route.ts`: authenticates with Clerk, checks board access in Convex as the user, fails closed.
- No secrets committed (`git grep` for common key prefixes; no tracked `.env*`). Only `NEXT_PUBLIC_CONVEX_URL` is exposed to the client.
- AI route: per CLAUDE.md, session required, body size limit, provider allow-list, per-user rate limit, generic client errors. Not re-tested here.

## DA-005 Export feature review (2026-10-16)
Scope: `features/whiteboard/export/`, `use-board-export.ts`, the dialog. Export is entirely client-side: no new server route, no new Convex function, so no new authorization check exists to be wrong. It draws only the elements the user's session already loaded under the existing board access rules.
- **SVG injection**: all output is built from escaped text, validated numbers and allow-listed colour/font strings; invalid colours are ignored the way the canvas ignores them; icon path data is checked against a path-command pattern; XML-invalid characters and lone surrogates are removed. Hostile labels, colours, fills, font styles and titles were exported and inserted into a live page: no script, no `on*` attribute, no `href`, nothing executed (browser tests). The only `url()` values are the file's own `#clipN`.
- **Embedded assets and external references**: none are ever written (no `<image>`, `<use>`, `<foreignObject>`).
- **Cross-origin tainting**: the render path never calls `drawImage` or loads an `Image`, so the canvas cannot be tainted; PNG `toBlob` and PDF `getImageData` work in every test.
- **Oversized exports / DoS**: limits on pixels (PNG 64 MP, PDF 24 MP), side length and SVG size, enforced before allocating the canvas. **Fixed during this review**: PDF used the same 64 MP limit although it holds the pixels about three times (RGBA, RGB, compressed), i.e. roughly 450 MB at once; it now has its own 24 MP limit. Drawing yields to the browser about every 12 ms and can be cancelled; one export runs at a time.
- **Private data**: selection-only output contains only the selected elements, their connectors and labels (a test asserts an unselected label is absent). Exports are generated locally; nothing is uploaded.
- **Cleanup**: canvases are zeroed, the temporary link is removed, the object URL is revoked after 30 s, the abort controller is aborted on unmount.
- **Clipboard**: unsupported API and permission denial map to user-facing errors; a real denial could not be provoked in headless Chrome (simulated).
- **Not assessed**: Safari/Firefox behaviour, a signed-in editor session.

## DA-006 Malformed board id crashes the page (Low, pre-existing)
`/whiteboard/abc123` renders "Application error: a client-side exception" because the Convex query `whiteboard:getAccess` throws `ArgumentValidationError` for a non-id argument and the page does not catch it. No data is exposed (the validator rejects it), but an invalid or stale link gives a crash instead of a not-found state. Fix idea: validate the id format before querying, or add an error boundary for the board route. Not changed in this pass.
