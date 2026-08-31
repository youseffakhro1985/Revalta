# Revalta AI Collaboration Ledger

GitHub `main` is always the only technical source of truth. No agent may write into an active area owned by another agent without explicit handoff.

## Current coordination reset — 2026-08-31

This section supersedes older snapshot/next-task statements in historical PRs, branches and conversations.

- Verified baseline `main`: `9217470c171e0dd905cac7f83aa6530b2ca53865`
- Baseline commit: `Ronder: premium rond- och checklistsystem`
- Repository visibility: **PUBLIC** — visibility/license intent is an explicit Product Owner/IP decision, not an agent cleanup action.
- Production URL: `https://www.revalta.se`
- Production health monitor: green on the baseline main workflow, but the pre-fix monitor does **not** prove that production `release.commitSha` equals current GitHub main.
- Production database migration state: **UNVERIFIED**. The later migration `20260822010000_inspection_checklist_templates` must be checked with authorized production `prisma migrate status` before any schema release claim.
- Vercel connected team: `team_4GYkeSBTtXApHmGlIycnqnci`
- Vercel team plan: **Hobby**
- Vercel project list through the connector: empty
- Vercel project env/runtime/log/domain/deployment state: **BLOCKED_CONNECTOR — DO NOT INFER**
- Program state: **P0 stabilization freeze** — do not add new major feature breadth until the P0 release/security blockers are resolved.

The machine-readable current program is `docs/AI_TASKS.yml`. The evidence-backed module baseline is `docs/FEATURE_READINESS.md`. Execution order and invariants are in `docs/TECHNICAL_STABILIZATION.md`.

## Current P0 work ownership

| Task | Owner | Branch / PR | Status | Scope |
|---|---|---|---|---|
| `REV-COORD-005` | ChatGPT | `agent/rev-coord-005-stabilization-baseline` | IN_REVIEW | Coordination reset/docs only |
| `REV-DB-001` | Release Engineer | none | BLOCKED_VERIFICATION | Production migration status + backup/restore evidence |
| `REV-STAB-001` | ChatGPT | PR #331 | IN_REVIEW | Application build may never migrate production DB |
| `REV-STAB-002` | ChatGPT | PR #332 | IN_REVIEW | Exact production SHA vs current main |
| `REV-STAB-003` | ChatGPT | PR #333 | IN_REVIEW | Safe billing plan allowlist from fresh main |
| `REV-VERCEL-002` | Release Engineer | none | BLOCKED_CONNECTOR_AND_PLAN | Project access + commercial hosting readiness |
| `REV-IP-001` | Product Owner | none | BLOCKED_OWNER_DECISION | Public/open-source vs proprietary/private decision |

No other agent should edit the owned files of PRs #331-#333 or `REV-COORD-005` until handoff or merge/closure.

## Stale PR quarantine

The following open historical PRs are **not** current-main merge candidates merely because they exist or once had green CI:

- #314 — still-relevant billing validation idea; fresh replacement is #333. Close #314 only after #333 is verified.
- #313 — email-verification atomicity; security-relevant, but re-check current auth implementation before reimplementation.
- #307-#312 — Stripe/cron observability work; reconcile after P0 from fresh main.
- #270 — old integrated auth candidate; later clean auth fixes were merged. Compare before closing.
- #254 — demo flow; stale baseline and blocked by Vercel/env verification.
- #239 — document pagination; concept remains valuable, branch is stale.
- #218 — frozen historical stack; never merge directly.

Old `agent/*`, `cursor/*`, `claude/*`, ChatGPT and local branches remain quarantine unless compared against fresh current main and explicitly handed off.

## Highest-priority invariants

### Tenant isolation

`Company` is the primary B2B tenant. A user from one company must never be able to read, write, link, search, export or delete another company's data.

Use the existing tenant/auth helpers and scoped write patterns. A route that manually builds tenant-sensitive Prisma predicates needs explicit review.

### Auth

Keep the existing JWT/session policy and verification/reset model unless a separate architecture decision explicitly changes it. Do not replace auth as collateral cleanup.

### Database release

Production migrations are applied **only** by the protected manual `Database Release` GitHub Actions workflow after:

1. exact current-main SHA verification,
2. production migration status verification,
3. backup/restore-point evidence,
4. typed release confirmation.

Never:

- `prisma db push` against production,
- laptop `prisma migrate deploy` against production,
- Vercel/application-build migration.

### Canonical dashboard routes

Real dashboard implementation lives under:

`src/app/(dashboard)/dashboard/**`

`src/app/dashboard/**` is compatibility redirects only. Do not create a parallel dashboard tree or redesign route topology as incidental work.

### Design

Preserve Revalta's existing Swedish/Scandinavian premium Antigravity system: petroleum, sand, ink, warm neutral canvas, restrained shadows, clear typography and high information quality. UI work is polish/consistency, not a redesign.

### Mocks

Money/integration side effects fail closed in production. Never use a mock override to bypass production billing/invoicing truth.

### Logging

Use structured observability helpers. Never log passwords, tokens, sessions, cookies, DB URLs, Stripe signatures/raw webhook bodies, raw email/name or free-text case content.

## Current delivery order

1. coordination reset,
2. production DB migration reconciliation,
3. build/database separation,
4. production release identity,
5. billing plan validation,
6. Vercel project/commercial readiness,
7. stale open-PR reconciliation,
8. full tenant security/data-model matrix,
9. canonical billing/Stripe contract,
10. feature readiness audit,
11. golden-path hardening,
12. UX/mobile consistency,
13. performance/query audit,
14. observability phase 2,
15. legal/commercial readiness,
16. marketing truth/pricing/trust work,
17. only then new major product modules.

## Definition of Done

A task is not DONE because code exists.

Record:

- baseline SHA,
- branch,
- changed files,
- migrations yes/no,
- implementation,
- security impact,
- tenant impact,
- relevant tests,
- lint/typecheck/full quality gate,
- CI,
- CodeQL,
- exact-SHA Preview/browser evidence where applicable,
- current-main compare before merge,
- merge with expected head SHA,
- exact production release identity after merge,
- safe production smoke,
- runtime/log verification only where access actually exists,
- rollback notes,
- remaining blockers,
- updated `docs/AI_TASKS.yml` / readiness status.

If a control cannot be performed, its status is `BLOCKED`, `UNVERIFIED` or `NOT RUN`. Never report green from inference.

## Historical completed foundations retained

The following foundations remain part of current main and should not be rebuilt from scratch:

- tenant-aware auth/session architecture,
- password-reset and registration latency fixes,
- canonical dashboard route policy,
- role-aware dashboard/navigation,
- Command Center/search foundation,
- digital property workspace,
- onboarding,
- exact-SHA browser-E2E foundation,
- structured logger / route observability foundation,
- protected Database Release workflow,
- CI/CodeQL/release-config checks,
- existing Antigravity design system.

Historical details and prior task/PR identifiers remain available in Git history. Do not use old historical status as current verification evidence.
