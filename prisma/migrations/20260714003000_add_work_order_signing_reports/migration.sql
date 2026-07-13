-- Digital signatures attached to one work order.
CREATE TABLE "WorkOrderSignature" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "signer_role" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT,
    "confirmation_text" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderSignature_pkey" PRIMARY KEY ("id")
);

-- Immutable report snapshots generated from a work order.
CREATE TABLE "WorkOrderReport" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderReport_pkey" PRIMARY KEY ("id")
);

-- Invoice basis generated from execution entries.
CREATE TABLE "WorkOrderInvoiceBasis" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderInvoiceBasis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderSignature_work_order_id_signer_role_key" ON "WorkOrderSignature"("work_order_id", "signer_role");
CREATE UNIQUE INDEX "WorkOrderReport_work_order_id_version_key" ON "WorkOrderReport"("work_order_id", "version");
CREATE UNIQUE INDEX "WorkOrderInvoiceBasis_reference_key" ON "WorkOrderInvoiceBasis"("reference");
CREATE INDEX "WorkOrderSignature_company_id_work_order_id_idx" ON "WorkOrderSignature"("company_id", "work_order_id");
CREATE INDEX "WorkOrderReport_company_id_work_order_id_idx" ON "WorkOrderReport"("company_id", "work_order_id");
CREATE INDEX "WorkOrderInvoiceBasis_company_id_status_idx" ON "WorkOrderInvoiceBasis"("company_id", "status");

ALTER TABLE "WorkOrderSignature" ADD CONSTRAINT "WorkOrderSignature_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSignature" ADD CONSTRAINT "WorkOrderSignature_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSignature" ADD CONSTRAINT "WorkOrderSignature_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReport" ADD CONSTRAINT "WorkOrderReport_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReport" ADD CONSTRAINT "WorkOrderReport_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReport" ADD CONSTRAINT "WorkOrderReport_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderReport" ADD CONSTRAINT "WorkOrderReport_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrderSignature" ADD CONSTRAINT "WorkOrderSignature_role_check" CHECK ("signer_role" IN ('executor', 'contractor', 'customer'));
ALTER TABLE "WorkOrderSignature" ADD CONSTRAINT "WorkOrderSignature_name_not_blank" CHECK (length(trim("signer_name")) > 0);
ALTER TABLE "WorkOrderReport" ADD CONSTRAINT "WorkOrderReport_status_check" CHECK ("status" IN ('draft', 'approved'));
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_status_check" CHECK ("status" IN ('draft', 'approved', 'exported'));
ALTER TABLE "WorkOrderInvoiceBasis" ADD CONSTRAINT "WorkOrderInvoiceBasis_amounts_nonnegative" CHECK ("subtotal" >= 0 AND "vat_amount" >= 0 AND "total" >= 0);
