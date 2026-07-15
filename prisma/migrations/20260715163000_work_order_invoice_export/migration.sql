ALTER TABLE "WorkOrderInvoiceDraft"
  ADD COLUMN "external_system" TEXT,
  ADD COLUMN "external_invoice_id" TEXT,
  ADD COLUMN "exported_at" TIMESTAMP(3),
  ADD COLUMN "exported_by_id" TEXT,
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "invoiced_at" TIMESTAMP(3),
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "status_comment" TEXT;

CREATE TABLE "WorkOrderInvoiceStatusEvent" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "invoice_draft_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "comment" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderInvoiceStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderInvoiceExportLog" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "invoice_draft_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "checksum" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderInvoiceExportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderInvoiceDraft_company_status_idx" ON "WorkOrderInvoiceDraft"("company_id", "status");
CREATE INDEX "WorkOrderInvoiceDraft_external_invoice_idx" ON "WorkOrderInvoiceDraft"("company_id", "external_invoice_id");
CREATE INDEX "WorkOrderInvoiceStatusEvent_draft_created_idx" ON "WorkOrderInvoiceStatusEvent"("invoice_draft_id", "created_at");
CREATE INDEX "WorkOrderInvoiceExportLog_draft_created_idx" ON "WorkOrderInvoiceExportLog"("invoice_draft_id", "created_at");

ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_exported_by_id_fkey" FOREIGN KEY ("exported_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceStatusEvent" ADD CONSTRAINT "WorkOrderInvoiceStatusEvent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceStatusEvent" ADD CONSTRAINT "WorkOrderInvoiceStatusEvent_invoice_draft_id_fkey" FOREIGN KEY ("invoice_draft_id") REFERENCES "WorkOrderInvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceStatusEvent" ADD CONSTRAINT "WorkOrderInvoiceStatusEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceExportLog" ADD CONSTRAINT "WorkOrderInvoiceExportLog_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceExportLog" ADD CONSTRAINT "WorkOrderInvoiceExportLog_invoice_draft_id_fkey" FOREIGN KEY ("invoice_draft_id") REFERENCES "WorkOrderInvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceExportLog" ADD CONSTRAINT "WorkOrderInvoiceExportLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderInvoiceDraft" DROP CONSTRAINT IF EXISTS "WorkOrderInvoiceDraft_status_check";
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_status_check" CHECK ("status" IN ('draft', 'exported', 'sent', 'invoiced', 'paid', 'cancelled'));
ALTER TABLE "WorkOrderInvoiceStatusEvent" ADD CONSTRAINT "WorkOrderInvoiceStatusEvent_status_check" CHECK ("to_status" IN ('draft', 'exported', 'sent', 'invoiced', 'paid', 'cancelled'));
ALTER TABLE "WorkOrderInvoiceExportLog" ADD CONSTRAINT "WorkOrderInvoiceExportLog_format_check" CHECK ("format" IN ('csv', 'print', 'json'));
