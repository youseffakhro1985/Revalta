# P0/P1 gap report — 2026-09-21

Verified baseline: `ef0a125e7859377286d69ec099f7083397cea971` (22 Sep 2026, `#943` on `main`). Staff golden-path, booking-overlap, technician-role, resident-portal, technician-calendar and technician-mobile Preview E2E are green. Production `/api/health` matched that SHA (`dpl_4WqzHhYfeAvVWSJ8CTMrDHG1nbGW`), `schemaReady: true`, dataplane `e51d9599…`. This product PR adds technician operations-gate Preview proof on the same required job.

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

## PR #938 Browser E2E vs Vercel (verified 2026-09-22T20:04Z)

Base `main` is still `a98ffe2ac44537d35cc6ba7b4c21abec8bbb887e` (`#937`). No rebase. Production `/api/health` still matches that SHA. Hobby quota recovered enough to create a Preview deploy for pushed HEAD `8f929867bdec2def3c23c2d3bc780315a1ebb245` (`dpl_7fFUFthQxXMTi9JcfSEFPd2C8G2T`, GitHub deployment `6599441021`, 2026-09-22T19:54:22Z).

| Check on `8f92986` | Result | Cause |
| --- | --- | --- |
| Lint, test, migrate and build | failure | Unit tests: 3 files / 17 tests. `[vitest] No "requireCompanyUser" export` on wholesale `@/lib/current-user` mocks in `vendor-assignment.test.ts`, `execution/atomicity.test.ts`, `invoice-integration/tenant-isolation.test.ts`. Type check + Next build skipped after unit tests. |
| Analyze JavaScript and TypeScript / CodeQL | success | same SHA |
| Vercel | failure | **Not** `api-deployments-free-per-day`. GitHub status `Deployment has failed` with inspect `dpl_7fFUFthQxXMTi9JcfSEFPd2C8G2T`. No new Vercel rate-limit comment. Local `tsc --noEmit` failed on test files included by `tsconfig.json` (`component-writes.test.ts` possibly-undefined Response; `schema-readiness.test.ts` impossible `vendor_contract_id`/`ai_source` comparison). That is a real candidate for the Preview build fail. |
| Auth, navigation, mobile and Command Center | failure | Job `35776645468` never started Playwright. Step **Resolve exact-SHA Preview** attempt 6/24 printed `BLOCKED: Preview deployment failed for 8f92986…`. |

`c9dc7b5` Browser E2E was infrastructural (Preview timeout / Hobby `api-deployments-free-per-day`). **`8f92986` is not that class of failure.** CI is a real test-mock defect. Vercel is a failed Preview deploy, not a missing deploy, and local typecheck errors in included `*.test.ts` files are a real build-gate defect. Do not dummy-commit. Do not `--admin`. Do not use `a3e9137` as a surrogate.

Older SHA `a3e9137` **did** publish Preview and Playwright **did** run: login/dashboard/nav/properties-api passed, then `BLOCKED / NOT VERIFIED: Ticket did not resolve to a work order` (run `35646803772`). Golden-path diagnostics + schema-503 fail-closed are on this branch.

Exact Preview SHA for `babba40`: `babba40f4abac4b693d0a1758fcba7e895ee1d2f` at `https://revalta-ra4zxbug4-youseffakhro1985s-projects.vercel.app` (`dpl_AyVRFBQDneF38VaDakf15pGbWABb`), dataplane `6237f010…`, `schemaReady: true`. Revalta CI on `babba40` **success** (unit tests, typecheck, next build). Browser E2E **ran Playwright** then failed: `BLOCKED / NOT VERIFIED: Ticket did not resolve to a work order (503:SERVICE_UNAVAILABLE;existing=no)` (run `35777995858`). This is a **real ticket→WO write 503** on exact-SHA Preview, not a missing Preview. Do not dummy-commit. Do not `--admin`.

Exact Preview SHA for `e028930`: `e028930a4a2ac250f76d4e17217765f50c848b5f` at `https://revalta-o6hdsese3-youseffakhro1985s-projects.vercel.app` (`dpl_7QNbZrqAcrzs5qggPQAbEifWjxy4`). Revalta CI + CodeQL **success**. Browser E2E **ran Playwright** (login/dashboard/nav/properties-api PASS) then failed: `BLOCKED / NOT VERIFIED: Ticket did not resolve to a work order (503:SERVICE_UNAVAILABLE;existing=no;missing=WorkOrder.notes)` (run `35779212653`). Root cause: Prisma `WorkOrder.notes` exists in schema but no migration adds the column. Dual-read omit + gated write; no notes migration in this PR.

`c908f8d` published exact-SHA Preview `https://revalta-izsy1tb1a-youseffakhro1985s-projects.vercel.app` (`dpl_EsqkrzrN2YJtnmVAvwn9csatGKDD`), health SHA match, dataplane `6237f010…`. CodeQL **success**. Revalta CI **failure**: `ticket-property-integrity.test.ts` got 500 instead of 400 because `hasWorkOrderNotesColumn()` hit the mocked db without `$queryRaw`. Browser E2E resolved that Preview then failed `Verified login response was not observed` (run `35780708384`) before golden-path; login page and `/api/auth/login` were reachable from this session. Fix: mock notes helpers in that test; wait for hydrated `form#login-form[data-ready='1']` like forgot-password.

`1e4c725` exact-SHA Preview `https://revalta-ofgskey3p-youseffakhro1985s-projects.vercel.app` (`dpl_7BdnjsqTMbhQt83TFYTVbY8yQ3j4`). Revalta CI + CodeQL **success**. Browser E2E login/nav/properties **PASS**, ticket→WO **no longer 503 notes**, then `Work order did not reach the expected lifecycle status (500:none)` on GET `/api/work-orders/:id` (run `35781482707`). Cause: notes middleware used Prisma `omit`, which requires preview `omitApi` (off). Replace with explicit scalar `select` excluding `notes`.

`81b93de` exact-SHA Preview `https://revalta-asobxzpr0-youseffakhro1985s-projects.vercel.app` (`dpl_D2zNJ3xcANKQqxq7fbQtLPLJ9tp3`). Revalta CI + CodeQL **success**. GET then 503 `missing=WorkOrder.vendor_contract_id` (run `35782200352`): converting include to all Prisma scalars still selected the unmigrated vendor FK. Dual-read now selects only columns present in information_schema.

`ac9b4ce` exact-SHA Preview `https://revalta-dl5i7hsxn-youseffakhro1985s-projects.vercel.app`. Login/nav PASS, GET WO planned PASS, then PATCH in_progress 503 SERVICE_UNAVAILABLE (run `35782932828`). Interactive `$transaction` skips Prisma `$use` middleware, so locked-update still `include`d every scalar. Use the same live-column `select` inside the transaction.

`5279783` exact-SHA Preview `https://revalta-f0ebtuafg-youseffakhro1985s-projects.vercel.app`. Revalta CI + CodeQL **success**. PATCH then 503 `missing=Ticket.tenant_id` (run `35783682878`): `syncWorkOrderToTicket` used `ticket.update` without `select`, so Prisma loaded the unmigrated Ticket.tenant_id scalar. Add `select: { id: true }`.

`3b39c67` exact-SHA Preview `https://revalta-biij1ch97-youseffakhro1985s-projects.vercel.app`. Revalta CI + CodeQL **success**. Vercel Preview **success**. Golden path passed ticket→WO→in_progress and desktop WO UI, then `mobile work-order title was not visible` (run `35784223455`, ~6s after properties-api, not a 15s timeout). Root cause: `expectVisible` swallows Playwright strict-mode as “was not visible”. After viewport 390px the async SLA queue (`WorkOrderSlaPriorityQueue` above the detail page) has loaded an `h3` with the same WO title as the `h1`. Unique `#work-order-title` plus `#work-order-execution-material` (economics Panel also has an h2 “Material”). Not missing Preview. Not quota.

`e633027` exact-SHA Preview `https://revalta-93un5448r-youseffakhro1985s-projects.vercel.app` (`dpl_9bwAkzcgF1QLAdQsAtiApjhY3Lvk`), dataplane `6237f010…`. Revalta CI + CodeQL + Vercel **success**. Mobile title/material passed. Then `Work order did not enter invoiced (409:none;missing=none)` (run `35785331852`). Not quota. Re-acquire lock immediately before Fakturerad (same as invoice-close UI) and surface allowlisted `code` (`version_conflict` / `invoice_draft_not_ready`).

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
| Vercel Hobby Preview quota | 21 Sep `c9dc7b5` was `api-deployments-free-per-day`. 22 Sep 19:54Z Vercel **did** create Preview `dpl_7fFUFthQxXMTi9JcfSEFPd2C8G2T` for `8f92986` and it **failed** (not rate-limit). Last published Preview remains older SHA `a3e9137`. | `BLOCKED / PREVIEW NOT VERIFIED` until exact-SHA Preview of current PR-head is success. No `--admin`. No dummy commit. |
| GitHub Actions YAML | OAuth token lacks `workflow` scope so Uptime/Monitor/Preview migrate files could not be pushed | `OWNER DECISION REQUIRED` — apply `docs/OWNER_WORKFLOW_UPDATES.md` |

## P1

Tenant negative matrix, Stripe/email/SMS/Blob verification, cron smoke against Production, query performance, hotspot refactors, a11y/mobile polish: not claimed READY. Remaining after `#943`: technician operations-gate Preview (this PR), quote PDF/output if a dedicated export is added, owner-approved Database Status (workflow dispatched, Production environment waiting), Preview GitHub secrets. Staff/resident booking overlap 409s, public-ticket portal-token Tenant B 404s, ticket-dashboard/operations-overview company-scope KPIs, calendar technician assigned WO, recurring/preventive/portfolio/CSV ops gates, document-library technician 403s, and WO report/snapshot finance redaction landed locally. Resident fixture no longer needs extra E2E secrets: team POST + lease holder email match is used.

## P2

Landing-page commercial claims, legal identity, DPA, repo visibility: `OWNER DECISION REQUIRED`. Do not invent company data.

## Historical documents that are not current-main truth

- `docs/FEATURE_READINESS.md` previously cited `b7b08793` (31 Aug 2026). Module statuses remain conservative PARTIAL/BETA/BLOCKED.
- `docs/REV-RELEASE-TRUTH-001.md` cites baseline `af995a8…` and is a bounded Preview-gate record, not current Production evidence.
- Instruction claim of 0 open PRs was false at this SHA; Dependabot HOLDs are open and must not be merged.
