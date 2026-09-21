# Tenant security matrix

Source: current code on the branch that introduced this file. This is an evidence map, not a claim that every route is proven.

Negative tests must use two companies (Tenant A / Tenant B). A mocked `findFirst` that already contains `company_id` is necessary but not sufficient for related-object attacks.

## Contract

- Staff reads/writes are scoped by the session company, never by a client-supplied `company_id`.
- Related ids (`property_id`, `ticket_id`, `lease_id`, `document_id`, `vendor_id`, `unit_id`, `component_id`, `project_id`, `work_order_id`) must be re-loaded with `company_id` of the caller. Helper: `findCompanyOwned` in `src/lib/tenant-relations.ts`.
- Cross-tenant misses return **404** (`tenantSafeMissResponse`) rather than 403 that confirms the row exists.
- Residents must not inherit staff company-scope. Resident access is identity/lease/unit scoped.
- Soft-deleted parents must not be mutated through child APIs.
- Public portal uses an explicit portal tenant only. Foreign company UUIDs are not a slug.

## Domain map (conservative)

| Domain | Direct company scope | Related-object scope | Current automated evidence | Residual risk |
| --- | --- | --- | --- | --- |
| Properties / buildings / units | Yes on property APIs | Building/asset checks in work-order asset links | Property route 404 tests; `validateWorkOrderAssetLinks` | Full unit/building matrix incomplete |
| Tickets / comments / attachments | `company_id` on ticket routes | Property active/deleted guards | Ticket route tenant tests | Comment/attachment related-id matrix incomplete |
| Work orders / execution / time / material | `company_id` + property join | Asset/property validation on create | Transition and invoice-basis isolation tests | Golden-path + related-id negative still P1 |
| Projects / maintenance / components | Company filters present | Property joins in several engines | Partial | Needs dedicated Tenant B tests |
| Rounds / inspections | Company filters present | Lease/property joins in inspection helpers | Partial | Production schema of checklist templates unverified |
| Leases / holders / handover / rent notices | Company + property deleted_at | Lease lookup helpers | Partial | Resident vs staff matrix incomplete |
| Bookings / access credentials | Company filters present | Property/unit | Partial | Resident isolation incomplete |
| Documents / operational documents | Company filters; parent constraint migration exists | Parent must be same company | Partial | Blob URL negative tests still P1 |
| Quotes / vendors / insurance | Company filters present | Property/vendor relations | Partial | Export/search negatives incomplete |
| Energy / IMD / budget / calendar | Company filters present | Property | Partial | Query/tenant audit incomplete |
| Notifications / audit / integrations | Company scoped lists | — | Partial | Export CSV injection still P1 |
| Invoice export / billing | Company on work-order finance routes | Work order ownership | Invoice tenant-isolation tests | Provider readiness still P1 |
| Search / export | Company where clauses | — | Search + ticket export tests | Bounded export + formula injection P1 |
| Public portal | Explicit portal company | Property must belong to that company | `public-portal-tenant.test.ts` | Commercial tenant id is owner decision |
| Resident portal | Must be stricter than staff | Ticket/lease ownership | Partial | Dedicated Resident A/B tests still P1 |

## Two-tenant negative cases (minimum)

Tenant A authenticated requests against Tenant B ids must 404/403 per API contract for GET, PATCH, DELETE, related-id attach, export, search, and blob download.

This file is updated when a domain’s tests move from mock-scope proofs to two-organisation proofs. Do not mark a domain READY from this table alone.
