# Revalta Technical Stabilization Program

Baseline main: `9217470c171e0dd905cac7f83aa6530b2ca53865`  
Coordination reset: 2026-08-31

## Goal

Make Revalta coherent, secure, verifiable and commercially operable before adding more major product breadth.

This is not a redesign and not a big-bang cleanup.

## Locked invariants

1. GitHub `main` is the only technical source of truth.
2. `Company` is the primary B2B tenant; cross-company access is the highest-priority security failure.
3. Production migrations run only through the protected manual `Database Release` workflow.
4. `src/app/(dashboard)/dashboard/**` is the canonical dashboard implementation tree.
5. `src/app/dashboard/**` remains redirect-only compatibility surface.
6. Revalta's existing petroleum/sand/ink Antigravity design system is preserved.
7. Existing auth/session architecture is not replaced as collateral work.
8. No secret/env value is copied into docs, PRs, logs or screenshots.

## Current truth

### GitHub

- Current main: `9217470c171e0dd905cac7f83aa6530b2ca53865`.
- Repository visibility: public.
- Repository visibility is an owner/business/IP decision; do not change it automatically.

### Production

- Scheduled production health/release monitor on current main is green as of the coordination reset.
- The pre-fix monitor proves healthy production/database shape but does not prove exact equality between production `release.commitSha` and current GitHub main.
- PR #332 is the current-main fix for exact release identity.

### Database

- Last known successful protected Database Release before this reset: 2026-08-13.
- A later migration exists: `20260822010000_inspection_checklist_templates`.
- Production migration status is **UNVERIFIED** until `prisma migrate status` is executed through authorized production access.
- Do not infer PENDING solely from workflow history.
- Do not apply any production migration until a backup/restore point is verified.

### Vercel

- Connected team: `team_4GYkeSBTtXApHmGlIycnqnci`.
- Connected team plan: Hobby.
- Connector project list: empty.
- Therefore project env, domains, deployment settings, runtime and logs are not directly verified.
- Revalta is commercial SaaS; commercial hosting plan readiness is a blocker before normal paid-customer production.

## P0 candidates created from fresh main

### PR #331 — build/database separation

Purpose: application builds can never apply `prisma migrate deploy`.

Expected invariant:

- `RUN_DB_MIGRATIONS=true` fails the build,
- Vercel/application build contains no executable migration path,
- release validator prevents regression,
- Database Release remains the only production schema path.

### PR #332 — production release identity

Purpose: distinguish uptime from exact release identity.

Expected invariant:

- health checks remain,
- current `main` is fetched read-only,
- production `release.commitSha` must equal current main after a bounded propagation grace,
- stale healthy production emits `PRODUCTION_RELEASE_STALE`.

### PR #333 — billing plan validation

Purpose: replace prototype-sensitive `plan in plans` validation from a stale branch with a fresh-main implementation.

Expected invariant:

- prototype keys rejected,
- malformed plan payloads rejected,
- valid plan IDs unchanged,
- production Stripe-only gate unchanged.

## P0 blockers that cannot be safely auto-resolved without verified external state

### Database state

Need:

1. production `prisma migrate status`,
2. backup/restore-point evidence,
3. if pending, protected Database Release for exact verified main SHA,
4. post-release migration status,
5. round/checklist smoke,
6. checklist-template tenant negative test.

### Vercel project access

Need project visibility before any claim about:

- project ID,
- production/preview env presence,
- domains,
- production branch,
- runtime,
- logs,
- cron execution,
- deployment protection,
- usage.

Never work around missing project access by copying secret values into GitHub.

### Commercial hosting plan

Hobby is not accepted as Revalta's target commercial production posture. Move to an appropriate commercial Vercel plan only after confirming the correct Revalta project/team and preserving domains/env/deploy integration.

### Repository visibility

The repository is public. Owner must decide whether that is intentional. Do not change visibility in the stabilization PRs.

## Stale PR policy

Current historical PR heads are evidence sources, not merge candidates.

- #314: relevant billing allowlist idea; fresh replacement #333.
- #313: security-relevant auth atomicity; compare current auth before reimplementation.
- #307-#312: observability/cron/Stripe work; reconcile after P0.
- #270: likely superseded auth integration candidate; compare before closure.
- #254: demo flow blocked by Vercel/env verification and stale baseline.
- #239: pagination concept remains relevant but must be reimplemented/reconciled against current document code.
- #218: frozen historical stack; never merge directly.

## P1 execution order

### 1. Tenant security matrix

For every API/server action:

- authentication,
- role,
- company scope,
- object ownership,
- nested relation ownership,
- list/search/export scoping,
- update/delete scoping,
- blob/document access,
- relation connect/disconnect,
- IDOR tests,
- cross-tenant negative tests.

Create a separate data-model matrix before changing nullable `company_id` fields.

### 2. Canonical billing/Stripe contract

Create one canonical definition for:

- stable internal plan IDs,
- display names,
- prices,
- limits,
- feature entitlements,
- Stripe price env-key mapping,
- billing interval,
- public availability.

Do not bundle plan-ID data migration unless separately reviewed.

### 3. Feature readiness

Use `docs/FEATURE_READINESS.md`.

No module becomes `READY` without evidence.

### 4. Golden path

Prioritize:

`Felanmälan → AI/klassificering → prioritet/SLA → ansvarig → arbetsorder → planering → checklista → tid/material → dokumentation → rapport/signering → fakturaunderlag → avslut → återkoppling`.

Then connect:

- rondavvikelse → arbetsorder,
- besiktningsanmärkning → arbetsorder,
- underhåll → arbetsorder,
- skadeärende → arbetsorder/projekt,
- kalender → related operational event,
- leverantör → assignment,
- arbetsorder → cost/budget/invoice basis.

### 5. UX/mobile consistency

All major modules must have consistent:

- loading,
- empty,
- error/retry,
- permission denied,
- not found,
- validation,
- success feedback,
- destructive confirmation,
- keyboard/focus semantics,
- responsive list/table behavior,
- search/filter/pagination where required.

Operations flows must be tested at 360, 390, 768, 1024 and 1440 px.

### 6. Performance/query audit

Prioritize:

- tickets,
- work orders,
- properties,
- documents,
- audit,
- notifications,
- projects,
- vendors,
- budget,
- energy,
- IMD.

Check:

- unbounded lists,
- stable pagination,
- DB-side filtering/search,
- N+1,
- oversized includes/payloads,
- repeated counts,
- missing query-supported indexes,
- expensive aggregates.

### 7. Observability phase 2

Continue issue #217 only after stale PR reconciliation from fresh current main.

Never log:

- passwords,
- JWT/session/cookies,
- reset/verification tokens,
- `CRON_SECRET`,
- Stripe signatures/raw webhook body,
- DB URLs,
- raw email/name,
- ticket/free-text content.

## P2 commercial readiness

Only after P0/P1:

- verified legal identity/config,
- non-draft privacy/terms/DPA basis,
- support/contact process,
- data export/delete process,
- incident process,
- marketing truth audit,
- pricing/product/trust pages based on actual readiness.

## PR gate

Every PR records:

- baseline SHA,
- scope,
- risk,
- changed files,
- migrations yes/no,
- security impact,
- tenant impact,
- test evidence,
- preview evidence,
- rollback notes.

Minimum code gate is `npm run quality` plus relevant targeted tests, CI/CodeQL and exact-SHA browser/preview evidence where applicable.

If a verification cannot be performed, label it `BLOCKED` or `NOT RUN`. Never convert absence of evidence into green status.
