# Production hardening implementation – 2026-07

Branch: `cursor/production-hardening-impl-6157`

Stacks on tenant hardening (#159), dashboard shell (#160) and schema mirror (#162–#164).

## Implemented

1. **Integrations fail-closed**
   - Email/SMS no longer pretend success in production when unconfigured (`failed` instead of `mocked`).
   - Stripe checkout/portal returns `503` in production when not ready.
   - Register/invite no longer expose secret URLs in production.

2. **Document & file hardening**
   - Shared upload validation profiles with magic-byte checks.
   - Applied to ticket attachments, public attachments, work-order documents and operational documents.
   - Operational documents upload privately and expose controlled download URLs.
   - Document archive lists `downloadUrl` and serves files via `/api/documents/[id]/download`.

3. **Public portal hardening**
   - HMAC tracking tokens on create/track.
   - Public track/comment/upload accept token and scope by `company_id`.
   - Removed `company_id ?? undefined` audit filter risk on public track.

4. **Route consolidation**
   - Legacy `/dashboard/arbetsordrar/[id]/*` redirects to `/dashboard/arbetsorder/[id]`.
   - Index redirects to `/dashboard/arbetsorder`.
   - Operations overview retained as unique legacy surface.

5. **Domain consolidation (P2)**
   - Canonical SLA policy (`sla-policy`) shared by tickets and enterprise work orders.
   - Shared Swedish domain labels (`domain-labels`) for tickets/priorities/work orders.
   - Company-scoped `updateMany`/`deleteMany` on tickets, work orders, properties, projects and lease holders.
   - Work-order report snapshots store proxy download URLs (no raw `storage_url`).
   - Legal/marketing copy is honest (draft legal pages, no overstated GDPR claims).

6. **Continued hardening (P0/P1)**
   - Tenant portal routes: `/portal/[companySlug]` + slug-aware public APIs.
   - Document archive stores private blob URLs in production (no `dataUrl` bytes in AuditLog).
   - `AccessCredential` table with dual-read of legacy AuditLog rows.
   - Stripe webhook resolves company via Stripe customer/subscription ids; metadata mismatch is ignored.
   - Additional company-scoped mutations for ticket AI, ticket→work-order and lease holders.
   - Work-order document delete uses scoped `deleteMany` and best-effort blob cleanup.
   - `Quote`, `QuoteDecision`, `Booking`, `InspectionRound` tables with dual-read of legacy AuditLog rows.
   - Remaining ops modules off AuditLog primary storage: notifications, portfolio maintenance, budget, energy, vendors, compliance inspections, insurance claims, rent notices, calendar.
   - `ManagedDocument` table for document archive with dual-read of legacy AuditLog rows; resident portal reads modern + legacy and downloads via controlled routes.
   - `ImdReading` and `TicketOperation` tables with dual-read of legacy AuditLog rows (final AuditLog-primary API modules).
   - Lease handover/inspection moved off IntegrationEvent primary storage (`LeaseHandoverRecord`, `LeaseInspectionRecord`, `LeaseInspectionWorkOrderLink`) with dual-read.
   - IMD → debit flow: `ImdDebitLine` auto-created on reading; attach to/create rent notice.
   - Document expiry cron (`/api/cron/document-expiry-reminders`) creates AppNotifications.
   - Work-order detail exposes “Skapa projekt från arbetsorder”.
   - Round deviations can be marked and converted to work orders (`PATCH /api/rounds/[id]`, `POST /api/rounds/[id]/work-orders`).
   - Compliance inspections (`action_required`) can spawn corrective work orders.
   - Soft delete (`deleted_at`) for work orders, projects, operational documents and lease holders; list/get/update paths filter active rows.
   - Service notification company/user preferences moved to `ServiceNotificationSettings` / `UserServiceNotificationPreference` (modern-only reads; cron + settings APIs use these tables exclusively).
   - Service notification settings reads are modern-only: cron + settings APIs use `ServiceNotificationSettings` / `UserServiceNotificationPreference` exclusively; missing rows use create-time safe defaults (no `component_service_settings` / `user_service_notification_preferences` IntegrationEvent product reads). Writes remain modern tables + AuditLog.
   - Project detail can assign project manager via `/api/team` and soft-delete projects.
   - Work-order ops off IntegrationEvent primary storage: `WorkOrderTimeEntry`, `WorkOrderMaterialEntry`, `WorkOrderProfitabilitySettings`, `WorkOrderInvoiceDraft`, `WorkOrderInvoiceExportJob` (dual-read + cron/export jobs).
   - Service ops state: `ServiceNotificationAssignment`, `ComponentServiceDigestRun`, `ComponentServiceDeliveryAlert` (+ acks) with dual-read and cron cutover.
   - Notification UX state (`NotificationUxState`) for service-center, WO SLA, lock and recurring reads/snoozes; escalation rules on `ServiceEscalationRulesSettings`.
   - Soft-delete filters applied to raw SQL list/join paths for WorkOrder and Project.
   - Recurring schedules/runs/incidents off AuditLog/IntegrationEvent primary storage: `RecurringWorkOrderSchedule`, `RecurringWorkOrderRun`, `RecurringIncidentEvent` (dual-read + cron cutover).
   - Work-order detail wires attestable economics UI (time/materials/profitability/invoice-basis) alongside field execution.
   - Lease inspection helpers dual-read modern `LeaseInspectionRecord` / `LeaseInspectionWorkOrderLink`.
   - Lock force-release notifications on `WorkOrderLockNotification`; service escalation runs/admin actions on `ServiceAssignmentEscalation` / `ServiceEscalationAdminAction`.
   - Fail-closed legacy mutations for document lifecycle, quote status and portfolio maintenance (require modern tables after backfill).
   - Dual-read storage filter via `mergeByCreatedAt` options (`modernStorage` / `legacyEntityId` / `legacyStorage`) so AuditLog mirrors of modern writes are excluded from list APIs (e.g. notifications).
   - Fail-closed notification read (`AppNotification` + `NotificationRead` only), alert acknowledgement (`ComponentServiceDeliveryAlertAck` only) and lease inspection reconcile (`LeaseInspectionRecord` only); legacy rows return `409` asking for backfill.
   - Cron recovery for service digests resolves modern `ComponentServiceDeliveryAlert` only and logs via AuditLog (no `component_service_delivery_recovery` IntegrationEvent product writes).
   - New backfills: `NotificationRead` from AuditLog `notification.read`, `ComponentServiceDeliveryAlertAck` from IE acknowledgements.
   - Settings nav links to `/dashboard/installningar/eskaleringar` (+ regler).
   - Access credential status lifecycle (`PATCH /api/access-credentials`) and booking cancel (`PATCH /api/bookings`, modern `Booking` only, fail-closed for legacy) with minimal UI actions.
   - Work-order soft-delete (`DELETE /api/work-orders/[id]` sets `deleted_at`) with discreet manager control on detail page.
   - Settings preference writes no longer supersede IntegrationEvent rows; modern tables + AuditLog only (test-email IE remains outbound transport).
   - Work-order economics UI wires Fortnox/Visma/webhook invoice export (`/invoice-integration`) with queue/retry/cancel.
   - Ticket operations panel on felanmälan detail.
   - Idempotent backfill script: `node scripts/backfill-auditlog-modules.mjs` (includes AccessCredential, InspectionRound, QuoteDecision, ManagedDocument, ImdReading, TicketOperation, lease domain tables, service notification settings, work-order ops tables, assignment/digest/alert tables, recurring schedule/run/incident tables, lock notifications, service escalations, lock/recurring notification UX, NotificationRead, ComponentServiceDeliveryAlertAck).
   - Economics UI `entryId` fix: approve/reject for time/material uses `entryId` (not bare `id`) when mapping API rows (parallel/uncommitted work on branch).
   - Invoice export receipt lives on `WorkOrderInvoiceExportJob` (`sent_at` / `external_id` / `provider_response`); cron no longer writes `work_order.invoice_export_receipt` IntegrationEvent.
   - Integrations summary (`GET /api/integrations`) counts invoice jobs from `WorkOrderInvoiceExportJob` by status (queued/processing/failed/sent); IntegrationEvent list remains general activity.
   - `TicketComment` author columns (`author_type`, `author_name`, `author_email`) for public portal/staff comments; public track prefers columns and falls back to AuditLog only for legacy rows missing `author_name`.
   - Ticket soft-delete (`deleted_at` + index `[company_id, deleted_at]`); list/get/update paths filter active rows; `DELETE /api/tickets/[id]` for managers; public track 404s soft-deleted tickets.
   - Fail-closed legacy mutations for rounds (`PATCH /api/rounds/[id]`, `POST .../work-orders`), compliance inspection work-order spawn, and IMD attach-notice: legacy AuditLog-only rows return Swedish `409` asking for backfill to modern tables.
   - Ticket soft-delete UI on felanmälan detail; WO ops approve/reject/stop/delete fail-closed for IE-only rows.
   - Report `invoice.create` builds canonical `WorkOrderInvoiceDraft` from approved time/material (plus archival `WorkOrderInvoiceBasis` snapshot); UI clarifies export via Ekonomi.
   - Compliance inspection status lifecycle (`PATCH /api/inspections/[id]`) with UI; fail-closed for legacy.
   - Operational document soft-delete (`DELETE /api/operational-documents/[id]`) + panel action.
   - Ticket operations hide time/cost when a work order exists and deep-link to WO economics; `POST /api/tickets/[id]/operations` returns Swedish `409` for time/cost when a linked work order exists.
   - Cron product journals: `CronJobRun` for preventive maintenance and recurring incident escalations (no IE job envelopes).
   - Lease soft-delete (`deleted_at` + index `[company_id, deleted_at]`); list/get/update paths under `/api/leases/**` and uthyrning-related lease lists filter active rows; `DELETE /api/leases/[id]` for managers (draft/cancelled/ended only; active → Swedish `409`); uthyrning UI wires discreet remove for leases and lease holders (holder DELETE already on property kontaktregister).
   - Property soft-delete (`deleted_at` + index `[company_id, deleted_at]`); list/get/update/search/count and select paths filter active rows; `DELETE /api/properties/[id]` for managers blocks open leases/tickets/work orders; discreet “Ta bort fastighet” on fastighetskort.
   - Fail-closed status lifecycle for create-only dual-read modules: insurance claims (`PATCH /api/insurance-claims`, statuses `reported|investigating|awaiting_insurer|repairing|settled|closed`), rent notices (`PATCH /api/rent-notices`, `draft|sent|paid|overdue|credited`), and vendors (`PATCH /api/vendors`, `active|ended|cancelled`). Modern table `updateMany` only; legacy AuditLog rows return Swedish `409` asking for backfill; list UI status select + legacy banner.
   - Calendar status lifecycle (`PATCH /api/calendar`, statuses `planned|done|cancelled`) on modern `CalendarEvent` only; legacy AuditLog rows return Swedish `409` asking for backfill; kalender UI status select + legacy banner; audit `calendar.event.status_updated` with `storage: "CalendarEvent"`.
   - Energy hard-safe delete (`DELETE /api/energy`) on modern `EnergyReading` only; legacy → Swedish `409` backfill; energi UI “Ta bort” + legacy banner; audit `energy.reading.deleted` with `storage: "EnergyReading"`.
   - Budget hard-safe delete (`DELETE /api/budget`) on modern `BudgetEntry` only; legacy → Swedish `409` backfill; budget UI “Ta bort” + legacy banner; audit `budget.entry.deleted` with `storage: "BudgetEntry"`.
   - Field correction (modern-only, fail-closed) for dual-read list modules: rent notices (draft: base_rent/additions/deductions/index/period/due/note + totals recalc; non-draft status-only), insurance claims (title/costs/claim_number/insurer/location/note when not settled/closed; closed status-only), vendors (contact always; contract fields while active), budget (`PATCH` amount/category/year/account/note), energy (`PATCH` value/cost/period + per-m² recalc), calendar (title/date/time/responsible/note alongside status). Legacy AuditLog → Swedish `409` backfill; audits `*.updated` with `storage` metadata; list UI “Ändra” expand on modern rows.
   - Field correction (modern-only, fail-closed) for quotes, portfolio maintenance and recurring schedules: quotes `PATCH` allows title/supplier/amounts/VAT/note/valid_until when status is `draft|sent` (status lifecycle + Makulera unchanged; audit `quote.updated` with `storage: "Quote"`); maintenance `PATCH` beyond status for component/measure/planned_year/estimated_cost/priority/interval_years (audit `maintenance.plan.item.updated` with `storage: "PortfolioMaintenanceItem"`); recurring `PATCH` for title/description/frequency/priority/next_run_at/estimated_cost/active via company-scoped `updateMany` (legacy still `409`). List UI “Ändra” expand on modern rows; legacy banners/disabled mutations kept.
   - Work-order economics fail-closed for IE-only dual-read: profitability update, invoice export queue (legacy draft), and export job retry/cancel require modern tables (`WorkOrderProfitabilitySettings` / `WorkOrderInvoiceDraft` / `WorkOrderInvoiceExportJob`); Swedish `409` asks for backfill (same style as time/materials). New draft/settings creates still write modern. GET dual-read marks `source: "legacy"`; economics panel banners + hides legacy mutations. Cron skips IE-only queued jobs (no rematerialize).
   - Soft-delete filter holes closed for manager lists/counts: dashboard ticket KPIs/`_count.tickets`, property detail tickets/`openTickets`, property card work_orders/projects/`_count`, properties API `_count.tickets`, rapporter ticket findMany/`_count`, work-orders list projects include, team `assigned_tickets` count, search nested leases, and WO execution before/after photo counts (`deleted_at: null`); ticket operations GET 404 copy → "Ärendet hittades inte".
   - Component entry corrections fetch `/link-options` (aligned with create-form options route).
   - IMD reading soft-void (`voided_at` on `ImdReading`); `PATCH /api/imd-readings` with `action: "void"` for modern unattached rows only; linked `rent_notice_id` or legacy AuditLog → Swedish `409`; default GET filters voided; debit line status set to `voided`; IMD UI “Makulera” + legacy banner.
   - Ticket operation soft-delete (`deleted_at` on `TicketOperation`); `DELETE /api/tickets/[id]/operations` for modern rows only (company-scoped); legacy → Swedish `409` backfill; GET filters deleted; felanmälan detail discreet “Ta bort” on modern operations.
   - Invoice export retry/cancel `409` copy aligned between `/api/integrations/invoice-exports` and work-order invoice-integration (prefer “återförsökas”).
   - Fail-closed lease inspection/handover mutations: `PUT` inspection-items and handover upsert modern tables only; IE-only leases return Swedish `409` asking for backfill (`LeaseInspectionRecord` / `LeaseHandoverRecord`) and do not rematerialize IE payloads. First create still allowed when neither modern nor IE product state exists. `createInspectionWorkOrders` (and inspection-items work-orders `POST`) require modern `LeaseInspectionRecord`; reconcile already fail-closed.
   - Lease handover/inspection GET dual-read marks `source: "table"|"legacy"`; uthyrning UI (handover, inspection items, create-WO, reconcile) shows amber banner for legacy, disables save/edit/create-WO/sync, and surfaces API `409` backfill text.
   - Recurring schedules fail-closed: PATCH/toggle and generate require modern `RecurringWorkOrderSchedule` (no AuditLog→table upsert); legacy → Swedish `409` backfill. GET dual-read marks `source`; cron skips legacy-due schedules. Återkommande UI amber banner + disabled toggle/generate for legacy.
   - Offerter/dokument/underhåll UI: amber legacy banners, hide approve/status/lifecycle/mutate for `source: "legacy"`, surface API `409` backfill text; service escalation rules reads modern-only (`ServiceEscalationRulesSettings`, defaults when missing — no IE `service_escalation_rules`); property soft-delete open-lease block counts only non-deleted leases (`deleted_at: null`).
   - WO finalize promotes field time/travel/material/external into submitted `WorkOrderTimeEntry` / `WorkOrderMaterialEntry` (idempotent by execution entry id) and updates UI copy toward Ekonomi attestation.
   - AppNotification soft-delete (`deleted_at`); manager `DELETE /api/notifications`; GET filters deleted; notiser UI “Ta bort” + legacy 409.
   - Soft-delete follow-ups: ticket↔work-order ignores soft-deleted WO (GET null / POST can recreate after unlinking `ticket_id`); timeline omits deleted WO; document-expiry cron dedupes only active AppNotifications (`deleted_at: null`) so recalled reminders recreate; notification PATCH returns `404` for soft-deleted modern rows (not false `409`); property-child lists (access credentials, quotes, bookings, rounds, insurance claims, maintenance, energy, budget, rent notices) filter `property: { deleted_at: null }`, and access-credential/quote PATCH 404 when parent property is deleted.
   - Quote status `cancelled` + Makulera action for draft/sent modern quotes.
   - Production launch checklist: post-migrate backfill + CronJobRun/invoice-export smoke checks.

   - Preventive/service cron and escalation/service-center SQL exclude soft-deleted properties (`p."deleted_at" IS NULL`).
   - Soft-delete property filters on remaining API SQL paths: preventive overview, portfolio maintenance, service-center assignment key validation, work-order SLA notifications, and edit-locks list (`p."deleted_at" IS NULL`).
   - Field correction PATCH for quotes (draft/sent), portfolio maintenance items, and recurring schedules (+ UI “Ändra”).
   - Dual-read retirement kill-switch: `REVALTA_MODERN_STORAGE_ONLY=1` makes `mergeByCreatedAt` and WO ops storage skip AuditLog/IE product rows (default off until post-backfill).
   - Preview login diagnosis: Vercel green + login `200` but `/dashboard`/`/api/properties`/`/api/tickets` crash when soft-delete migrations are not deployed yet. Added `getSchemaReadiness` (ops `/api/health` → `schema.ready`/`missing`), graceful dashboard copy, and `503` on properties/tickets list when Prisma reports missing columns. Documented in `docs/production-launch.md`.
   - Preview compatibility mode: `notDeletedFilter` / `hasSoftDeleteColumn` omit `deleted_at` when columns are missing so dashboard, properties, tickets, work-orders and insurance-claims keep working before Database Release. Work-orders always return JSON (fixes Safari “The string did not match the expected pattern” on empty 500 bodies); client uses `readResponseJson`.
   - Global Prisma `$use` soft-delete sanitizer (`soft-delete-compat`): strips nested `deleted_at` filters and omits missing columns for all model queries; raw SQL helpers via `sqlSoftDeleteGuard`; readiness covers LeaseHolder/OperationalDocument/TicketOperation; backfill uses `fetchAll` (no `take: 5000` truncation); expanded auth/module smoke + `smoke-cron.mjs`; bookings/rounds amber legacy banners.
   - Soft-delete middleware recursion fix: `$queryRaw` / raw actions bypass sanitizing so schema-readiness checks cannot re-enter middleware (previous `$use` crashed Vercel with HTML 500 even on `/api/health`). SSR `fastigheter/[id]` and `rapporter` use `notDeletedFilter`.
   - Access credentials field correction (`PATCH` identifier/type/holder/unit/area/dates/note) + Nycklar “Ändra” UI; critical dashboard clients use `readResponseJson`.
   - Rounds field PATCH (title/interval/nextDue) + Ronder “Ändra”; IMD field PATCH (readings/price/note) with debit recalc + IMD “Ändra”; more SQL soft-delete guards (edit-lock force-release, preventive engine, service escalations).
   - Compliance inspections field PATCH + Besiktningar “Ändra”; ManagedDocument field PATCH (name/category/validUntil) + Dokument “Ändra”; broader dashboard `readResponseJson` coverage (skador, budget, energi, kalender, offerter, underhåll, economics/execution panels, etc.).
   - Remaining raw SQL soft-delete ternaries migrated to `sqlSoftDeleteGuard` (work-orders list enterprise join, dashboard SLA ops, maintenance/execution/component SQL paths).
   - Client fetch hardening: properties/maintenance/dashboard notification panels + integrations/boendeportal + auth/invite/password + public report pages use `readResponseJson` (empty/non-JSON bodies no longer crash Safari).
   - Ticket operations field correction (`PATCH /api/tickets/[id]/operations` for description/minutes/amount/completed) + felanmälan detail “Ändra”; modern-only fail-closed for legacy AuditLog rows.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run audit:prod
npm run build:ci
```
