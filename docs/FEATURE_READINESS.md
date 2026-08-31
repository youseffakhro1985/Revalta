# Revalta Feature Readiness Matrix

Snapshot baseline: `9217470c171e0dd905cac7f83aa6530b2ca53865`  
Verified date: 2026-08-31

## Purpose

This document prevents navigation presence or a rendering page from being mistaken for production readiness.

Allowed module states:

- `READY` — complete evidence exists for the release contract below.
- `BETA` — usable end-to-end with explicit bounded limitations.
- `PARTIAL` — implementation exists but the full release contract is not proven.
- `BLOCKED` — a known dependency prevents safe production use.
- `HIDDEN` — intentionally not exposed to normal users.

**Fail-closed rule:** until a module has been audited against the full contract, it is not `READY`.

## Release contract for READY

A `READY` module must have evidence for the relevant items below:

1. canonical UI route and no duplicate implementation,
2. API/server action contract,
3. persisted data model where required,
4. create/read/update/delete behavior as applicable,
5. search/filter/pagination for potentially large collections,
6. role/permission enforcement,
7. Company tenant isolation on reads and writes,
8. nested-relation / IDOR protection,
9. auditability for meaningful mutations,
10. loading, empty, error, retry and validation states,
11. responsive behavior at 360/390/768/1024/1440 where applicable,
12. keyboard/focus/screen-reader semantics,
13. unit/integration tests,
14. cross-tenant negative tests for tenant-scoped data,
15. browser E2E for the primary workflow,
16. production release identity verified,
17. production runtime smoke where safe,
18. no known blocker that invalidates the workflow.

## Current navigation-exposed inventory

This is an initial stabilization baseline, not a claim that every unchecked field is missing. `?` means it has not yet been exhaustively verified against current main.

| Module | Canonical route | UI | API/server | DB | Permissions | Tenant negative tests | Error/empty UX | Responsive/A11y | E2E | Prod verified | Status | Current blocker / next proof |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Översikt | `/dashboard` | yes | ? | ? | yes | ? | ? | ? | ? | no | PARTIAL | Full dashboard contract audit |
| Fastigheter | `/dashboard/fastigheter` | yes | ? | yes | yes | ? | ? | ? | ? | no | PARTIAL | Tenant/query/E2E evidence |
| Ärenden | `/dashboard/felanmalan` | yes | yes | yes | yes | ? | ? | ? | ? | no | PARTIAL | Golden-path + tenant negative audit |
| Arbetsordrar | `/dashboard/arbetsorder` | yes | yes | yes | yes | ? | ? | ? | ? | no | PARTIAL | Golden-path + execution/invoice proof |
| Kalender | `/dashboard/kalender` | yes | yes | yes | yes | ? | ? | ? | ? | no | PARTIAL | Source-of-truth and timezone audit |
| Ronder | `/dashboard/ronder` | yes | yes | yes in schema | yes | ? | yes | ? | ? | no | BLOCKED | Production status of `20260822010000_inspection_checklist_templates` must be proven |
| Besiktningar | `/dashboard/besiktningar` | yes | ? | yes | yes | ? | ? | ? | ? | no | PARTIAL | Work-order linkage and tenant proof |
| Underhåll | `/dashboard/underhall` | yes | ? | yes | role gated | ? | ? | ? | ? | no | PARTIAL | Preventive-work-order end-to-end proof |
| Skador & försäkring | `/dashboard/skador` | yes | yes | yes | finance gated | ? | ? | ? | ? | no | PARTIAL | Claim/work-order/project linkage audit |
| Boendeportal | `/dashboard/boendeportal` | yes | yes | yes | leasing/resident | ? | ? | ? | ? | no | PARTIAL | Resident/company boundary E2E |
| Uthyrning | `/dashboard/uthyrning` | yes | ? | yes | leasing gated | ? | ? | ? | ? | no | PARTIAL | Lease lifecycle end-to-end audit |
| Hyresavisering | `/dashboard/hyresavisering` | yes | ? | yes | leasing gated | ? | ? | ? | ? | no | PARTIAL | Billing/debit truth and export audit |
| Bokningar | `/dashboard/bokningar` | yes | yes | yes | leasing gated | ? | ? | ? | ? | no | PARTIAL | Concurrency/availability E2E |
| Nycklar & passage | `/dashboard/nycklar` | yes | yes | yes | access-credential gated | ? | ? | ? | ? | no | PARTIAL | Sensitive credential/access audit |
| Ekonomi | `/dashboard/ekonomi` | yes | ? | ? | finance gated | ? | ? | ? | ? | no | PARTIAL | Define accounting source-of-truth boundaries |
| Budget & prognos | `/dashboard/budget` | yes | yes | yes | finance gated | ? | ? | ? | ? | no | PARTIAL | Aggregate/query/performance audit |
| Offerter | `/dashboard/offerter` | yes | yes | yes | finance gated | ? | ? | ? | ? | no | PARTIAL | Quote decision/end-to-end workflow |
| Energi | `/dashboard/energi` | yes | yes | yes | finance gated | ? | ? | ? | ? | no | PARTIAL | Reading import/aggregation evidence |
| Mätare & IMD | `/dashboard/imd` | yes | yes | yes | finance gated | ? | ? | ? | ? | no | PARTIAL | Meter/debit correctness and tenant audit |
| Rapporter | `/dashboard/rapporter` | yes | ? | ? | operations gated | ? | ? | ? | ? | no | PARTIAL | Report definitions/export contract |
| Dokument | `/dashboard/dokument` | yes | yes | yes | role gated | ? | ? | ? | ? | no | PARTIAL | Pagination/performance + private blob audit; stale PR #239 only as reference |
| Projekt | `/dashboard/projekt` | yes | yes | yes | operations gated | ? | ? | ? | ? | no | PARTIAL | Project/work-order/cost relation proof |
| Team | `/dashboard/team` | yes | yes | yes | team/leasing gate | ? | ? | ? | ? | no | PARTIAL | Invite/role lifecycle E2E |
| Leverantörer | `/dashboard/leverantorer` | yes | yes | yes | operations gated | ? | ? | ? | ? | no | PARTIAL | Contract/vendor tenant + expiry flow |
| Inställningar | `/dashboard/installningar` | yes | mixed | mixed | yes | ? | ? | ? | ? | no | PARTIAL | Subroute-by-subroute readiness |
| Behörigheter | `/dashboard/behorigheter` | yes | ? | ? | company-admin gated | ? | ? | ? | ? | no | PARTIAL | Full privilege-escalation negative suite |
| Integrationer | `/dashboard/integrationer` | yes | yes | yes/telemetry | integration-admin gated | ? | ? | ? | ? | no | PARTIAL | Live/mock truth, secret handling and provider state |
| Billing | `/dashboard/billing` | yes | yes | yes | billing-admin gated | ? | yes | ? | ? | no | PARTIAL | P0 plan validation + canonical plan/Stripe contract + remove dev copy |
| Resident: Mina dokument | `/dashboard/boendeportal/dokument` | yes | ? | yes | resident | ? | ? | ? | ? | no | PARTIAL | Resident-only data exposure audit |
| Resident: Mina avier | `/dashboard/boendeportal/avier` | yes | ? | yes | resident | ? | ? | ? | ? | no | PARTIAL | Debit/payment truth audit |
| Resident: Mina bokningar | `/dashboard/boendeportal/bokningar` | yes | ? | yes | resident | ? | ? | ? | ? | no | PARTIAL | Resident booking authorization audit |
| Resident: Mitt konto | `/dashboard/boendeportal/konto` | yes | ? | yes | resident | ? | ? | ? | ? | no | PARTIAL | Profile mutation/auth boundary audit |

## Immediate product rule

Do not add more top-level navigation modules during P0/P1 stabilization unless a blocker requires a narrowly scoped support surface.

The next product-quality milestone is not feature count. It is proving the existing core workflow:

`Felanmälan → prioritering/SLA → arbetsorder → planering/ansvarig → checklista → tid/material → dokumentation → rapport/signering → fakturaunderlag → avslut → återkoppling`.

## Update discipline

Every readiness change must include evidence in the same PR or link to exact-SHA CI/E2E/production evidence. Do not promote a status from inference, screenshots or historical branch results.
