ALTER TABLE "WorkOrder"
  ADD COLUMN "approved_budget" DECIMAL(14,2),
  ADD COLUMN "financial_status" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "financial_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "financial_reviewed_by_id" TEXT,
  ADD COLUMN "financial_review_comment" TEXT,
  ADD COLUMN "financial_locked_at" TIMESTAMP(3);

CREATE TABLE "WorkOrderInvoiceDraft" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "draft_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "customer_name" TEXT,
  "customer_reference" TEXT,
  "subtotal_ex_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_inc_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by_id" TEXT NOT NULL,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderInvoiceDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderInvoiceDraftLine" (
  "id" TEXT NOT NULL,
  "invoice_draft_id" TEXT NOT NULL,
  "source_entry_id" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "unit" TEXT,
  "unit_price_ex_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
  "line_total_ex_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WorkOrderInvoiceDraftLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderInvoiceDraft_company_number_key" ON "WorkOrderInvoiceDraft"("company_id", "draft_number");
CREATE UNIQUE INDEX "WorkOrderInvoiceDraft_work_order_key" ON "WorkOrderInvoiceDraft"("work_order_id");
CREATE INDEX "WorkOrder_company_financial_status_idx" ON "WorkOrder"("company_id", "financial_status");
CREATE INDEX "WorkOrderInvoiceDraft_company_status_idx" ON "WorkOrderInvoiceDraft"("company_id", "status");
CREATE INDEX "WorkOrderInvoiceDraftLine_draft_sort_idx" ON "WorkOrderInvoiceDraftLine"("invoice_draft_id", "sort_order");

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_financial_reviewed_by_id_fkey" FOREIGN KEY ("financial_reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraftLine" ADD CONSTRAINT "WorkOrderInvoiceDraftLine_invoice_draft_id_fkey" FOREIGN KEY ("invoice_draft_id") REFERENCES "WorkOrderInvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraftLine" ADD CONSTRAINT "WorkOrderInvoiceDraftLine_source_entry_id_fkey" FOREIGN KEY ("source_entry_id") REFERENCES "WorkOrderExecutionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_financial_status_check" CHECK ("financial_status" IN ('open', 'review', 'approved', 'rejected', 'reopened'));
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_status_check" CHECK ("status" IN ('draft', 'approved', 'exported', 'cancelled'));
