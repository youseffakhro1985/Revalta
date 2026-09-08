# PR #426 — Preview release evidence

Status: **BLOCKED / fail-closed**

This document records observed release evidence for PR #426. It must not be used to waive a gate. A module, deployment, or release is READY only when the corresponding live evidence is green on the exact current head SHA.

## Exact-head evidence policy

The current PR head SHA is intentionally **not** hardcoded as “current” in this file, because editing this file itself changes the PR head. The authoritative current head is always PR #426 metadata, and every required workflow must report that exact SHA.

Latest fully observed candidate before this documentation-only update:

- candidate: `e8a60bf631a8e73499512beb3a8d873a34c7a0df`
- Revalta CI run `34250744271`: **success**
- CodeQL run `34250744170`: **success**
- Preview Health Attestation run `34250744190`: **failure**, because the exact-SHA Vercel Preview deployment itself reported failure before health attestation could run
- Preview Browser E2E run `34250744163`: **failure** at exact-SHA Preview resolution; browser, login and fixture steps were deliberately skipped
- Vercel status for that candidate: **failure**

These observed red Preview checks were not application-code or migration-test failures. The release remains correctly blocked until Vercel publishes the then-current exact candidate with the isolated Preview PostgreSQL data plane. After any new commit, all required checks must be evaluated again on the new head; the runs above become historical evidence only.

## Production baseline

- `main`: `807457b5619ccf66b7ff2b48834245dd4fc8cc60`
- Production routing/recovery remains unchanged by the work described here.
- Production data must never be used as an E2E fixture.

## Isolated Preview datastore

A dedicated non-default, non-primary Neon branch exists for Preview/E2E:

- Neon project: `withered-cell-46849200`
- branch: `br-restless-salad-ambw5ig8`
- database: `neondb`
- reviewed Preview data-plane identity: `2eb0d0064180411ff1a387ae263f65bffb286f72a903c79cc7eb23a729a8abdd`
- reviewed Production data-plane identity: `e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a`

The two identities are intentionally different.

Neon reports `init_source=parent-data` for this Preview branch because it was created from the project parent. It therefore must not be described as if data was never historically copied. Before the branch was accepted for E2E use, business data was sanitized and a read-only verification showed zero rows in the central business tables. Only after that verification was the synthetic fixture seeded.

Current read-only verification of the central fixture surface shows only one synthetic Company, one synthetic owner User and one synthetic Property, with zero Tickets, WorkOrders, Leases, Bookings, RentNotices, IMD readings and AuditLogs.

## Migration evidence

The isolated Preview database was brought through all 49 pre-existing repository migrations with real `_prisma_migrations` history.

Observed result before the regression fix:

- successful migrations: `49`
- incomplete or rolled back: `0`

During the migration audit, historical `OperationalDocument` constraints were found to be contradictory after `property_id` and `technical_asset_id` were introduced. This could block valid property-only or technical-asset-only operational documents.

A new additive migration was created:

`20260908165000_fix_operational_document_parent_constraint`

It removes the obsolete parent checks and leaves exactly one canonical check requiring exactly one of:

- `work_order_id`
- `project_id`
- `property_id`
- `technical_asset_id`

The isolated Preview database now contains 50 successful migrations including this fix and zero incomplete/rolled-back migration records. Clean Postgres CI applies the migration chain from zero and contains an explicit regression assertion for the final parent constraint.

Production is intentionally not migrated by this release branch. Read-only Production evidence shows that `20260822010000_inspection_checklist_templates` and `20260908165000_fix_operational_document_parent_constraint` remain unapplied there until the release gate is green.

## Synthetic fixture

The current isolated Preview fixture contains:

- Company ID: `e2e-company-3a5fbd8533884f07c266ad39`
- Company name: `Revalta Preview E2E`
- Company status: active
- User role: owner
- User status: active
- email verification: confirmed
- synthetic property name: `E2E Fastigheten`

The password follows Revalta's real bcrypt cost-12 authentication contract. Credentials are not stored in repository source, PR text, logs or this document.

`E2E_VERIFIED_COMPANY_ID` may use the Company ID above only after runtime isolation has independently passed. `E2E_PREVIEW_DATA_ISOLATED=1` must never be treated as proof by itself.

## Exact-SHA runtime attestation — critical blocker

A credential-free GitHub Actions health attestation resolves only the successful Vercel Preview deployment associated with the exact PR head SHA, calls `/api/health`, and compares the runtime identity with the reviewed repository attestation.

Observed on an earlier exact-SHA Vercel Preview on 2026-09-08:

- HTTP: `200`
- `health.status`: `ok`
- `health.database`: `ok`
- release SHA: exact candidate SHA
- release environment: `preview`
- deployment ID: present
- `dataPlane.directMatches`: `true`
- **observed data-plane identity: `e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a`**
- expected Preview identity: `2eb0d0064180411ff1a387ae263f65bffb286f72a903c79cc7eb23a729a8abdd`

The observed identity was the reviewed **Production** identity.

Therefore the build guard now blocks Preview deployments that are wired to Production before runtime. This is an explicit release blocker. Browser E2E must remain red and no Preview mutation/login fixture test may run against such a runtime.

## Required Vercel correction

Use branch-specific Vercel Preview environment variables for Git branch:

`fix/revalta-preview-gate-2026-09-07`

At minimum, both of these must point to the isolated Neon Preview branch/database, never Production:

- `DATABASE_URL`
- `DIRECT_URL`

Do not place either connection string in GitHub source, PR comments, logs or documentation.

After the branch-specific variables are saved, redeploy the exact then-current candidate and require `/api/health` to prove all of the following before enabling browser login:

1. HTTP 200
2. `status=ok`
3. `database=ok`
4. exact current commit SHA
5. `release.environment=preview`
6. deployment ID present
7. `dataPlane.identity=2eb0d0064180411ff1a387ae263f65bffb286f72a903c79cc7eb23a729a8abdd`
8. `dataPlane.directMatches=true`

Only after these eight checks pass may the E2E fixture variables/credentials be supplied and browser navigation proceed.

## Connected Vercel access limitation

The ChatGPT Vercel plugin has been explicitly set to full access. The connected Vercel session can see team `team_4GYkeSBTtXApHmGlIycnqnci` (`youseffakhro1985s-projects`) but still returns an empty project list and cannot independently read the Revalta project/deployment through its OAuth scope, even though GitHub's Vercel integration publishes Revalta Preview deployment statuses.

The available Vercel tool surface exposes no Environment Variables write action and no generic authenticated Vercel API request action. Treat this as an OAuth/tool-scope limitation of the connected administration session, not evidence that the Vercel project does not exist. No repository-side Vercel API token is referenced that could safely be reused to mutate project environment variables.

## GitHub release gates

PR #426 remains draft and must not merge until exact-head evidence is green.

Required sequence after #426:

`#425 → #429 → #428 → #427`

After every merge, the next PR must be reapplied/rebased on the then-current `main` and must receive fresh exact-SHA quality and Preview evidence.

Live branch metadata currently reports `main` as unprotected. Branch protection is a separate required owner/admin gate and must not be marked complete until live protection/ruleset evidence exists. The connected GitHub app exposes no branch-protection/ruleset write action.

## Non-negotiable safety rules

- Never point Preview at Production data.
- Never use customer rows as Preview fixtures.
- Never use restore/quarantine/hold branches as fixtures.
- Never set or trust `E2E_PREVIEW_DATA_ISOLATED=1` as a substitute for runtime identity evidence.
- Never weaken `/api/health` identity checks to make CI green.
- Never log database URLs, passwords, Vercel bypass secrets, cookies or browser credentials.
- Never run historical financial backfills without authoritative relationships and a separate explicit release decision.
- Never mass-merge the release PR chain.
