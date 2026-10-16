# Draw Anything security audit (2026-10-16, first pass)

Scope of the first pass: static grep and code reading of injection sinks, security headers, committed secrets, the Liveblocks auth route, `npm audit --omit=dev`.

Scope of the second pass (2026-10-16): every Convex function for authorization, the AI route and diagram agent for abuse and prompt-injection surface, the Liveblocks auth route, the Clerk webhook, and a grep for HTML/eval/redirect/URL sinks. All of it is **code reading plus unit tests; nothing was run against a live Clerk/Convex/Liveblocks deployment**, so every "Confirmed" below means "confirmed in code", and findings marked "not reproduced" have not been exercised.

Not assessed (either pass): live XSS reproduction on the running app, CI/CD config, hosting/CDN headers, Clerk dashboard settings (sign-up restrictions, org-creation permissions, JWT template contents), Convex dashboard settings and the production deployment's env, Liveblocks dashboard settings, Convex file-storage behaviour (served content types, quotas), dependency CVE applicability per advisory, Safari/Firefox, load or fuzz testing. This is not a statement that the app is vulnerability-free.

## Findings

| ID | Severity | Confidence | Status |
|----|----------|------------|--------|
| DA-001 Stored XSS via label HTML parsing | High | High (the old pattern was reproduced firing a handler in Chrome) | Fixed, regression test added |
| DA-002 No security response headers | Low | High | Fixed |
| DA-003 Vulnerable dependencies (Next, Clerk, transitive) | High/Critical per `npm audit` | Medium (advisory applicability not checked per CVE) | Open, needs decision |
| DA-004 No Content-Security-Policy | Low | High | Report-Only policy shipped; enforcement open |
| DA-005 Export review (SVG injection, tainting, limits, leaks) | n/a | High (tested in Chrome) | No vulnerability found; one resource risk fixed |
| DA-006 Invalid board id crashes the board page | Low | High (reproduced) | Fixed (validator + error boundary), unit tested |
| DA-007 Board creation fails open when the token has no org claim | Medium | Medium-High (code; JWT template contents unknown) | Open, Convex patch proposed, not applied |
| DA-008 Webhook and `storeUser` can create duplicate user rows, which locks the user out | Medium | Medium (code; race not reproduced) | Open, Convex patch proposed, not applied |
| DA-009 `convex/auth.config.ts` hard-codes the Clerk dev issuer | Medium (config) | High that it is hard-coded; unknown whether prod deploys it | Open, Convex patch proposed, not applied |
| DA-010 Clerk's own "create organization" UI bypasses the free-plan limit | Low | High (code) | Open, needs a Clerk dashboard setting |
| DA-011 No quotas or size limits on signed-in writes; unused public `aiMemory` endpoints | Low-Medium | High (code) | Open, Convex patch proposed, not applied |
| DA-012 Collaborator-controlled `imageUrl` rendered by a plain `<img>` | Low | High (code) | Open, Convex patch proposed, not applied |
| DA-013 AI route cost and abuse controls are thin | Low-Medium | High for the gaps; cost multiplier suspected, not measured | Open, partly proposed |
| DA-014 AI handler reads the whole body before the size check | Low | High (code) | Open, `features/` patch proposed, not applied |
| DA-015 AI prompt-injection surface | Low (today) | Medium-High | No vulnerability found; one latent risk noted |
| DA-016 Liveblocks auth: no rate limit, Clerk API call per request, token outlives membership | Low | Medium | Open, accepted/design |
| DA-017 Clerk webhook signature verification | n/a | High (code) | Sound; replay/idempotency gap tracked in DA-008 |
| DA-018 HSTS missing, `X-Powered-By` exposed | Low | High | Fixed |
| DA-019 HTML/eval/redirect/URL sink grep | n/a | High (grep + reading) | No new vulnerability found |

### DA-001 Stored XSS in `normalizeRichTextInput`
- File: `features/whiteboard/utils/rich-text-renderer.ts` (`editableHtmlToMarkdown`, string branch).
- Class: DOM XSS. Label text containing something that looks like HTML (`/<\/?[a-z][\s\S]*>/i`) was assigned to `innerHTML` of a detached `div`. Detached nodes do not run `<script>`, but `<img src=x onerror=...>` still fires.
- Preconditions: attacker controls label text another user opens (a collaborator in the shared org, an imported or AI-generated label, or a prompt-injected AI answer).
- Impact: script runs in the victim's Clerk session on the app origin.
- Fix: parse with `DOMParser` (inert document, no resource loading or handlers). Behaviour for valid input is unchanged.
- Regression test: `tests/browser/rich-text-xss.browser.test.ts` (real Chrome): a control case shows `innerHTML` on a detached div fires `<img onerror>`; five hostile inputs through `normalizeRichTextInput` run nothing and reduce to their text.
- Other sinks reviewed and found safe: `markdownToEditableHtml` escapes every text span before `innerHTML` assignment; `components/ui/chart.tsx` is shadcn CSS injection from static config.

### DA-002 Security headers
`next.config.ts` had no headers. Added `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`. Not verified against a running build (the header list was loaded through Next's own config loader and printed; see DA-004/DA-018).

### DA-003 Dependencies
`npm audit --omit=dev`: 15 vulnerabilities (3 critical, 9 high, 3 moderate). Direct: `next` 15.4.10 (fix: 15.5.x, not semver-major) and `@clerk/nextjs`. Clerk 6.39.x peers on React `~19.1.4`, but the repo pins `react@19.1.0`, so `npm audit fix` fails with ERESOLVE. Not applied: it needs a React patch bump and a lockfile rewrite (the lockfile is already out of sync) and cannot be build-verified without Clerk and Convex keys. Recommended: bump `next`, `react`, `react-dom` together, run `npm install`, `npm run build`, then re-audit.

### DA-004 Content-Security-Policy (Report-Only shipped)
`next.config.ts` now sends `Content-Security-Policy-Report-Only`, built by `lib/security/csp.ts` (`buildContentSecurityPolicy`, unit tested in `lib/security/csp.test.ts`). Report-Only means browsers log violations to the console and block nothing, so it cannot break the app. There is **no reporting endpoint** (`report-uri`), on purpose: an unauthenticated POST route that logs bodies is itself an abuse surface. To enforce, first browse the app with the console open (sign-in, dashboard, board, AI panel, export), fix every violation, then rename the header to `Content-Security-Policy`.

Origins are derived from what the code loads: Clerk (`ClerkProvider` in `providers/convex-client-provider.tsx`), Convex (`ConvexReactClient`), Liveblocks (`createClient` in `liveblocks.config.ts`), fonts (`next/font/google` in `app/layout.tsx`, which self-hosts at build time). The Clerk frontend host is decoded from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (the base64 part of `pk_test_`/`pk_live_`) and validated against a host pattern, so a bad value cannot inject a directive; if it cannot be decoded the policy falls back to `https://*.clerk.accounts.dev`. The Convex origin comes from `NEXT_PUBLIC_CONVEX_URL` (https gives https and wss, http gives http and ws). Only env var NAMES were read; no values were printed.

| Directive | Value | Why |
|-----------|-------|-----|
| `default-src` | `'self'` | Everything not listed below is same-origin only. |
| `script-src` | `'self' 'unsafe-inline'` + Clerk host + `https://challenges.cloudflare.com` (+ `'unsafe-eval'` in `next dev` only) | Next.js emits inline bootstrap/hydration scripts; a nonce would need middleware changes and dynamic rendering. Clerk loads `clerk-js` from its frontend API host; Clerk bot protection uses Cloudflare Turnstile. React dev mode uses `eval`. **Weakness:** with `'unsafe-inline'`, this policy does not stop injected inline scripts; it still limits where scripts can load from. A nonce-based policy is the follow-up for real XSS protection. |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind output is a file, but Next, Radix, `sonner` and the chart component inject inline styles. |
| `img-src` | `'self' data: blob: https:` | Avatars come from Clerk (`img.clerk.com`) and Google/OAuth providers, board thumbnails from Convex storage; export and image-upload preview use `blob:`/`data:`. `https:` is broad on purpose, narrow it after observing real hosts. |
| `font-src` | `'self' data:` | `next/font/google` serves Geist from the app's own origin. |
| `connect-src` | `'self'`, Convex https+wss, Clerk host, `https://clerk-telemetry.com`, `https://api.liveblocks.io`, `wss://api.liveblocks.io` (+ `ws:` and `http://localhost:*` in dev for HMR) | `fetch`/WebSocket targets: the app's own API routes (including the AI SSE stream), Convex realtime, Clerk, Liveblocks. AI model providers are called server-side only and are not listed. |
| `frame-src` | `https://challenges.cloudflare.com` | Turnstile challenge iframe. |
| `worker-src` | `'self' blob:` | Defensive: Clerk and bundlers can create blob workers. |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'self'` | Stops an injected `<base>` from redirecting relative URLs. |
| `form-action` | `'self'` | Injected forms cannot post elsewhere. |
| `frame-ancestors` | `'self'` | Same intent as `X-Frame-Options: SAMEORIGIN`. |

Not included: `upgrade-insecure-requests` (ignored in Report-Only), a reporting endpoint, `require-trusted-types-for` (the DOM-XSS fix in DA-001 is the primary control). Not verified in a browser against a signed-in session: Clerk's exact host list can change between `@clerk/nextjs` versions, so expect a few console reports on first run and add the hosts they name.

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

## DA-006 Malformed board id crashes the page (Low, pre-existing) - FIXED
`/whiteboard/abc123` rendered "Application error: a client-side exception" because `useQuery(api.whiteboard.getAccess, { id })` throws `ArgumentValidationError` for a non-id argument and nothing caught it. No data was exposed (the Convex validator rejects the value); the harm was a crash instead of a not-found page.

Fix, all in files outside `features/`:
- `lib/whiteboard-id.ts` (`isPlausibleWhiteboardId`): a shape check run before any Convex query. Convex ids are documented as roughly 31-37 characters of lowercase base32 (decoding happens server-side and no real id exists in this repo, so the format could not be checked locally); the check accepts the much wider 16-64 letters/digits in any case, because a false rejection (a real board that cannot be opened) is worse than a crash. It only has to turn junk such as `abc123` into the existing "Whiteboard not found" view.
- `app/whiteboard/[id]/page.tsx`: an implausible id skips the query (`"skip"`) and renders the existing not-found view; the realtime room is never created for it.
- `app/whiteboard/[id]/error.tsx`: a route error boundary, so an id that passes the shape check but is still invalid, or any other failing query or room connection, shows "This whiteboard could not be loaded" with Try again / Back instead of a blank crash. (There is still no error boundary for the dashboard route or a root `global-error.tsx`.)
- Tests: `lib/whiteboard-id.test.ts` (real-shaped ids, boundary lengths, either case, the reproduced `abc123`, path-like and control-character input, non-strings). The page and boundary wiring are not unit tested (no React renderer is installed) and were not exercised in a browser because the route needs Clerk and Convex.


## Second pass: Convex, AI route, Liveblocks, webhook (2026-10-16)

Method: read every function in `convex/*.ts` and the shared rule in `convex/lib/access.ts` + `convex/lib/accessRules.ts`; read `app/api/*`, `app/actions/*`, `middleware.ts`, `features/ai/server/{generate-diagram-handler,request-guard}.ts`, `features/ai/diagram-agent/{agent-loop,tools/index,pipeline}.ts`, and the prompt/context code. Statuses: **Confirmed in code** = the code does what is written; **Suspected** = depends on something not visible here. Patches to `convex/**` and `features/**` are **proposed, not applied** (other owners; Convex must be deployed before the app).

### Convex authorization matrix (DA-007 to DA-012 context)
Public functions (callable by any browser with the deployment URL) and what gates them:

| Function | Gate | Notes |
|----------|------|-------|
| `whiteboard.create` | `requireCaller` + `canCreateInOrg` | DA-007 |
| `whiteboard.getAll` | `requireCaller`; org members see the org's boards, others only their own in that org | returns full `content` of every board (data minimisation/perf, not a leak) |
| `whiteboard.remove` | `requireCaller` + creator only | deliberately stricter than the shared rule; does not delete the board's `aiFrames`/`aiMemories`/`aiDecisions` or its Liveblocks room (retention) |
| `whiteboard.update`, `updateImage`, `removeImage`, `editImage` | `requireWhiteboardAccess` (shared rule) | unbounded `content`/`title`/`tags`; arbitrary `imageUrl` (DA-011, DA-012) |
| `whiteboard.getById`, `getAccess` | `getCaller` + shared rule, `null` for everyone else | sound |
| `whiteboard.generateUploadUrl` | `requireCaller` only | no size/type/quota (DA-011) |
| `users.storeUser` | Clerk identity only | race with webhook (DA-008) |
| `users.getCurrentUser` | identity; own record | sound |
| `users.getById` | `getCaller`; `toUserView` strips email/plan/billing for other users | sound; exposes `clerkId`, name, picture of any user whose id is known (ids unguessable) |
| `users.createUser`, `deleteUser`, `updateSubscription` | `internalMutation` | not callable from clients; sound |
| `aiFrames.create`, `appendCheckpoint`, `complete`, `fail` | `requireCaller`; frame owner only; board access via shared rule | sound; a global `frameId` is first-come (a stranger who knows an id cannot adopt it) |
| `aiFrames.listByWhiteboard` | `getCaller` + shared rule | returns every member's prompts and graphs on the board (intended); unbounded `.collect()` |
| `aiMemory.createMemory`, `listByWhiteboard`, `createDecision`, `listDecisionsByFrame` | `requireCaller`/`getCaller` + shared rule or frame owner | **no caller in the app** (grep over `features`, `hooks`, `app`): dead public surface (DA-011) |

No function returns data or accepts a write for an anonymous caller except where `getCaller` returns `null`/`[]`. Authorization is consistently the shared rule where a board is involved; the weak points are the *inputs* the rule trusts (the org claim) and missing resource limits.

### DA-007 Board creation fails open when the token has no organization claim
- Severity: Medium. Confidence: Medium-High (code); whether production tokens carry `org_id` is unknown. Status: open, **proposed, not applied**.
- File: `convex/lib/accessRules.ts:51` (`canCreateInOrg`), used by `convex/whiteboard.ts:49` (`create`).
- Class: broken access control / trust of caller-supplied identifier.
- Behaviour: `canCreateInOrg` returns `true` when the token has no `org_id`. Any signed-in user whose active session has no organization (a personal session) can call `whiteboard.create({ title, orgId: "<any org id>" })`. Members of that org (whose tokens do carry `org_id`) then see the board in `getAll` and may open it, so an outsider can plant boards (and their `content`, labels, image URL) into another organization's dashboard. Org ids are not secret (they appear in URLs, support requests and screenshots). If the `convex` JWT template lacks `org_id` for everyone, the same function also lets every user plant boards anywhere, and org members could not read each other's boards at all.
- Evidence: `lib/authz/access-rules.test.ts` pins the behaviour ("keeps the previous behaviour when the token has no organization claim"). The dashboard only calls `create`/`getAll` with an active organization (`features/dashboard/components/dashboard/dashboard.tsx:58,96`), so requiring the claim does not break the current UI.
- Proposed patch (`convex/lib/accessRules.ts`):
```ts
export const canCreateInOrg = (subject: AccessSubject, orgId: string): boolean =>
  subject.orgId !== undefined && subject.orgId === orgId;
```
  and flip the pinned test in `lib/authz/access-rules.test.ts` to `expect(canCreateInOrg({ userId: "u" }, "org_x")).toBe(false)`. Verify in the Clerk dashboard that the `convex` JWT template emits `org_id` for an active organization before deploying, or creation breaks for everyone.

### DA-008 Webhook `createUser` is not idempotent; a duplicate user row locks the user out
- Severity: Medium (availability of the whole account). Confidence: Medium (code; the race was not reproduced). Status: open, **proposed, not applied**.
- Files: `convex/users.ts:6` (`storeUser`, runs on every client login via `StoreUser` in `providers/convex-client-provider.tsx`), `convex/users.ts:48` (`createUser`, called by the `user.created` webhook), `convex/lib/access.ts:24` (`getCaller` uses `.unique()`).
- Class: race condition / reliability with security impact (denial of access).
- Behaviour: `storeUser` checks for an existing row and inserts if absent; `createUser` inserts without checking. A new user logs in and `storeUser` creates a row; the Clerk webhook (asynchronous, can arrive later or be retried) then inserts a second row for the same `clerkId`. From then on `.unique()` throws "returned more than one result" inside `getCaller`, so every query/mutation that calls it errors for that user. The same happens if Clerk retries or replays `user.created` (svix tolerance window is five minutes, but retries are normal).
- Proposed patch (`convex/users.ts`, `createUser` handler):
```ts
const existing = await ctx.db
  .query("users")
  .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
  .first();
if (existing) {
  await ctx.db.patch(existing._id, { email: args.email, name: args.name || existing.name, imageUrl: args.imageUrl || existing.imageUrl });
  return;
}
await ctx.db.insert("users", { /* as before */ });
```
  and make `getCaller` tolerate old duplicates with `.first()` instead of `.unique()`. Existing duplicates (if any) need a one-off cleanup; check the `users` table for repeated `clerkId`.
- Related, suspected: `storeUser` inserts `identity.name!`, `email!`, `pictureUrl!`; if the JWT template omits any claim, the insert throws, `getCaller` then returns `null`, and the user is "Unauthorized" everywhere.

### DA-009 `convex/auth.config.ts` hard-codes the Clerk development issuer
- Severity: Medium (configuration). Confidence: High that it is hard-coded; unknown whether a production deployment uses this file. Status: open, **proposed, not applied**.
- File: `convex/auth.config.ts:4` (`domain: "https://ultimate-feline-31.clerk.accounts.dev"`, `applicationID: "convex"`), while `.env` already has a `CLERK_JWT_ISSUER_DOMAIN` key that the config ignores.
- Impact: whichever Convex deployment receives this file trusts tokens signed by that Clerk *development* instance. Deployed to production it (a) rejects real production tokens and (b) accepts tokens minted by the dev instance, where sign-up is typically open. Anyone could then become a "user" of the production backend.
- Proposed patch: `domain: process.env.CLERK_JWT_ISSUER_DOMAIN!`, and set that variable per Convex deployment (dev and prod separately) with `npx convex env set`. Verify with `npx convex dev` and a sign-in.

### DA-010 Clerk's own "create organization" UI bypasses the free-plan limit
- Severity: Low (business logic). Confidence: High (code). Status: open; needs a Clerk dashboard setting, not code.
- Files: `app/actions/organization.ts:37-45` enforces "free = 1 organization" only inside `createCustomOrganization`; `components/layout/navbar/desktop-navbar.tsx:32` renders `<OrganizationSwitcher createOrganizationMode="modal" />`, which creates organizations through Clerk directly and never calls the server action.
- Fix: in Clerk, set the maximum organizations per user (or disable member-created organizations) so the limit lives where creation happens. The action also has a count-then-create race (two parallel requests can both pass) and does not validate that `name` is a non-empty string (Clerk rejects bad names itself); both are low impact and unchanged.

### DA-011 No quotas or size limits on signed-in writes; unused public endpoints
- Severity: Low-Medium. Confidence: High (code). Status: open, **proposed, not applied**.
- Files: `convex/whiteboard.ts:190` (`generateUploadUrl`: any signed-in user, no size/type/count limit), `convex/whiteboard.ts:49,131` (`create`, `update`: unbounded `title`, `content`, `tags`), `convex/aiMemory.ts:9,58` (`createMemory`, `createDecision`: unbounded strings and `v.any()` payloads, unlimited rows), `convex/aiFrames.ts` (`finalGraph: v.any()`).
- Class: resource exhaustion. Anyone who can sign up can fill storage and tables; Convex's 1 MiB document limit is the only per-row bound. `updateImage` also accepts any `_storage` id (unguessable, so low risk) and deletes the previously attached file.
- The `aiMemory.*` functions have no caller anywhere in the app and `lookupMemoryContext` is a stub, so they are public attack surface with no benefit. Proposed: delete `convex/aiMemory.ts` (and its tables) until memory is built, or add `v.string()` length checks (`if (args.summary.length > 4000) throw`), a per-user row cap, and a max file size via `ctx.storage.getMetadata` after upload (reject and delete over the limit). Clerk sign-up restrictions (email verification, bot protection) are the first line of defence and were not assessed.

### DA-012 Collaborator-controlled `imageUrl` is rendered by a plain `<img>`
- Severity: Low (privacy). Confidence: High (code). Status: open, **proposed, not applied**.
- Files: `convex/whiteboard.ts:136,284` (`update` and `editImage` accept any string as `imageUrl`), rendered by `features/dashboard/components/dashboard/recent-projects/whiteboard-card.tsx:89` (`<img src={whiteboard.imageUrl}>`, no `next/image` host restriction). `features/dashboard/components/whiteboards/whiteboard-card.tsx:125` uses `next/image`, which only fetches hosts allowed in `images.remotePatterns`; none are configured, so it is not an SSRF vector.
- Impact: any member who can edit a board can point its thumbnail at a server they control; every colleague opening the dashboard then sends that server their IP, user agent and an origin-only referrer (a tracking beacon). `javascript:` in an `img` source does not execute. Nothing in this was exploited.
- Proposed patch (`convex/whiteboard.ts`, in `update` and `editImage` before patching): accept only `/placeholders/<n>.svg` or a Convex storage URL, e.g. `if (imageUrl !== undefined && !/^(\/placeholders\/\d+\.svg|https:\/\/[a-z0-9-]+\.convex\.cloud\/api\/storage\/)/.test(imageUrl)) throw new Error("Invalid image URL")`. Side note, suspected and unverified: with no `remotePatterns`, uploaded Convex-hosted thumbnails shown through `next/image` may not render in production.

### DA-013 AI route: cost and abuse controls
- Severity: Low-Medium. Confidence: High for the gaps listed; the cost multiplier is an estimate from reading `workflow.ts`, not a measurement. Status: open; the limiter and handler are in `features/`, so **proposed, not applied**.
- Header spoofing: **not applicable.** The limiter (`features/ai/server/request-guard.ts`, `createSlidingWindowLimiter`) is keyed by the Clerk `userId` from `auth()` (`app/api/ai/generate-diagram/route.ts:25`), never by IP or `X-Forwarded-For`, and the check runs after authentication and before the body is parsed.
- Gaps (Confirmed in code): (1) the budget is in memory per server instance, so on a multi-instance or serverless deployment the effective limit is `limit x instances`, and it resets on every cold start; (2) no per-user concurrency cap, so a user can start 10 generations at once; (3) no per-account quota, and sign-up is the only barrier to getting a fresh budget; (4) `features/ai/server/model-providers.ts` sets no request timeout or token budget besides `maxTokens: 16384` (SDK defaults apply); (5) the legacy pipeline runs about a dozen sequential model calls per accepted request plus retries and corrective re-asks (`agents/types.ts`, `retry.ts`, one expansion loop), so one allowed request can cost many provider calls. The `agent` pipeline is tighter: four turns, two attempts per turn, and a 60,000-character conversation cap (`diagram-agent/agent-loop.ts`).
- Fix ideas: a shared store (Convex table or Upstash) for the limiter, a concurrency cap of 1-2 per user, `AbortSignal.timeout` on provider calls, and provider-side spend caps in each provider's console (the real backstop).
- Secrets in logs: none found. The only `process.env` key reads are in `model-providers.ts`; log sites (`console.*` under `features/ai`) print ids, counts, phases, and, on an unparseable reply, up to 400 characters of the model's own text (`agents/types.ts:148`), which can echo the user's prompt (privacy, not a credential). Provider SDK error messages written by `retry.ts:114` were not inspected for embedded URLs or headers.

### DA-014 AI handler reads the whole body before checking its size
- Severity: Low. Confidence: High (code). Status: open, **proposed, not applied** (`features/ai/server/generate-diagram-handler.ts:65`).
- `req.text()` buffers the entire request before `parseGenerateRequest` enforces `MAX_BODY_BYTES` (512 KB). An authenticated user can make the server buffer a very large body (bounded only by the platform's own limit). Patch, before `req.text()`: `const declared = Number(req.headers.get("content-length")); if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, "Request is too large.");` (chunked bodies without a length still reach the existing check).

### DA-015 AI prompt-injection surface
- Severity: Low today. Confidence: Medium-High. Status: no vulnerability found; one latent risk.
- What reaches the model: the requester's own prompt (4,000 characters max), and a canvas summary that is **counts and element type names only** (`prompts/constants.ts: contextSummary`, `tools/canvas-reader.ts`), plus `whiteboardId` as text. Other members' labels, imported diagram code and `aiMemories` rows are **not** placed in prompts: `lookupMemoryContext` returns an empty list. So there is no channel for one user's board content to steer another user's generation.
- Tool authorization: the agent's three tools (`search_icons`, `check_diagram`, `finish`) are pure functions over strings (`diagram-agent/tools/index.ts`): no network, filesystem, Convex or Liveblocks access, total (bad input becomes a message), and the loop is bounded (four turns). A successful injection can only make a worse diagram for the user who asked.
- Output handling: model text becomes canvas elements on the requester's client; label rendering is the path fixed under DA-001. `whiteboardId` from the body is only echoed into a prompt line and the SSE `frame.created` event; the server never uses it to read data (it is **not** authorized against Convex, which is fine today because it is unused for access).
- Latent risk: if memory retrieval is later implemented using `aiMemories`/`aiDecisions` (writable by any board member, DA-011), that becomes a stored prompt-injection channel between collaborators; add provenance, length limits and an "untrusted data" delimiter then.
- Request validation (`request-guard.ts`) allow-lists the provider, caps prompt/body/element/ID counts and drops malformed context instead of failing.

### DA-016 Liveblocks auth route
- Severity: Low. Confidence: Medium. Status: open, accepted/design.
- Sound: Clerk session required (`app/api/liveblocks-auth/route.ts:22`), room id shape-checked, access decided by Convex as the user (`getAccess`), every non-success path fails closed (400/401/403/503, tested in `lib/authz/room-access.test.ts`), the secret is read per request, nothing sensitive is returned.
- Gaps: (1) no rate limiting; each call does a Clerk Backend API request (`currentUser()`, line 59) and a Convex query, so one signed-in user could burn the app's shared Clerk API rate budget; reading name/picture from the session token claims would remove the Clerk call. (2) The Liveblocks token is issued with `FULL_ACCESS` and outlives a membership change until it expires (Liveblocks default lifetime; not checked), so a removed member can stay connected for a while. (3) Deleting a board (`whiteboard.remove`) does not delete its Liveblocks room, so the content stays in Liveblocks though nobody can open it (retention). (4) CSRF: both POST routes depend on Clerk's `SameSite=Lax` session cookie; they do not check `Origin`. Acceptable, not exploited.

### DA-017 Clerk webhook (`convex/http.ts`)
Verified in code: the secret is required (missing secret throws, so the endpoint cannot run unverified), `svix-id`, `svix-timestamp` and `svix-signature` are required, the **raw** body (`req.text()`) is verified with `new Webhook(secret).verify` before any JSON parsing or mutation, a failed verification returns 400 and runs nothing, and all handlers call `internalMutation`s. The svix library enforces a five-minute timestamp window. Gaps: events are not de-duplicated by `svix-id` (see DA-008 for the user-row consequence); `subscription.*` handling reads `data.user_id`, which may not be where Clerk puts the payer in billing events (suspected, unverified; if wrong, plan upgrades silently never apply). `user.deleted` removes the user row but leaves their boards.

### DA-018 HSTS and `X-Powered-By` (Low) - FIXED
`next.config.ts` now sends `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`/`preload`; browsers ignore it over plain http, so local development is unaffected) and sets `poweredByHeader: false`. If the app is deployed on a host that already adds HSTS, the duplicate is harmless; remove it if the domain must ever serve plain http. Verified by loading the config through Next's own loader (`next/dist/server/config`) and printing the resolved headers; not verified against a running server.

### DA-019 HTML, eval, redirect and URL sinks
Grep over `app`, `components`, `features`, `core`, `hooks`, `lib`, `providers` for `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function(`, `window.open`, `location.*`, `router.push/replace`, `redirect(`, `target="_blank"`, dynamic `href`/`src`:
- `components/ui/chart.tsx:83`: shadcn `<style>` from static config (reviewed in DA-001).
- `innerHTML` at `whiteboard-editing-overlays.tsx:130` and `canvas-text-block.tsx:175` assign `markdownToEditableHtml(...)`, which escapes every text span (`escapeHtml`) before wrapping in `<strong>/<em>/<br/>`; `shape-label-editor-style.ts:59` is a static string. `rich-text-renderer.ts` parses with `DOMParser` (DA-001).
- Navigation: only static `router.push("/")`, `router.push("/sign-in")` and internal `/whiteboard/${id}` links built from Convex ids. No user-controlled redirect target, no `returnTo`/`redirect_url` handling in app code (Clerk handles its own redirect URLs), no `window.open`, no `target="_blank"` links, no `eval`/`new Function`.
- User-controlled URLs rendered as images: `imageUrl` thumbnails (DA-012) and Clerk/organization avatars (`app-sidebar.tsx`, `member.tsx`), which come from Clerk. An `<img>` source cannot run script.
- Not assessed: third-party component internals, markdown rendering elsewhere, SVG upload (there is none: image upload accepts files to Convex storage and shows them via `<img>`).

### Proposed-but-unapplied patches (summary)
| ID | Target | Change |
|----|--------|--------|
| DA-007 | `convex/lib/accessRules.ts`, `lib/authz/access-rules.test.ts` | `canCreateInOrg` requires a matching org claim |
| DA-008 | `convex/users.ts`, `convex/lib/access.ts` | idempotent `createUser`; `getCaller` uses `.first()` |
| DA-009 | `convex/auth.config.ts` | issuer from `CLERK_JWT_ISSUER_DOMAIN` |
| DA-011 | `convex/aiMemory.ts`, `convex/whiteboard.ts` | remove unused endpoints; length/size/row caps |
| DA-012 | `convex/whiteboard.ts` | validate `imageUrl` |
| DA-013 | `features/ai/server/*` | shared limiter, concurrency cap, call timeouts |
| DA-014 | `features/ai/server/generate-diagram-handler.ts` | `Content-Length` pre-check |

### Test and verification record (second pass)
- `lib/whiteboard-id.test.ts` and `lib/security/csp.test.ts` are new; `lib/authz/*` tests are unchanged and pass.
- The Convex, AI and webhook findings above are from reading code; none was reproduced against a running deployment, and no exploit was attempted.
