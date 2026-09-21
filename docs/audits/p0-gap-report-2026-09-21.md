# P0/P1 gap report — 2026-09-21

Verified start SHA: `92adc33dfd224c698f8a31d0ce59a808faed355e` (`style(settings): premium polish for Inställningar (#933)`).

This report is current-main evidence, not a historical audit copy. Unverified items are marked `BLOCKED / NOT VERIFIED`.

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
| Vercel Hobby Preview quota | Preview still unpublished for many PR checks historically | `BLOCKED / PREVIEW NOT VERIFIED` remains a merge blocker; no `--admin` |

## P1

Tenant negative matrix, golden-path E2E, Stripe/email/SMS/Blob verification, cron smoke against Production, query performance, hotspot refactors, a11y/mobile polish: not claimed READY. Existing unit/isolation tests are not a substitute for the two-tenant matrix or exact-SHA Preview E2E.

## P2

Landing-page commercial claims, legal identity, DPA, repo visibility: `OWNER DECISION REQUIRED`. Do not invent company data.

## Historical documents that are not current-main truth

- `docs/FEATURE_READINESS.md` previously cited `b7b08793` (31 Aug 2026). Module statuses remain conservative PARTIAL/BETA/BLOCKED.
- `docs/REV-RELEASE-TRUTH-001.md` cites baseline `af995a8…` and is a bounded Preview-gate record, not current Production evidence.
- Instruction claim of 0 open PRs was false at this SHA; Dependabot HOLDs are open and must not be merged.
