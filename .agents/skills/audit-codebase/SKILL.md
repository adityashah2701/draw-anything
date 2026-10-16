---
name: audit-codebase
description: Audit a codebase for security vulnerabilities by first mapping its attack surface (reconnaissance), then spawning specialized parallel sub-agents that hunt for specific vulnerability classes, each armed with the matching reference file bundled in this skill. Use this whenever the user wants a security review, a vulnerability scan, an audit, a pentest-style pass, or asks "is this code safe / exploitable", "check X for vulnerabilities", "review the auth", or points at a repo, service, or directory and asks what could go wrong. Trigger even when the user names only a stack ("audit my Django API") or a single concern ("is this endpoint injectable") — reconnaissance will widen it appropriately. This is a defensive audit of code the user controls; it reports findings and fixes, it does not weaponize them.
---

Security audits fail in two opposite ways: a shallow grep that pattern-matches `eval(` and calls it a day, or an undirected "look for everything" pass that spreads attention so thin it finds nothing real. This skill avoids both by working the way a competent auditor does — **look before you dig**.

1. **Reconnaissance** — map what the target actually exposes (entry points, trust boundaries, framework, data stores, auth model) so the search is aimed, not sprayed.
2. **Targeted specialists** — spawn **parallel sub-agents**, each responsible for a cluster of related vulnerability classes, but *only* for the classes the reconnaissance made plausible. Each specialist reads the deep-dive reference file bundled in this skill for its classes before touching code.
3. **Aggregate & triage** — collect every finding into one severity-ranked report the user can act on.

Recon runs in the main context; specialists run isolated so a huge SQL-injection reference doesn't crowd out the XSS hunter's context and vice-versa.

## What's bundled in this skill

Three reference directories sit next to this file. **Do not read them all up front** — reconnaissance decides which few are relevant, and only those get loaded (by you for the stack files, by the sub-agents for their vuln files). Read a file with `view`/`cat` at the path shown.

**`frameworks/`** — framework-specific sinks, sources, and safe/unsafe patterns:
`django.md`, `fastapi.md`, `nestjs.md`, `nextjs.md`

**`technologies/`** — auth/data platform pitfalls (rules, tokens, RLS):
`auth0.md`, `firebase_firestore.md`, `supabase.md`

**`vulnerabilities/`** — one deep-dive per class; these are the specialists' ammunition:
`authentication_jwt.md`, `broken_function_level_authorization.md`, `business_logic.md`, `csrf.md`, `header_injection.md`, `http_request_smuggling.md`, `idor.md`, `information_disclosure.md`, `insecure_deserialization.md`, `insecure_file_uploads.md`, `llm_prompt_injection.md`, `mass_assignment.md`, `nosql_injection.md`, `open_redirect.md`, `path_traversal_lfi_rfi.md`, `prototype_pollution.md`, `race_conditions.md`, `rce.md`, `sql_injection.md`, `ssrf.md`, `ssti.md`, `subdomain_takeover.md`, `xss.md`, `xxe.md`

If a relevant reference file is missing, note it and fall back to your own knowledge for that class rather than skipping the class entirely.

## Process

### 1. Scope the target

Whatever the user pointed at is the scope — a repo root, a subdirectory, a single service, or a named area ("the auth", "the upload endpoint"). If they gave nothing, default to the current repository root and say so. If they named a narrow area, scan it first but still run a light recon of the surrounding entry points, since the injectable endpoint is often not the one they suspected.

Confirm the scope resolves (the path exists / the repo is non-empty) before spawning anything — a bad path should fail here, in the main context, not inside six parallel sub-agents.

### 2. Reconnaissance — map the attack surface

This is the step that makes everything after it aimed. Keep it fast and read-mostly; the goal is a **surface map**, not a fix list. Determine:

- **Languages & frameworks** — from manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Gemfile`, etc.) and directory shape. Match against `frameworks/`.
- **Entry points / sources** — HTTP routes, GraphQL resolvers, webhooks, CLI args, message-queue consumers, file uploads, deserialization points, LLM-facing inputs. These are where attacker-controlled data enters.
- **Dangerous sinks** — raw SQL/ORM escape hatches, shell/`exec`, template rendering, file-path handling, HTTP clients (SSRF), redirects, `pickle`/`yaml.load`/native deserializers, DOM sinks.
- **Trust boundaries & authz model** — where authentication happens, how authorization is enforced (or centralized vs per-handler), session/JWT handling, object-ownership checks.
- **Data stores & platforms** — SQL vs NoSQL, and any managed platform in `technologies/` (Supabase, Firebase/Firestore, Auth0), whose security often lives in rules/RLS config, not code.
- **Config & secrets** — env handling, CORS, security headers, debug flags, exposed error detail.

Read the matching `frameworks/` and `technologies/` files now (usually 1–2 each) — they sharpen recon and get passed to the specialists.

Produce a short **surface map**: stack, the concrete entry points found (with file paths), the platforms in play, and any area that is conspicuously unguarded. Show it to the user before spawning specialists so they can redirect if you misread the app.

### 3. Select vulnerability classes → assign specialists

Map the surface map onto the `vulnerabilities/` files. **Load a class only if recon gives it a foothold** — no file-upload handler means `insecure_file_uploads.md` stays closed; no outbound HTTP client means SSRF is unlikely. Being selective is the whole point: it keeps each specialist deep rather than broad.

Signal → class (guide, not exhaustive):

| Recon signal | Candidate classes |
|---|---|
| Raw SQL / ORM `.raw()` / string-built queries | `sql_injection` |
| MongoDB / query objects from user input | `nosql_injection` |
| Template rendering with user data | `ssti`, `xss` |
| `exec`/`system`/`child_process`/`eval` | `rce` |
| `pickle`/`yaml.load`/Java/Node native deserialize | `insecure_deserialization` |
| XML parsing | `xxe` |
| File path built from input; upload handlers | `path_traversal_lfi_rfi`, `insecure_file_uploads` |
| Outbound HTTP from user-supplied URL | `ssrf` |
| Redirects using a request param | `open_redirect` |
| Resource fetched by ID without ownership check | `idor`, `broken_function_level_authorization` |
| Bulk create/update from request body | `mass_assignment` |
| JWT / session / login / password reset | `authentication_jwt` |
| State-changing GET/POST without token | `csrf` |
| Reflected/stored user data in responses/DOM | `xss` |
| Object merge / `__proto__` reachable | `prototype_pollution` |
| Multi-step flows, balances, quotas, coupons | `business_logic`, `race_conditions` |
| Header reflection / proxy / caching layer | `header_injection`, `http_request_smuggling` |
| Stack traces, verbose errors, debug on | `information_disclosure` |
| LLM prompt built from user/external content | `llm_prompt_injection` |
| Dangling DNS / unclaimed cloud resources | `subdomain_takeover` |

**Cluster the selected classes into 3–6 specialist sub-agents** by theme so related classes share context and cross-reference each other. A sensible default grouping (drop any cluster with no selected classes):

- **Injection** — `sql_injection`, `nosql_injection`, `ssti`, `rce`, `xxe`, `insecure_deserialization`, `llm_prompt_injection`
- **Access control** — `idor`, `broken_function_level_authorization`, `mass_assignment`, `authentication_jwt`, `business_logic`
- **Web/client** — `xss`, `csrf`, `open_redirect`, `prototype_pollution`
- **Server-side requests & files** — `ssrf`, `path_traversal_lfi_rfi`, `insecure_file_uploads`
- **Protocol & exposure** — `header_injection`, `http_request_smuggling`, `information_disclosure`, `subdomain_takeover`, `race_conditions`

Fewer, fuller agents beat many thin ones. If only two classes survive selection, one or two agents is fine.

### 4. Spawn the specialists in parallel

Send a single message with one `Agent` tool call per cluster (use the `general-purpose` subagent). Isolating them keeps each one's context focused on its own references. Each specialist prompt must include:

- **Scope & how to look** — the scan path and the diff/entry-point map from recon, so it knows where to concentrate.
- **Its reference files** — the exact `vulnerabilities/…md` paths for its assigned classes, **plus** the relevant `frameworks/…md` and `technologies/…md` paths. Tell it to read these *first* — they carry the framework-specific sinks and safe patterns it should check against.
- **The brief:**

  > "You are auditing for [classes] only. Read your reference files first, then trace each attacker-controlled input from source to sink through the scoped code. For every issue report: **class**, **severity** (Critical/High/Medium/Low), **file:line**, a one-line explanation of the data flow that makes it exploitable, a short evidence snippet, and a concrete fix. Rank a finding by real reachability — an unauthenticated, attacker-reachable sink is Critical; a theoretical issue behind three guards is Low. Separate **confirmed** findings (you traced the full path) from **suspected** (looks wrong but you couldn't confirm reachability). Do not report generic best-practice nags with no reachable sink. Do not write or run exploit payloads against live systems. Be concrete and under 500 words."

Give every specialist the same recon map so nothing has to re-derive the surface. If a class was selected but its reference file is missing, tell the specialist to use its own knowledge and flag the gap.

### 5. Aggregate & triage

Collect the specialists' reports into one document. Do **not** silently drop or soften anything — deduplicate where two specialists flagged the same line, and merge those into a single entry noting both angles.

Use this structure:

```
# Security scan — <scope>

## Summary
- Stack & surface: <one-line recap from recon>
- Findings: <N> Critical, <N> High, <N> Medium, <N> Low
- Classes covered: <list>   |   Skipped (no foothold): <list>

## Confirmed findings
(ordered by severity, then reachability)
### [SEVERITY] <Class> — <file:line>
- **Flow:** how attacker input reaches the sink
- **Evidence:** short snippet
- **Fix:** concrete remediation

## Suspected / needs verification
<same shape, for unconfirmed items>

## Not assessed
<classes skipped and why — so the user knows the scan's edges>
```

Lead with the single most serious confirmed finding in one sentence at the very top. Be honest about coverage: listing what was skipped and why matters as much as the findings, because it tells the user where the scan's blind spots are. Do not overstate confidence — a suspected finding stays in its section until the path is traced.

## Why recon first

Spawning all 24 specialists on every scan would burn context and bury real issues under noise from classes the app can't even express (SSTI on a service with no template engine, XXE where no XML is parsed). Reconnaissance is what earns the right to go deep: it converts a vague "find vulnerabilities" into a short list of *reachable* classes, and hands each specialist a map so it spends its context tracing data flows instead of rediscovering the app. The separation between confirmed and suspected exists for the same reason the recon exists — to keep the report trustworthy, so a Critical means Critical.