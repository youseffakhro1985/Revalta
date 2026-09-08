# Revalta completion report — 2026-09-08

**BLOCKED — not complete and not ready for release.** This records verified observations, implementation and remaining work. It does not authorize a merge or a Production migration.

## Immediate database-routing incident

During this session's restore verification, the assistant called the Neon snapshot restore tool without an existing target branch, intending to verify an independent restore. The tool finalized a replacement of the source branch: it moved the original endpoint and main/default designation to the restored copy. This was an unintended live-routing change and did not preserve the requested read-only operational boundary. No financial correction SQL or migration was executed.

Both datasets are retained. A read-only comparison at **2026-09-08 09:56:54 UTC** found equal row counts and equal sorted row-content digests in **all 85 public tables**. This proves equality at that observation, not the absence of subsequent writes, transient errors or availability impact. A public Production health read at 09:56:48 UTC returned HTTP 200, database ok and the unchanged release SHA; that is not full customer-flow verification.

Project: `withered-cell-46849200`.

| Resource | Before restore test | Latest verified state |
| --- | --- | --- |
| Original branch `br-damp-block-am62k8yz` | `main`, default/primary | Retained, renamed `revalta-restorecheck-426-20260908 (1)`, no longer default |
| Existing endpoint `ep-autumn-hill-ambriker` | Original branch | Restored branch `br-patient-cell-ampkr94q` |
| Restored branch `br-patient-cell-ampkr94q` | Did not exist | Named `main`, default/primary; restored from snapshot below |
| Extra endpoint `ep-odd-fog-amncpiid` | Did not exist | Created by restore operation, attached to original branch |
| Recovery hold branch `br-falling-king-amjczi6z` | Did not exist | Created without compute; no endpoint has been moved to it |

The first routing recovery was rejected by automatic approval review. After baseline endpoint evidence and the complete table comparison were supplied, the original-endpoint recovery request reached Neon but failed with HTTP 409: the original branch already has a read-write endpoint. Deletion of the extra endpoint failed with HTTP 422: a root branch's read-write endpoint cannot be deleted. A subsequent request to park the extra endpoint on the recovery hold branch was rejected by automatic approval review as an unauthorized live-routing risk. **No alternative execution path will bypass that rejection.**

Concrete recovery plan requiring explicit owner approval:

1. Refresh the table comparison and capture any divergence; preserve both datasets and all snapshots. Never merge or overwrite divergent business rows automatically.
2. If Neon permits it, temporarily move the restore-created endpoint `ep-odd-fog-amncpiid` to the hold branch `br-falling-king-amjczi6z` so the original branch can receive its original endpoint. Abort if provider constraints prevent this; do not delete the original branch or dataset.
3. Reattach `ep-autumn-hill-ambriker` to its proven original branch `br-damp-block-am62k8yz`.
4. Restore the original branch's `main` name/default designation, give the restored copy an explicit quarantine name and keep its dataset for comparison. Remove or suspend disposable computes only after confirming they are unused.
5. Verify endpoint-to-branch mapping, current Production health, fresh migration state and any interval writes before resuming release work.

The restore copy and hold branch contain copied business data. **They are not Preview E2E fixtures and must never be connected to Preview tests.**

## Release identity and implemented change

| Evidence | Exact value |
| --- | --- |
| GitHub main, live branch API | `807457b5619ccf66b7ff2b48834245dd4fc8cc60` |
| Production `/api/health` release | `807457b5619ccf66b7ff2b48834245dd4fc8cc60` |
| Production deployment | `dpl_FZFke1XUNLyK1C3QXiKwLdqSPc1g` |
| Initial #426 head | `8728ae62a0163572c8fbf0e44f7a46608c1ba27e` |
| Tested #426 code correction | `440f6bc179e25a4ce3658e167371468c17da7536` |
| Corrected source blob `e2e/auth-navigation.mjs` | `9f9ce31109fdf5d73033b6943fa17f5c96a4bd74` |

CodeQL's actual security check on the initial head failed with a high-severity **Insecure randomness** finding, despite the analysis workflow completing successfully. The fixture identifier and local-only fixture password now use independent `node:crypto.randomBytes` calls. The password has 24 random bytes; it no longer derives from a public run identifier. No workflow or security scan was disabled. No new product feature or visual redesign was introduced.

## Exact-SHA checks

The following observations apply to code correction SHA `440f6bc179e25a4ce3658e167371468c17da7536`. Any later commit, including this report, needs fresh checks and must not inherit these results as its own.

| Gate | Result | Evidence |
| --- | --- | --- |
| Revalta CI | PASS | Run `34212372548`, job `102016118016`: 206 test files, 1,340 tests; lint, typecheck, migration/build checks and dependency audit succeeded; zero reported vulnerabilities |
| CodeQL analysis | PASS | Run `34212372395`, job `102016117706` |
| CodeQL security result | PASS | Check `102016717043`; initial insecure-randomness alert no longer fails the check |
| Vercel Preview | PASS | Commit status `Vercel`; deployment `J2gGszc5st6cAhQwQc35npeHmbYx` |
| Preview Browser E2E | BLOCKED / FAIL | Run `34212372480`, job `102016117864`: confirmed isolated data and verified fixture account missing |
| Local targeted verification | PASS, limited | 30 target-policy tests; ESLint on edited E2E file; node syntax check; fail-closed assertions; no remote login |

Resolved Preview for the corrected SHA: `https://revalta-8uavf5umt-youseffakhro1985s-projects.vercel.app`.

The runner enforces a full health SHA and Preview environment, then login, dashboard navigation, desktop/mobile Command Center, logout and widths 360/390/768/1024/1280/1440. **These browser flows have not passed.** A local fallback is diagnostic and cannot satisfy the required Preview gate. Provider email and golden-path mutations are separate outstanding gates.

## Preview isolation and access

- Vercel team discovery succeeds for `team_4GYkeSBTtXApHmGlIycnqnci`, but project listing returns an empty list; project and known deployment reads return 404. Runtime error and runtime log reads return 403. Project environment mapping, env presence, usage and Vercel cron execution history therefore remain unverified.
- Before the restore test, the accessible Neon project exposed one branch (`main`), one database (`neondb`) and one endpoint. This does not prove what a Vercel deployment uses.
- Creation of a separate empty `revalta-preview-e2e` project was denied by Neon because the organization is managed by Vercel. No new test project, testtenant or verified E2E account was created.
- `E2E_PREVIEW_DATA_ISOLATED` was **not set**. No E2E email/password or automation bypass secret was added. Secret values have not been included in this report or source changes.
- An unauthenticated request to the initial Preview's `/api/health` succeeded with its exact head SHA without a bypass secret. This is evidence only for that request; bypass necessity for the complete browser flow is not yet proven.

Required configuration after access recovery: create an empty isolated Preview datastore and synthetic Company/User fixture, verify both pooled/direct Preview database identities and isolation from Production, and record a non-secret attestation. Store the verified account credentials in GitHub Actions secrets available only to the trusted Preview workflow; set the isolation variable only after that proof. The current workflow reads repository variables/secrets and does not declare a GitHub Environment. If moving credentials to a dedicated Preview Environment, update the workflow and configure restricted deployment branches/review policy first. Never place these credentials in `NEXT_PUBLIC_*`, source, logs or PR text. Add a Vercel bypass secret only if actual protection requires it.

## Migration and restore evidence

Read-only SQL compared `_prisma_migrations` against all 49 migration files on current main:

- 48 successful applied migrations, matching file checksums.
- Two rolled-back historical attempts for `20260713190000_add_work_orders_and_projects`; no unresolved failed migration.
- Pending: `20260822010000_inspection_checklist_templates`.
- No database-only migration and no successful checksum mismatch.

This is not a literal completed `prisma migrate status` run. That requested CLI gate and a fresh verified Vercel Production mapping remain blocked. No `prisma migrate deploy` or financial backfill was run against the observed database.

Snapshot evidence: `snap-mute-morning-amt5a54v`, name `revalta-release-426-readonly-20260908`, created 2026-09-08 09:53:03 UTC from original branch `br-damp-block-am62k8yz`. Restored copy reports `restored_from` that snapshot, parent LSN `0/16EFB5B0` and parent timestamp 09:52:31 UTC. Restored reads returned 48 successful migrations and the same aggregate counts. The comparison above verified all 85 table contents, but the unintended routing change makes the recovery procedure **BLOCKED**, not release-ready.

The original project metadata showed six hours of history retention, no pre-existing snapshots and an empty snapshot schedule. A retention number alone was not treated as restore evidence. Retain the snapshot and both datasets until routing and interval-write review are complete.

## Read-only IMD / RentNotice findings

At 09:50–09:54 UTC, the explicitly identified original Neon branch had zero ImdReading rows, zero ImdDebitLine rows, zero linked IMD lines, zero IMD-related audit events and no RentNotice with an IMD text marker. One RentNotice existed and lacked `lease_id`. No present record was identified as a suspected IMD double charge under these checks. This is **not** proof that no earlier deleted or otherwise unrecorded data was affected, and current Vercel Production database mapping still requires verification.

Current-main code demonstrably inserts the charge when creating a notice and adds it again when linking. #428's implementation still requires real concurrent PostgreSQL tests. No historical amount, lease_id, status or tenant relation was changed. The existence of one lease is insufficient proof for backfilling the notice: property/unit similarity must not be used to infer a resident or contract relationship.

## Tenant / RBAC evidence matrix

| Actor / boundary | Required proof | Current result |
| --- | --- | --- |
| Unauthenticated | Protected UI redirects; APIs reject access without secrets/data leakage | Exact Preview browser gate blocked; public health only observed |
| Verified owner in synthetic company A | Login, navigation, tenant-scoped golden path | No verified isolated fixture; blocked |
| Staff in company A accessing company B | Foreign IDs and related objects denied across CRUD/export/Blob | Route tests exist; current release E2E matrix unverified |
| Revoked session / unknown role | No login loop and fail-closed role checks | #425 draft unmerged |
| Resident A versus resident B | Only authoritative own leases/notices/bookings | #429 draft unmerged; full browser and SQL proof missing |
| Manager booking for resident | Creator distinct from authoritative resident/lease relation | Booking currently lacks resident_user_id/lease_id; #429 needs model/workflow correction |
| Blob caller | Tenant + work order/assignment ownership; audit + safe errors | #427 draft; provider and durable-recovery proof missing |

## Golden path, providers, cron and module audit

Golden path `felanmälan → arbetsorder → planering → utförande → tid/material → dokument → rapport/signering → fakturaunderlag → avslut → boendeåterkoppling` is **UNVERIFIED** end to end on this exact release. Provider email delivery, Stripe webhook replay, Blob reconciliation/purge and configured integrations are **UNVERIFIED**. A build or mock test does not satisfy them.

Read-only CronJobRun aggregates cover three job types: preventive maintenance (46 runs, latest 2026-09-08 07:14 UTC), recurring incident escalation (47, latest 07:35 UTC), service assignment escalation (7, latest 06:56 UTC); each recorded status `sent`. The repository declares eight schedules. These rows do not establish complete Vercel cron execution, provider delivery, retries or all eight jobs. Runtime logs/usage access is still blocked.

The module statuses and full UI/API/data/CRUD/tenant/RBAC/audit/loading/empty/error/validation/success/retry/responsive/accessibility/browser/Production evidence contract are in [FEATURE_READINESS.md](FEATURE_READINESS.md). The full module and design-consistency audits have not resumed. All existing visual design is preserved. No module is marked READY.

## Ordered remaining releases

| Order | PR / unchanged head | Blocking work |
| --- | --- | --- |
| First | #426 — code correction and this report | Resolve routing incident; restore Vercel access; prove empty isolated test database and fixture; all checks green on exact current head |
| Then | #425 — `b0f22eeec1a8f1aedb73d301f1baeca327bc1d0d` | Reapply on new main; remove duplicated #426 diff; session/role/tenant E2E |
| Then | #429 — `877bb5eafc5c556bb21ba3cd707f2040ae202077` | Reapply on then-current main; authoritative resident/lease attribution, no guessed historical backfill; real concurrency and browser proof |
| Then | #428 — `906b6c488949969bb775ea034738f60f68cd50a5` | Reapply on then-current main; real concurrent PostgreSQL proof; verified Production read-only impact report |
| Then | #427 — `af1bb5bda85ea76fa2daf79ea642c420a834439e` | Reapply on then-current main; durable pre-upload/commit intent and reconciliation after ambiguous commits; explicit soft-delete retention and purge guarded against active references; provider E2E |

No old branch has been merged or rebased ahead of #426. A log line and retained Blob do not prove durable reconciliation. Retention and purge have not been implemented or approved as ready.

## GitHub main protection

Live branch metadata: `protected=false`; ruleset list empty. Repository metadata reports admin permission, but this session's connected API does not expose administration writes or secrets configuration and no authenticated CLI is available. User-level admin permission does not prove the connector can apply a rule.

**Single owner action for branch protection:** apply the following protection to `main` using GitHub Settings or an admin-scoped API session. Use actual check contexts, not workflow display names. Confirm enforcement after saving; do not push directly to main.

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Lint, test, migrate and build", "app_id": 15368 },
      { "context": "CodeQL", "app_id": 57789 },
      { "context": "Auth, navigation, mobile and Command Center", "app_id": 15368 },
      { "context": "Vercel" }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Endpoint: `PUT /repos/youseffakhro1985/Revalta/branches/main/protection`. Vercel's check is required where accepted by GitHub; its app binding must be confirmed from accessible status metadata. PRs remain mandatory even with zero approving reviews required. Recovery approval and restored Vercel project visibility are separate current blockers, not silently satisfied by this proposed rule.
