# Revalta Feature Readiness

Observed main and Production release: `807457b5619ccf66b7ff2b48834245dd4fc8cc60` (8 Sep 2026, live checks).

**Release status: BLOCKED.** The database-routing recovery was explicitly approved and completed on 8 Sep 2026: original endpoint, original `main` branch and default/primary designation are restored. Before/after checks found identical contents in all 85 public tables and Production-safe HTTP smoke passed. See [REVALTA_COMPLETION_REPORT.md](REVALTA_COMPLETION_REPORT.md). Preview isolation, credentials and provider access still prevent release; no module may be promoted on this limited smoke evidence.

PR #426 verified candidate `4351a00802d7eb42bc49ce0ad7807701b1caff56` has passing Revalta CI (206 files / 1,340 tests), CodeQL security check and Vercel. Exact Preview Browser E2E fails closed because isolation and verified credentials are absent. These results apply only to that SHA; subsequent documentation commits require their own gates.

The visible Neon database has 48 successfully applied migrations matching repository checksums, two historical rolled-back attempts and one pending migration, `20260822010000_inspection_checklist_templates`. This is a read-only SQL comparison, **not** a completed Production `prisma migrate status` or proof of current Vercel environment mapping.

This document is an evidence gate, not a feature catalogue. A route, API or Prisma model existing does **not** make a module production-ready.

## Status contract

- **READY** — UI/API/data/auth/tenant/error/responsive/test/production evidence is complete for the intended scope.
- **BETA** — coherent end-to-end workflow exists, but one or more non-critical readiness gates remain.
- **PARTIAL** — meaningful implementation exists, but important workflow or quality evidence is incomplete.
- **BLOCKED** — a known dependency prevents safe use or verification.
- **HIDDEN** — intentionally not exposed to normal customers until readiness improves.

No module may move to READY without recorded evidence for the applicable columns below.

## Required evidence per exposed module

| Area | Required evidence |
| --- | --- |
| UI | Primary workflow, loading, empty, error, retry, validation, success, destructive confirmation |
| API | Authenticated/authorized contracts, safe errors, bounded payloads, stable semantics |
| Data | Correct schema/relations, migration state, query shape, lifecycle behavior |
| CRUD | Create/read/update/delete where the product contract requires them |
| Discovery | Search/filter/stable sorting/pagination appropriate to expected dataset size |
| Security | Role/ownership/company isolation and related-object tenant validation |
| Audit | Material mutations produce suitable audit evidence without leaking sensitive content |
| UX | Responsive actions and content at 360/390/768/1024/1280/1440; no fake/inert controls |
| A11y | Keyboard/focus/labels/semantic states for critical flows |
| Tests | Targeted unit/integration and negative paths; cross-tenant tests where applicable |
| Browser | Exact-SHA browser path for high-value customer workflows |
| Production | Non-mutating smoke or other truthful runtime evidence where safe |
| Dependencies | External env/provider/runtime blockers explicitly recorded |

## Current conservative baseline

The statuses below deliberately avoid calling broad modules READY until their end-to-end evidence has been audited against current main.

| Module | Status | Current evidence / blocker | Next readiness proof |
| --- | --- | --- | --- |
| Auth/session | BLOCKED | #425 remains an unmerged draft; exact Preview login and revoked-session/RBAC provider evidence are missing. | Resolve #426, then reapply #425 on fresh main and verify all required checks. |
| Översikt | PARTIAL | Canonical dashboard exists and dashboard-integrity gate is green. Full tenant/query/runtime review not yet recorded. | Tenant-safe KPI/query audit + responsive/a11y/browser evidence. |
| Fastigheter | PARTIAL | Substantial current UI/API implementation exists. | Full CRUD/relations/tenant-negative/pagination audit. |
| Ärenden | PARTIAL | Core ticket flows exist and are part of product golden path. | End-to-end tenant/SLA/search/pagination/audit/browser verification. |
| Arbetsordrar | PARTIAL | Significant operational UI/API exists. | Golden-path linkage, tenant relation checks, mobile technician flow, cost/time/material evidence. |
| Kalender | PARTIAL | Current module exists. | Prove calendar reflects canonical operational events rather than parallel truth. |
| Ronder | BLOCKED | Checklist migration is pending in the restored Neon main; current Vercel mapping and CLI migration status remain unverified. | Read-only Production migration status, current restore evidence and checklist tenant smoke. |
| Besiktningar | PARTIAL | Module exists. | Observation-to-work-order linkage and tenant/security/readiness audit. |
| Underhåll | PARTIAL | Module exists. | Maintenance-plan-to-work-order lifecycle, query and tenant evidence. |
| Skador & försäkring | PARTIAL | Module exists. | Claim relation/security/audit and work-order/project linkage verification. |
| Boendeportal | BLOCKED | #429 is unmerged; created_by_id alone cannot represent staff booking for a resident. | Authoritative resident/lease relation, no property/unit inference, full isolation matrix and browser evidence. |
| Uthyrning | PARTIAL | Module exists. | Contract/lifecycle/tenant/search/error/mobile readiness review. |
| Hyresavisering | BLOCKED | #428 is unmerged; observed database has one notice without lease_id and no current IMD rows or IMD audit events. | Real concurrent PostgreSQL verification; prove any historical lease relationship before a separate backfill. |
| Bokningar | BLOCKED | #429 is unmerged; resident attribution and cross-path concurrency remain unverified. | Authoritative resident attribution, shared locks, real PostgreSQL concurrency and exact Preview browser evidence. |
| Nycklar & passage | PARTIAL | Module exists. | Custody/history/security/role/audit lifecycle verification. |
| Ekonomi | PARTIAL | Economy views/APIs exist. | Financial authorization, data truth, audit and query/load verification. |
| Budget & prognos | PARTIAL | Module exists. | Calculation/data-source/query/permission verification. |
| Offerter | PARTIAL | Module exists. | Lifecycle, permissions, document/output and tenant verification. |
| Energi | PARTIAL | Module exists. | Data-source truth, aggregation/query performance and permissions. |
| IMD | BLOCKED | Current main adds the charge twice when creating and attaching a notice. #428 is unmerged; absence of rows in the observed database is not proof of no historical impact. | Reapply #428 in sequence, real concurrent PostgreSQL tests and read-only Production investigation with verified mapping. |
| Rapporter | PARTIAL | Reporting surfaces exist. | Export tenant isolation, large-data behavior and truthful report definitions. |
| Dokument | BLOCKED | #427 is unmerged. Durable reconciliation after an uncertain commit and safe retention/purge are not proven. | Durable upload/commit journal, Blob/DB reconciliation and guarded retention; provider and tenant E2E. |
| Projekt | PARTIAL | Module exists. | Relation/financial/tenant/pagination/readiness audit. |
| Team | PARTIAL | Organization/team surfaces exist. | Invite/role/removal authorization and lifecycle audit. |
| Leverantörer | PARTIAL | Module exists. | Tenant scoping, assignment relations, search/pagination and permissions. |
| Behörigheter | BLOCKED | #425 is unmerged; current-main role rejection/session issues and end-to-end isolation remain unresolved. | Formal permission matrix + endpoint-level enforcement and browser proof on exact release SHA. |
| Integrationer | PARTIAL | Integration infrastructure exists. | Provider-by-provider env, failure, retry, secret and customer-facing truth audit. |
| Inställningar | PARTIAL | Settings surfaces exist. | Role boundaries, validation, tenant-scoped writes and sensitive-setting audit. |
| Billing | PARTIAL | Existing checkout/webhook code and prior tests do not prove current provider delivery or the full commercial workflow. | Exact-release provider E2E, webhook lifecycle/idempotency/replay, plan registry and customer UX. |
| Audit/administration | PARTIAL | Audit infrastructure exists. | Coverage, query access, sensitive-field minimization, pagination and retention review. |

## Cross-module golden path gate

Before broad feature expansion, Revalta must make this path coherent and strongly tested:

`Felanmälan → klassificering/AI-bedömning → prioritet/SLA → ansvarig → arbetsorder → schemaläggning → tekniker/leverantör → checklista → tid/material/kostnad → dokument/bilder → åtgärd → rapport/signering → fakturaunderlag → avslut → boendeåterkoppling`

Required relationship proofs:

- rondavvikelse → arbetsorder
- besiktningsanmärkning → arbetsorder
- underhållsaktivitet → arbetsorder
- skadeärende → relevant arbetsorder/projekt
- kalender → representation of canonical operational records, not duplicated source of truth
- leverantör → assignment
- arbetsorder → time/material/cost/invoice basis

## Promotion rule

Every status change must cite current-main code/tests/runtime evidence. If evidence becomes stale after material architecture/schema/auth changes, downgrade the status until reverified.

The routing recovery is complete. The full module and design-consistency audit has not resumed: #426 still blocks the ordered sequence #425 → #429 → #428 → #427 because isolated Preview data/account and Vercel access are not verified. No module has been promoted to READY in this revision. The existing Swedish premium design is unchanged.
