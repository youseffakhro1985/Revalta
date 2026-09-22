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
| Tickets / comments / attachments | `company_id` on ticket routes | Property and assignee re-read via `findCompanyOwned`; comments/attachments require parent ticket in session company before blob write | Ticket POST Tenant B property/assignee 404; comment/attachment Tenant B 404; blob GET scoped through parent ticket | Internal comment body still listed only after parent 404 |
| Resident portal | Must be stricter than staff | Ticket/lease ownership via reporter/lease-holder email; staff APIs 403 for residents | Resident helper email+company tests; `findResidentMatchedLease` by id (not list membership); Resident A cannot create ticket/booking on Tenant B or Resident B lease (404); cancel Tenant B booking 404; notices only `lease_id in` matched; staff `/api/leases` and `/api/bookings` 403 for residents | Golden-path Preview E2E still P1 |
| Work orders / execution / time / material | `company_id` + property join | Property/ticket 404; unit via property.company_id; assignee/vendor related-id 404 | Create tenant atomicity + vendor assignment + mutation atomicity; Preview golden-path planned→invoiced | Dedicated technician-role E2E still P1 |
| Projects / maintenance / components | Company filters present | Property joins in several engines; project GET by session `company_id`; maintenance POST re-reads property via `tenantWhere` | Project POST Tenant B property/manager/WO 404; project GET Tenant B id 404; maintenance POST Tenant B propertyId 404; PATCH Tenant B item id 404 | Component action remaining surfaces |
| Documents / operational documents | Company filters; parent constraint migration exists | Parent must be same company; download lookup by session `company_id` | Document download Tenant B 404 without blob stream; operational download Tenant B 404; untrusted storage URL is not fetched | Remaining operational list/export surfaces |
| Rounds / inspections | Company filters present | Lease/property joins in inspection helpers; POST re-reads property via `tenantWhere`; PATCH/work-order look up inspection by session `company_id` | Inspection POST Tenant B propertyId 404; PATCH Tenant B inspection id 404; work-order POST Tenant B inspection id 404 before create | Production schema of checklist templates unverified |
| Leases / holders / handover / rent notices | Company + property deleted_at | Lease lookup helpers; rent notice create 404s Tenant B `leaseId`; resident staff-lease APIs 403 | Rent notice POST Tenant B lease; resident GET/PATCH/DELETE `/api/leases` 403; handover GET/PUT Tenant B lease id 404 before payload/mutation | Remaining lease-holder export surfaces |
| Bookings / access credentials | Company filters present | Resident create uses `findResidentMatchedLease`; list/cancel by `created_by_id` + `company_id`; credential POST re-reads property via `tenantWhere`; PATCH looks up credential by session `company_id` | Resident A vs Tenant B/Resident B lease 404; cancel Tenant B booking 404; staff `/api/bookings` 403 for residents; access-credential POST Tenant B propertyId 404; PATCH Tenant B credential id 404 | Remaining booking conflict/concurrency Preview |
| Quotes / vendors / insurance | Company filters present | Vendor create property via `findCompanyOwned`; quote/claim POST re-reads property via `tenantWhere`; PATCH/work-order look up quote/claim by session `company_id` | Vendor POST Tenant B propertyId 404; quote POST Tenant B propertyId 404; PATCH Tenant B quote id 404; work-order POST Tenant B quote id 404; insurance-claim POST Tenant B propertyId 404; PATCH Tenant B claim id 404; work-order POST Tenant B claim id 404 | Remaining quote document/output surfaces |
| Energy / IMD / budget / calendar | Company filters present | Property and IMD lease re-read in caller company; calendar events by session `company_id` | Energy POST Tenant B propertyId 404; DELETE Tenant B reading id 404; IMD POST Tenant B propertyId 404; IMD POST Tenant B leaseId 404; budget POST Tenant B propertyId 404; DELETE Tenant B entry id 404; calendar PATCH/DELETE Tenant B event id 404; calendar GET lease company scope | Remaining calendar work-order projection negatives |
| Notifications / audit / integrations | Company scoped lists | — | Partial | Remaining notification export surfaces |
| Invoice export / billing | Company on work-order finance routes | Work order ownership | Invoice tenant-isolation tests | Provider readiness still P1 |
| Search / export | Company where clauses | CSV cells quoted | Search company scope; ticket export company scope; ticket export quotes `=`/`+` cells | Bounded export + remaining formula surfaces P1 |
| Public portal | Explicit portal company | Property must belong to that company; foreign property 404 | `public-portal-tenant.test.ts`; public ticket property 404 | Commercial tenant id is owner decision |

## Two-tenant negative cases (minimum)

Tenant A authenticated requests against Tenant B ids must 404/403 per API contract for GET, PATCH, DELETE, related-id attach, export, search, and blob download.

This file is updated when a domain’s tests move from mock-scope proofs to two-organisation proofs. Do not mark a domain READY from this table alone.
