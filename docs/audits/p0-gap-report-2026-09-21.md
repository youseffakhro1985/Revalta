# P0/P1 gap report — 2026-09-21

Verified baseline: `a98ffe2ac44537d35cc6ba7b4c21abec8bbb887e` (21 Sep 2026, `#937` on `main`). This product PR adds staff golden-path Preview E2E; statuses stay PARTIAL until that required job is green on the merged SHA.

This report is current-main evidence, not a historical audit copy. Unverified items are marked `BLOCKED / NOT VERIFIED`.

## SUPERSEDED START SHA

The SHA `92adc33…` below was true when this file was first written (`#933`). It is **not** current `main`. Current verified `main` at the start of golden-path E2E: `a98ffe2ac44537d35cc6ba7b4c21abec8bbb887e`. Production `/api/health` matched that SHA (`dpl_D2smveeUMAoj3AXwKpQanyacqMFR`), `schemaReady: true`, dataplane `e51d9599…`.

## VERIFIED START STATE

- GitHub `main`: `92adc33dfd224c698f8a31d0ce59a808faed355e`
- Open PRs: Dependabot HOLD `#261` Tailwind 4, `#260` Prisma 6, `#259` tailwind-merge, `#223` `@prisma/client`, `#194` react-dom. No product PRs.
- Open issues: none
- Revalta CI + CodeQL on `#933` push: success
- Required ruleset checks: `Lint, test, migrate and build`; `Analyze JavaScript and TypeScript`; `Auth, navigation, mobile and Command Center`
- Production `GET https://www.revalta.se/api/health`: HTTP 200, `release.commitSha` = current main, `deploymentId` = `dpl_AQC1LbGqFTepVvykqPEWVTTyqJkH`, `environment` = `production`, `database` = `ok`, `modernStorageOnly` = `true`
- Production GitHub Environment `DATABASE_URL` identity matches reviewed Production attestation `e51d9599fa4b3c03898d33a44d3fb5973987e8fd3569896aa3c005fc5673ba2a`
- Live Preview health identity matches reviewed Preview attestation `6237f01010de725a8e35dcdb90b4f1b933bb009aa2d822155d6efe18f61ede3f` and is distinct from Production
- Prisma migrations in repo: 52
- Inställningar design from `#933` is current and must not be redesigned in this pass

## PR #938 Browser E2E vs Vercel (verified 2026-09-22T16:33Z)

Head commit `c9dc7b576343085b849b6c05716bdcad90a38b46`. Base `main` still `a98ffe2ac44537d35cc6ba7b4c21abec8bbb887e` (not moved; no rebase). Production `/api/health` still matches that SHA (`dpl_D2smveeUMAoj3AXwKpQanyacqMFR`, dataplane `e51d9599…`). Re-verified 2026-09-22T16:33Z: Vercel status still `Deployment rate limited — retry in 24 hours.` (`updated_at` still `2026-09-21T19:51:47Z`). GitHub Deployments for `c9dc7b5` still `[]`. Expected Hobby recovery ~22 Sep ~19:48 UTC. Local unpushed HEAD continues Tenant B proofs (public ticket portal-scope next).

| Check | Result | Cause |
| --- | --- | --- |
| Lint, test, migrate and build | success | Revalta CI on `c9dc7b5` |
| Analyze JavaScript and TypeScript / CodeQL | success | same SHA |
| Vercel | failure | GitHub status `Deployment rate limited — retry in 24 hours.` `upgradeToPro=build-rate-limit`, updated `2026-09-21T19:51:47Z`. GitHub Deployments for `c9dc7b5` = `[]`. Last published Preview is older SHA `a3e9137` (`dpl_2dLSWKbG15wr2QbJwvzFYLKmVBhW`). |
| Auth, navigation, mobile and Command Center | failure | Job `35647471658` never started Playwright. Step **Resolve exact-SHA Preview** looped 24×10s against `deployments?sha=c9dc7b5…` then exited `BLOCKED: exact-SHA Vercel Preview was not published before timeout` (`HEAD_SHA: c9dc7b5…`, `MANUAL_PREVIEW_URL` empty). |

This required Browser E2E failure on **PR-head `c9dc7b5` is infrastructural**, not a test/code defect in that commit. Do not change working product code to hide Hobby quota. Do not dummy-commit. Do not `--admin`. Do not re-run the E2E job without an exact-SHA Preview. Do not use `a3e9137` Preview as a surrogate for `c9dc7b5`.

Older SHA `a3e9137` **did** publish Preview and Playwright **did** run: login/dashboard/nav/properties-api passed, then `BLOCKED / NOT VERIFIED: Ticket did not resolve to a work order` (run `35646803772`). That product miss is addressed in local unpushed commits on this branch (golden-path diagnostics + schema-503 fail-closed). Those commits must wait for Hobby quota (~22 Sep ~19:48 UTC from last Preview at `2026-09-21T19:48:23Z`) before **one** legitimate push.

Exact Preview SHA for current PR-head: `BLOCKED / PREVIEW NOT VERIFIED`. `mergeStateStatus: BLOCKED`. Required checks are not green; merge is forbidden.

## P0

| Item | Evidence | Status |
| --- | --- | --- |
| Production SHA vs GitHub main | Public health `commitSha` equals `92adc33…` | Verified at report time |
| Public health schema/dataplane | Public payload lacked `schemaReady` and Production `dataPlane` | Fixed in this change; Production evidence after merge |
| Preview vs Production dataplane share | Distinct attested identities observed on live Preview and Production GitHub DB target | Verified isolated |
| Preview schema vs current main | GitHub Environment `Preview` has 0 secrets; migrate status cannot be read from Actions | `BLOCKED / NOT VERIFIED` until Preview `DATABASE_URL`/`DIRECT_URL` are added from Vercel Preview (never Production) |
| Production schema vs 52 migrations | Database Status 2026-09-14 15:32 showed pending `20260914150000_work_order_vendor_contract`; Database Release 15:33 succeeded. Fresh Database Status not re-run on `92adc33` | `BLOCKED / NOT VERIFIED` pending owner-dispatched Database Status on current SHA |
| Neon PITR/plan/protected branch | No Neon dashboard access in this session | `BLOCKED / NOT VERIFIED` / `OWNER DECISION REQUIRED` |
| Restore drill | Not executed; destructive Production tests forbidden | Policy added; drill remains owner-run |
| CodeQL required | Ruleset already requires job name `Analyze JavaScript and TypeScript` | Verified |
| Emergency bypass | Ruleset bypass actor is repository owner, mode `always` | Policy documented; GitHub account settings not changed from code |
| Public portal tenant | UUID slug and first-company/property discovery could select a non-portal tenant | Fail-closed in this change; commercial correctness of `REVALTA_PORTAL_COMPANY_ID` is `OWNER DECISION REQUIRED` |
| Vercel Hobby Preview quota | `#938` head `c9dc7b5` has 0 GitHub Deployments; Vercel status `build-rate-limit` since `2026-09-21T19:51:47Z`. Browser E2E failed before Playwright. Last Preview `a3e9137` is not PR-head. | `BLOCKED / PREVIEW NOT VERIFIED` until Hobby quota recovers (~22 Sep ~19:48 UTC). No `--admin`. No dummy commit. |
| GitHub Actions YAML | OAuth token lacks `workflow` scope so Uptime/Monitor/Preview migrate files could not be pushed | `OWNER DECISION REQUIRED` — apply `docs/OWNER_WORKFLOW_UPDATES.md` |

## P1

Tenant negative matrix, golden-path E2E, Stripe/email/SMS/Blob verification, cron smoke against Production, query performance, hotspot refactors, a11y/mobile polish: not claimed READY. Remaining after this branch's unit proofs: live booking concurrency Preview, technician-role Preview fixture, quote PDF/output if a dedicated export is added. Staff/resident booking overlap 409s and public-ticket portal-token Tenant B 404s landed locally. Exact-SHA Preview E2E on `#938` remains the P0 gate.

## P2

Landing-page commercial claims, legal identity, DPA, repo visibility: `OWNER DECISION REQUIRED`. Do not invent company data.

## Historical documents that are not current-main truth

- `docs/FEATURE_READINESS.md` previously cited `b7b08793` (31 Aug 2026). Module statuses remain conservative PARTIAL/BETA/BLOCKED.
- `docs/REV-RELEASE-TRUTH-001.md` cites baseline `af995a8…` and is a bounded Preview-gate record, not current Production evidence.
- Instruction claim of 0 open PRs was false at this SHA; Dependabot HOLDs are open and must not be merged.
