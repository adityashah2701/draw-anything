# Dependency upgrade for DA-003 (2026-10-16)

Environment: Node 24.6.0, npm 11.5.1, macOS. Branch `worktree-agent-a7c00caf7dca72d73`. Changes are uncommitted: `package.json`, `package-lock.json` and this file. No source file was edited.

## Result

| | Before | After |
|---|---|---|
| `npm audit --omit=dev` | 15 (3 critical, 9 high, 3 moderate) | **0** (exit 0) |
| `npm audit` (incl. dev) | 35 (4 critical, 24 high, 7 moderate) | 20 (1 critical, 15 high, 4 moderate), all dev-only |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | "No ESLint warnings or errors" | same (plus a new `next lint` deprecation notice) |
| `npx vitest run` | 66 files, 742 tests passed | 66 files, 742 tests passed |
| `npm run build` | passed, Next 15.4.10 | passed, Next 15.5.28, same 7 routes |
| `npm run test:browser` | 120 passed, 11 skipped (10 files passed, 1 skipped) | 120 passed, 11 skipped (same) |

## Changes

`package.json` (5 version specs changed and one new `overrides` block):

| Package | Old | New | Why |
|---|---|---|---|
| `next` | `15.4.10` | `15.5.28` (exact) | Fixes every direct Next advisory. 15.5.28 is the newest 15.x (`backport` dist-tag). |
| `react`, `react-dom` | `19.1.0` | `19.1.10` (exact) | Newest 19.1.x. Needed because `@clerk/nextjs` 6.39.x peers on `~19.1.4`; this removed the ERESOLVE. |
| `@clerk/nextjs` | `^6.30.0` (locked 6.30.0) | `^6.39.7` (locked 6.39.7) | Floor raised so a fresh resolve cannot pick a vulnerable 6.x. |
| `svix` | `^1.71.0` (locked 1.71.0) | `^1.99.1` (locked 1.99.1) | Floor raised; drops the vulnerable `uuid`. |
| `overrides` | none | `{"next": {"postcss": "8.5.23"}}` | See "Override" below. |

Lockfile-only moves (from `npm audit fix --omit=dev`, no `--force`): `@clerk/backend` 2.7.0 -> 2.33.7, `@clerk/clerk-react` 5.40.0 -> 5.61.10, `@clerk/shared` 3.18.1 -> 3.48.0 (the second copy under `@clerk/themes` is gone, deduped), `@clerk/types` 4.74.0 -> 4.101.27, `js-cookie` 3.0.5 -> 3.0.7, `lodash` 4.17.21 -> 4.18.1, `nanoid` 3.3.16 -> 3.3.20, `form-data` 4.0.5 -> 4.0.6, `source-map-js` 1.2.1 -> 1.2.2, `sharp` 0.34.3 -> 0.35.5, `fflate` 0.8.2 -> 0.8.3 and 0.6.10 -> 0.6.11, `uuid` 10.0.0 removed, plus small bumps (`semver`, `hasown`, `detect-libc`) and removed packages that `svix` 1.99 no longer needs (`svix-fetch`, `url-parse`, `querystringify`, `requires-port`, `es6-promise`, `whatwg-fetch`, `cookie`, `color`, `color-string`, `simple-swizzle`, `is-arrayish`).

`eslint-config-next` stays at 15.4.6 (it was already behind `next` 15.4.10; lint still passes). Not bumped to keep the change small.

### Override (why it exists)
`next` pins `postcss` exactly to 8.4.31, which is flagged (4 advisories, fixed in 8.5.23+). The only npm-suggested fix is Next 16.4.2, a major jump. Next 16.4.2 itself pins `postcss` 8.5.23, and `@tailwindcss/postcss` in this repo already uses 8.5.23, so the override puts Next 15 on a version Next 16 ships. The tree now has a single `postcss` (8.5.23). npm did not apply the override until the stale `node_modules/next/node_modules/postcss` entry was removed from the lockfile; that was done with a small script and then `npm install`. If `next` is ever bumped, re-check whether the override is still needed.

## Advisories and whether they apply

Applicability is judged from advisory titles and from how the repo uses each feature; I did not read every advisory body. Everything below is fixed regardless.

**next (about 30 advisories, all fixed in 15.5.28 or not reachable):**
- Middleware/Proxy bypass (App Router segment-prefetch, dynamic route parameter injection; redirect cache poisoning): the app uses `clerkMiddleware()` on the App Router, so these apply in principle. `middleware.ts` does no route protection itself (authorisation is in Convex and the route handlers), so practical impact was lower. Pages Router i18n bypass: not applicable (no `pages/`).
- Server Components DoS / deserialization, Server Action DoS, internal Server Function endpoint disclosure: apply (App Router, `app/actions/organization.ts` uses `"use server"`).
- Cache poisoning / confusion (RSC, SSG/ISR, bodies): apply to self-hosted or CDN-fronted deployments; hosting is not known to me.
- Image optimizer (unbounded disk cache, DoS, AVIF RCE): apply to a self-hosted `next start` (four components import `next/image`). `remotePatterns` SSRF: no `images` config, so not applicable.
- Rewrites smuggling / SSRF, CSP nonce XSS, `beforeInteractive` XSS, Cache Components, Server Actions SSRF on custom servers, edge-runtime Server Action payload, Windows RCE: not applicable (no rewrites, no CSP, no `beforeInteractive`, no Cache Components, no custom server, no edge routes; Windows hosting unknown).

**@clerk/nextjs, @clerk/shared, @clerk/backend, @clerk/clerk-react:**
- GHSA-vqx2-fgx2-5wq9 middleware-based route protection bypass: `clerkMiddleware()` is in use, so it applies in principle; the middleware protects no routes, so low practical impact.
- GHSA-w24r-5266-9c3c authorisation bypass when combining organisation, billing or reverification checks: the repo only renders `<PricingTable />`; it has no `has()`, `<Protect>` or `auth.protect` call, so its own checks were not exposed.
- `js-cookie` prototype hijack (through `@clerk/shared`): client-side dependency, applies in principle.

**Build-time or low reach:** `postcss` (4 advisories: needs attacker-controlled CSS or source maps; Next uses it in its webpack CSS pipeline on repo CSS, so not exploitable at runtime), `sharp` (image optimizer only; same exposure as the image items above), `source-map-js` (build time), `nanoid` (zero-size custom generator), `lodash` (used through `recharts`; `_.template`/`_.unset` need attacker-controlled keys), `form-data` (through `groq-sdk` types/fetch shim), `fflate` (`three-stdlib`, malformed ZIP64 only), `uuid` (v3/v5/v6 with caller-supplied buffer, through `svix`).

## Commands run and results

Baseline (before any edit): `npm install` ok (no lockfile change); `npm audit --omit=dev` 15; `npx tsc --noEmit` exit 0; `npm run lint` clean; `npx vitest run` 742 passed; `npm run build` exit 0; `npm run test:browser` 120 passed, 11 skipped; `npm ci --dry-run` exit 0.

Changes:
1. `npm install --save-exact next@15.5.28 react@19.1.10 react-dom@19.1.10`: ok, no ERESOLVE; prod audit 15 -> 15 (next critical gone, now only via bundled `postcss`).
2. `npm audit fix --dry-run`: **crashed** with `TypeError: Cannot read properties of null (reading 'edgesOut')` in `#loadPeerSet` (an npm 11.5.1 bug in the dev/peer tree, around vitest optional peers). `npm audit fix --omit=dev --dry-run` worked, so `npm audit fix --omit=dev` was run: "added 57, removed 15, changed 19", prod audit left 2 (`next`, `postcss`). It temporarily pruned dev dependencies from `node_modules`; `npm install` restored them.
3. Edited `package.json` (floors for `@clerk/nextjs` and `svix`, `overrides`), removed the stale lock entry, `npm install`: `npm audit --omit=dev` = "found 0 vulnerabilities".
4. Verification: `npx tsc --noEmit` exit 0 (covers `middleware.ts` and `convex/http.ts`); `npm run lint` clean; `npx vitest run` 742 passed; `npm run build` exit 0; `npm run test:browser` 120 passed, 11 skipped; `npm ci` (real, deleted and reinstalled `node_modules`) succeeded; `npm ci --dry-run` exit 0.

Build comparison (same 7 routes: `/`, `/_not-found`, `/api/ai/generate-diagram`, `/api/liveblocks-auth`, `/billing`, `/create-org`, `/whiteboard/[id]`): shared First Load JS 100 kB -> 103 kB, `/whiteboard/[id]` 361 -> 365 kB, middleware 79.1 -> 85 kB. No build warnings beyond the two noted below.

Runtime smoke test, unauthenticated (`next start -p 3117` on the new build, then stopped): `/`, `/billing`, `/whiteboard/abc` return 200 with `x-clerk-auth-status: signed-out` (so `clerkMiddleware` runs) and the four headers from `next.config.ts`; `POST /api/liveblocks-auth` 401; `POST /api/ai/generate-diagram` 401; `GET /api/liveblocks-auth` 405. I did not run the same checks on the old build, so these show "works", not "unchanged".

Svix check: `Webhook.sign` then `verify` round trip succeeds on 1.99.1 and a tampered body throws `WebhookVerificationError` (this is the API `convex/http.ts` uses).

## Deprecations and warnings seen

- `next lint` is deprecated in 15.5 and removed in Next 16 (`npx @next/codemod@canary next-lint-to-eslint-cli .`). Not acted on.
- npm deprecation notices for `@clerk/clerk-react` 5.61.10 and `@clerk/types` 4.101.27 (Clerk "core 3" migration, which is Clerk 7). Not acted on; no major jump.
- "Next.js inferred your workspace root ... multiple lockfiles": caused by this worktree sitting inside the main repo, which also has a `package-lock.json`. It appeared in the baseline too and is not caused by the upgrade.

## Remaining vulnerabilities

Production: none. Dev-only, 20 (1 critical, 15 high, 4 moderate), in the ESLint/TypeScript-ESLint toolchain (`eslint-config-next`, `@next/eslint-plugin-next`, `@typescript-eslint/*`, `braces`, `micromatch`, `fast-glob`, `minimatch`, `brace-expansion`, `picomatch`, `js-yaml`, `flatted`, `ajv`, `@humanfs/node`), `tar` (critical, through `@tailwindcss/oxide`, a build tool), and `vitest`/`@vitest/mocker`. They are outside the `--omit=dev` scope of DA-003 and do not ship. `npm audit fix` cannot run on the full tree (npm crash above); the `eslint-config-next` fix npm proposes is a downgrade to 14.2.35 (semver-major), which I did not take.

## Lockfile

`package-lock.json` was not regenerated from scratch; npm edited it in place. Diff: 356 insertions, 441 deletions (about 12,000 lines in the file); 73 entries changed, about 36 of them platform-specific optional binaries (`@next/swc-*`, `@img/*`, `lightningcss-*`, `@esbuild/*`). `package.json` diff: 15 lines. `npm ci` works before and after with npm 11.5.1 (`npm ci --dry-run` exit 0 on the original `package.json` + lockfile as well), so I could not reproduce "npm ci fails"; it may depend on the npm version. One pre-existing inconsistency remains: `npm ls` reports `esbuild@0.25.4` invalid for `vitest/vite` (wants `^0.27 || ^0.28`); it is unchanged from the original lockfile, dev-only, and does not stop `npm ci`.

## Risks (not tested)

- No signed-in flow was run: Clerk sign-in, org switching, `<PricingTable />`, Convex auth with the `convex` JWT template, Liveblocks auth with a real session, the Clerk webhook into Convex, AI generation.
- Clerk jumped 9 minor versions (6.30 -> 6.39) and `@clerk/shared`/`backend` more. Types and build pass; behaviour at runtime is untested.
- `svix` jumped 28 minors; the sign/verify round trip works, but a real Clerk webhook through `convex/http.ts` was not exercised. Convex bundles `svix` from `node_modules` on `npx convex deploy`.
- React 19.1.0 -> 19.1.10 and Next 15.4 -> 15.5: browser tests, unit tests and a build pass; the editor was not driven by hand.
- `postcss` override: build output is correct and CSS compiled, but the CSS was not compared byte for byte with the old build.
- Deploy order from CLAUDE.md (Convex before the app) is unaffected by this change, but redeploy Convex so the new `svix` is bundled.

## Recommendation

Merge after a manual smoke test of a signed-in session (sign in, open a board, billing page, create an org) on a preview deployment, and a Clerk webhook test event against the deployed Convex HTTP endpoint.
