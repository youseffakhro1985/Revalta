# Revalta Feature Readiness

Verified baseline: `b7b08793ccde1baef7a1c210ad9238ad72332df5` (31 Aug 2026)

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
| UX | Responsive actions and content at 360/390/768/1024/1440; no fake/inert controls |
| A11y | Keyboard/focus/labels/semantic states for critical flows |
| Tests | Targeted unit/integration and negative paths; cross-tenant tests where applicable |
| Browser | Exact-SHA browser path for high-value customer workflows |
| Production | Non-mutating smoke or other truthful runtime evidence where safe |
| Dependencies | External env/provider/runtime blockers explicitly recorded |

## Current conservative baseline

The statuses below deliberately avoid calling broad modules READY until their end-to-end evidence has been audited against current main.

| Module | Status | Current evidence / blocker | Next readiness proof |
| --- | --- | --- | --- |
| Översikt | PARTIAL | Canonical dashboard exists and dashboard-integrity gate is green. Full tenant/query/runtime review not yet recorded. | Tenant-safe KPI/query audit + responsive/a11y/browser evidence. |
| Fastigheter | PARTIAL | Substantial current UI/API implementation exists. | Full CRUD/relations/tenant-negative/pagination audit. |
| Ärenden | PARTIAL | Core ticket flows exist and are part of product golden path. | End-to-end tenant/SLA/search/pagination/audit/browser verification. |
| Arbetsordrar | PARTIAL | Significant operational UI/API exists. | Golden-path linkage, tenant relation checks, mobile technician flow, cost/time/material evidence. |
| Kalender | PARTIAL | Current module exists. | Prove calendar reflects canonical operational events rather than parallel truth. |
| Ronder | BLOCKED | Current UI/API/checklist implementation exists, but Production status of `20260822010000_inspection_checklist_templates` is unverified. | Read-only Production migration status, restore evidence, checklist tenant smoke. |
| Besiktningar | PARTIAL | Module exists. | Observation-to-work-order linkage and tenant/security/readiness audit. |
| Underhåll | PARTIAL | Module exists. | Maintenance-plan-to-work-order lifecycle, query and tenant evidence. |
| Skador & försäkring | PARTIAL | Module exists. | Claim relation/security/audit and work-order/project linkage verification. |
| Boendeportal | PARTIAL | Resident auth/navigation and several resident APIs exist. | Full resident-vs-company isolation matrix and production-path review. |
| Uthyrning | PARTIAL | Module exists. | Contract/lifecycle/tenant/search/error/mobile readiness review. |
| Hyresavisering | PARTIAL | Billing/economy surfaces exist. | Truthful invoice/payment lifecycle and financial-data authorization audit. |
| Bokningar | PARTIAL | Module exists. | Conflict/concurrency/resident isolation and mobile/error verification. |
| Nycklar & passage | PARTIAL | Module exists. | Custody/history/security/role/audit lifecycle verification. |
| Ekonomi | PARTIAL | Economy views/APIs exist. | Financial authorization, data truth, audit and query/load verification. |
| Budget & prognos | PARTIAL | Module exists. | Calculation/data-source/query/permission verification. |
| Offerter | PARTIAL | Module exists. | Lifecycle, permissions, document/output and tenant verification. |
| Energi | PARTIAL | Module exists. | Data-source truth, aggregation/query performance and permissions. |
| IMD | PARTIAL | Module exists. | Meter/source/billing claims, tenant isolation and production data verification. |
| Rapporter | PARTIAL | Reporting surfaces exist. | Export tenant isolation, large-data behavior and truthful report definitions. |
| Dokument | PARTIAL | Substantial document APIs and security work exist. | Pagination/performance, blob authorization, lifecycle and cross-tenant negative audit. |
| Projekt | PARTIAL | Module exists. | Relation/financial/tenant/pagination/readiness audit. |
| Team | PARTIAL | Organization/team surfaces exist. | Invite/role/removal authorization and lifecycle audit. |
| Leverantörer | PARTIAL | Module exists. | Tenant scoping, assignment relations, search/pagination and permissions. |
| Behörigheter | PARTIAL | Role-aware navigation/auth patterns exist. | Formal permission matrix + endpoint-level enforcement proof. |
| Integrationer | PARTIAL | Integration infrastructure exists. | Provider-by-provider env, failure, retry, secret and customer-facing truth audit. |
| Inställningar | PARTIAL | Settings surfaces exist. | Role boundaries, validation, tenant-scoped writes and sensitive-setting audit. |
| Billing | BETA | Plan allowlist, checkout and portal P0 hardening merged with exact-SHA gates. | Canonical plan registry + webhook lifecycle/idempotency/replay + customer UX cleanup. |
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
