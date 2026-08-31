# Revalta Technical Stabilization

Baseline: `b7b08793ccde1baef7a1c210ad9238ad72332df5` — 31 Aug 2026

This is the operational stabilization record for Revalta. It complements `docs/AI_TASKS.yml`; GitHub `main` remains the only code truth.

## Current truth classification

### VERIFIED

- Repository: `youseffakhro1985/Revalta`.
- Repository visibility is public.
- `main` branch protection is disabled and repository rulesets are empty.
- Application/Vercel build is prevented from executing `prisma migrate deploy` by the build contract and release validator.
- Production Release Monitor compares the health release SHA with expected GitHub main and can emit `PRODUCTION_RELEASE_STALE` after a controlled propagation grace.
- Billing plan input uses explicit safe validation rather than prototype-chain membership.
- Email verification token consumption, user verification and required audit persistence are atomic in one Prisma transaction.
- Stripe checkout/customer portal use canonical public origin and fail closed in Production when required Stripe configuration is unavailable.
- A manual read-only `Database Status` workflow exists on current main; it shares the Production database-release concurrency lock and contains no `prisma migrate deploy` or `prisma db push`.
- The current quality gate includes release-config validation, clean-database migrations, Prisma schema validation, lint, UI-interaction audit, canonical dashboard-integrity audit, unit tests, typecheck, production dependency audit and production build.

### UNVERIFIED

- Production Prisma migration state for `20260822010000_inspection_checklist_templates`.
- Whether the observed Neon project is definitely the same database selected by Revalta's Production Vercel environment, because Vercel env/project access is connector-blocked.
- Current Production environment-variable presence/value correctness beyond what existing deployments/workflows indirectly prove.
- Full runtime/log/cron execution state in Vercel.
- Full tenant isolation across all endpoints and related-object relations.
- End-to-end readiness of all navigation-exposed modules.

### BLOCKED

- Direct Vercel project/env/runtime/log verification: connected scope exposes the team but not the Revalta project.
- Direct Production migration read through the Neon connector: connector runtime argument schema for read-only SQL/schema calls is inconsistent with its exposed contract.
- Programmatic GitHub Actions `workflow_dispatch` from the connected GitHub capability: no dispatch write action is available.
- Programmatic branch-protection/ruleset creation from the connected GitHub capability: read-only evidence is available, write action is not.

## P0 merged stabilization changes

| PR | Merge SHA | Result |
| --- | --- | --- |
| #333 | `18f546fa7758efed5be1e208a61523b9e792f400` | Safe billing-plan allowlist and regression tests. |
| #335 | `cd6f67ce5ac5127d15c143431f80abbfeddb3e8e` | Application build cannot apply Production migrations. |
| #336 | `df0cbfca24e2d4ff760397d198d0ea162bef3410` | Exact Production release identity monitoring. |
| #339 | `6a5e9df0b057405bfdf27c114ebdc03928db6768` | Atomic email-verification/audit transaction. |
| #340 | `8a6424b9cca7c8ba3b9f401e9c335526d0484bcc` | Stripe checkout/customer-portal boundary hardening. |
| #341 | `b7b08793ccde1baef7a1c210ad9238ad72332df5` | Read-only Production migration-status path. |

Historical candidates were not blindly merged. Still-relevant fixes were reimplemented from fresh main and old PRs were closed as superseded where appropriate.

## P0 blockers that remain

### 1. Production migration state

The repository contains migration `20260822010000_inspection_checklist_templates`. Its actual Production state must be determined without mutation.

Safe sequence:

1. Verify current `main` SHA.
2. In GitHub Actions, manually run **Database Status** with exactly that SHA.
3. Capture `prisma migrate status` output.
4. Do not run **Database Release** merely to inspect state.
5. Establish a verifiable backup/restore point before any mutation.
6. If migration is pending, run protected **Database Release** with the same approved main SHA and exact confirmation contract.
7. Re-run migration status.
8. Smoke-test ronder/checklistor and cross-company checklist-template access.

Never use `prisma db push` or an application/Vercel build to mutate Production schema.

### 2. Restore capability

The accessible Neon metadata showed history retention of `21600` seconds (6 hours). Treat this as insufficient evidence of a release-grade backup on its own. Before Production migration, record a recoverable restore point/snapshot/branch strategy and test the operational restore procedure where practical.

### 3. Main is not technically protected

The policy says no direct pushes to main, but GitHub currently reports `protected=false` and no repository rulesets.

Repository owner/admin should create a protected-main contract appropriate to the account/repository capabilities, targeting at minimum:

- pull request required for main
- required current status checks: Revalta CI, CodeQL, Preview Browser E2E where GitHub plan/repository rules support them
- no force push
- no branch deletion
- controlled administrative bypass only
- conversation/review requirements only if they fit the operating model; do not create artificial approval deadlocks for a single-maintainer repository

After changing settings, re-read branch/ruleset state and record evidence in `docs/AI_TASKS.yml`.

### 4. Repository visibility/IP

The repository is public. Do not change visibility automatically. Owner must explicitly decide whether Revalta is intentionally public/open source or proprietary/private, and whether a license is intended.

If private is chosen, first prepare a separate checklist for Vercel Git integration, Actions, CodeQL, environments, collaborators, deployment access and links. Visibility change is not a cleanup side effect.

### 5. Vercel commercial/operational access

The connected Vercel scope does not expose the Revalta project, although GitHub commit statuses prove that Vercel deployments are occurring. Do not infer env/runtime/log values.

Restore connector/project access and verify:

- actual project ID/team
- production domain and branch
- build/install/framework settings
- env variable presence without exposing values
- runtime/log access
- cron/deployment protection
- usage/limits
- commercially appropriate plan

## P1 order after P0 runtime reconciliation

1. **Tenant security audit** — endpoint/action/model matrix, cross-company negative tests and related-object ownership.
2. **Tenant data-model matrix** — understand nullable `company_id` and legacy resident `Tenant` semantics before schema hardening.
3. **Canonical billing/plan registry** — stable internal plan IDs, customer names, entitlements, limits and Stripe mapping in one contract.
4. **Stripe lifecycle audit** — webhook signature/idempotency/replay/duplicates/payment state/subscription transitions/unknown price/portal.
5. **Feature readiness** — complete evidence matrix in `docs/FEATURE_READINESS.md`.
6. **Golden path** — ticket → work order → scheduling → execution → cost → closure/resident feedback with cross-module links.
7. **UX/mobile/a11y consistency** — preserve existing Scandinavian premium design and canonical dashboard architecture.
8. **Performance/query audit** — pagination, stable sorting, database search/filtering, N+1, overfetch and evidence-based indexes.
9. **Observability phase 2** — fresh current-main implementation; no business-logic changes.
10. **Cron reliability** — authentication, idempotency, locks, retries, partial failure, batching, tenant isolation and UTC/CET/CEST semantics.
11. **Legal/commercial/marketing truth** — only verified legal identity and product claims.

## Security invariant

`Company` is the primary B2B tenant. No organization may read, modify, link, search, export or delete another organization's data.

For each tenant-relevant endpoint/action, verify:

- authentication
- role/permission
- canonical company from trusted session/server context
- list/lookup/update/delete company scope
- related-object company ownership before connect/link
- nested relation isolation
- search/export isolation
- document/blob authorization
- cross-company ID negative tests

Do not trust a client-provided `company_id` as authorization authority. Reuse the existing Revalta security helpers rather than creating a parallel auth model.

## Dashboard/design invariant

Do not redesign Revalta from zero.

- `src/app/(dashboard)/dashboard/**` remains canonical implementation.
- `src/app/dashboard/**` remains legacy redirect compatibility only under the existing contract.
- Preserve petroleum/sand/warm-neutral visual system, current typography/tokens, Lucide and established premium primitives.
- Do not introduce a parallel dashboard tree or a new UI kit for variation.

## Pull-request contract

Each implementation PR should record:

- baseline SHA
- scope/risk
- changed files
- migration yes/no
- security impact
- tenant impact
- exact tests/gates
- exact-SHA preview evidence
- rollback notes

A historical green run is never sufficient for a branch that is behind current main. Reimplement or rebase safely, rerun current gates, and compare immediately before merge.
