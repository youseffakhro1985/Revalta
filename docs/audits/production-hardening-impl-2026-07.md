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
   - Service notification company/user preferences moved to `ServiceNotificationSettings` / `UserServiceNotificationPreference` (dual-read + cron prefers modern tables).
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
   - Ticket operations hide time/cost when a work order exists and deep-link to WO economics.
   - Cron product journals: `CronJobRun` for preventive maintenance and recurring incident escalations (no IE job envelopes).
   - Lease soft-delete (`deleted_at` + index `[company_id, deleted_at]`); list/get/update paths under `/api/leases/**` and uthyrning-related lease lists filter active rows; `DELETE /api/leases/[id]` for managers (draft/cancelled/ended only; active → Swedish `409`); uthyrning UI wires discreet remove for leases and lease holders (holder DELETE already on property kontaktregister).
   - Property soft-delete (`deleted_at` + index `[company_id, deleted_at]`); list/get/update/search/count and select paths filter active rows; `DELETE /api/properties/[id]` for managers blocks open leases/tickets/work orders; discreet “Ta bort fastighet” on fastighetskort.
   - Fail-closed status lifecycle for create-only dual-read modules: insurance claims (`PATCH /api/insurance-claims`, statuses `reported|investigating|awaiting_insurer|repairing|settled|closed`), rent notices (`PATCH /api/rent-notices`, `draft|sent|paid|overdue|credited`), and vendors (`PATCH /api/vendors`, `active|ended|cancelled`). Modern table `updateMany` only; legacy AuditLog rows return Swedish `409` asking for backfill; list UI status select + legacy banner. Energy/budget skipped (no status field); calendar deferred (only create default `planned`).

## Verification

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run audit:prod
npm run build:ci
```
