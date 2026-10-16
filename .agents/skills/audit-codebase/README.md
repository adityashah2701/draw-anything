# audit-codebase

**A Claude skill that audits your codebase for security vulnerabilities — the way a real auditor would: look before you dig.**

Point Claude at a repo, a service, or a single endpoint, and it maps your attack surface first, then sends specialist agents after only the vulnerability classes your code can actually express. No 24-point checklist sprayed at a codebase that has no XML parser. No token wasted.

---

## Why this exists

Automated security passes usually fail in one of two ways:

| The failure | What it looks like |
|---|---|
| **Too shallow** | A grep for `eval(` and `SELECT * FROM " +`. Pattern-matched, context-free, mostly noise. |
| **Too broad** | "Check for everything." Attention spreads so thin across tens of vulnerability classes that nothing real gets traced end-to-end. |

`audit-codebase` splits the difference with a three-stage flow:

1. **Reconnaissance** — read the codebase and map what it *actually exposes*: entry points, sinks, trust boundaries, framework, data stores, auth model.
2. **Targeted specialists** — spawn parallel sub-agents, each hunting a themed cluster of vulnerability classes, and *only* the classes recon showed a foothold for. Each one loads a deep-dive reference file before touching your code.
3. **Aggregate & triage** — one severity-ranked report, with confirmed findings separated from suspected ones, plus an honest list of what wasn't assessed.

The recon step is what earns the right to go deep. It turns a vague "find vulnerabilities" into a short list of *reachable* classes, and hands each specialist a map so it spends its budget tracing data flows instead of rediscovering your app.

---

## Installation

Clone (or copy) this folder into your Claude skills directory:

```bash
# macOS / Linux
git clone https://github.com/bogenc/audit-codebase ~/.claude/skills/audit-codebase

# Windows (PowerShell)
git clone https://github.com/bogenc/audit-codebase $env:USERPROFILE\.claude\skills\audit-codebase
```

That's it. There's nothing to build, no dependencies, no API keys beyond the Claude session you're already in. The skill is Markdown all the way down.

Verify the layout looks like this:

```
audit-codebase/
├── SKILL.md               # the orchestrator — recon, agent dispatch, triage
├── frameworks/            # framework-specific sinks & safe patterns
│   ├── django.md
│   ├── fastapi.md
│   ├── nestjs.md
│   └── nextjs.md
├── technologies/          # auth & data-platform pitfalls
│   ├── auth0.md
│   ├── firebase_firestore.md
│   └── supabase.md
└── vulnerabilities/       # 24 deep-dives — the specialists' ammunition
    ├── authentication_jwt.md
    ├── broken_function_level_authorization.md
    ├── business_logic.md
    ├── csrf.md
    ├── header_injection.md
    ├── http_request_smuggling.md
    ├── idor.md
    ├── information_disclosure.md
    ├── insecure_deserialization.md
    ├── insecure_file_uploads.md
    ├── llm_prompt_injection.md
    ├── mass_assignment.md
    ├── nosql_injection.md
    ├── open_redirect.md
    ├── path_traversal_lfi_rfi.md
    ├── prototype_pollution.md
    ├── race_conditions.md
    ├── rce.md
    ├── sql_injection.md
    ├── ssrf.md
    ├── ssti.md
    ├── subdomain_takeover.md
    ├── xss.md
    └── xxe.md
```

---

## Usage

Just ask. The skill is written to trigger on natural phrasing — you don't need to type a command.

```
Scan this codebase for security vulnerabilities.
```

```
Audit my Django API — I'm most worried about the admin routes.
```

```
Is /src/api/upload.ts exploitable?
```

```
Review the auth before I ship this.
```

**Scoping it:** name a path, a service, or an area and the scan concentrates there. Name nothing and it defaults to the repository root and tells you so. Even when you point at one narrow endpoint, it still runs a light recon of the surrounding entry points — the injectable route is very often not the one you suspected.

**You get a checkpoint.** Before any specialists are spawned, the skill shows you its surface map (stack, entry points, platforms, unguarded areas). If it misread your app, redirect it there and save yourself a whole scan.

---

## What comes out

```
# Security scan — src/api

## Summary
- Stack & surface: FastAPI + Postgres, 14 routes, JWT auth, S3 uploads
- Findings: 1 Critical, 2 High, 3 Medium, 1 Low
- Classes covered: sql_injection, idor, authentication_jwt, insecure_file_uploads, ssrf
- Skipped (no foothold): ssti, xxe, prototype_pollution, ...

## Confirmed findings
### [CRITICAL] IDOR — src/api/invoices.py:88
- Flow: `invoice_id` from the path is passed straight to `.get()` with no owner check
- Evidence: <snippet>
- Fix: scope the query to `current_user.org_id`

## Suspected / needs verification
...

## Not assessed
...
```

Three things worth calling out about that shape:

- **Severity tracks real reachability.** An unauthenticated, attacker-reachable sink is Critical. A theoretical issue behind three guards is Low. Generic best-practice nags with no reachable sink don't get reported at all.
- **Confirmed and suspected are kept apart.** A finding stays in *Suspected* until the full path from attacker input to sink is traced. This is the whole point of the split: a Critical should mean Critical.
- **The blind spots are printed.** "Not assessed" tells you where the scan's edges are — which matters just as much as the findings.

---

## How the specialists are grouped

Recon selects the plausible classes; the skill clusters them into 3–6 themed sub-agents so related classes share context and can cross-reference each other. Fewer, fuller agents beat many thin ones.

| Cluster | Classes |
|---|---|
| **Injection** | SQLi, NoSQLi, SSTI, RCE, XXE, insecure deserialization, LLM prompt injection |
| **Access control** | IDOR, broken function-level authz, mass assignment, JWT/auth, business logic |
| **Web / client** | XSS, CSRF, open redirect, prototype pollution |
| **Server-side requests & files** | SSRF, path traversal / LFI / RFI, insecure file uploads |
| **Protocol & exposure** | Header injection, request smuggling, information disclosure, subdomain takeover, race conditions |

Any cluster with no selected classes is simply dropped. If only two classes survive recon, you get one agent — not five.

---

## Scope & limits

This is a **defensive, source-aware audit**. It reads code, traces data flows, and proposes fixes.

- It does **not** run exploits, fire payloads at live systems, or write weaponized proof-of-concepts.
- It is **static reasoning, not dynamic validation.** No browser, no proxy, no sandbox. That means it can surface issues a runtime tool would miss (business logic, authz gaps) and it can also produce suspected findings a runtime tool would have confirmed or killed. That's what the *Suspected* section is for — verify before you act.
- **Only scan code you own or have permission to test.**
- It is a force multiplier for review, not a substitute for one. Read the flow, not just the label.

---

## Acknowledgements

The `vulnerabilities/`, `frameworks/`, and `technologies/` reference content comes from **[Strix](https://github.com/usestrix/strix)** by [usestrix](https://github.com/usestrix) — an open-source AI penetration testing tool whose agents find, validate, and exploit vulnerabilities across the OWASP Top 10 and beyond. Their vulnerability write-ups are the substance behind every specialist in this skill; without that corpus, this repo would be an orchestrator with nothing to orchestrate.

**Huge thanks to the Strix team and its contributors.** Go star them: <https://github.com/usestrix/strix> ⭐

Strix is licensed under **Apache-2.0**. This repo redistributes derived reference material under those terms — the license and attribution notice are retained here, and if you fork or redistribute this skill, please keep them intact. If you want the real thing (dynamic exploitation, validated PoCs, CI integration), use Strix directly.

---

## Contributing

Adding a new vulnerability class is two steps:

1. Drop a deep-dive into `vulnerabilities/<class>.md`, matching the shape of the existing files.
2. Add a **signal → class** row to the recon table in `SKILL.md`, and slot the class into a cluster.

Same pattern for a new framework or platform — add the file, then reference it from the recon step so it can actually get loaded.
