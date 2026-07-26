CREATE TABLE "WorkOrderTimeEntry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,
    "user_email" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'work',
    "action" TEXT NOT NULL DEFAULT 'manual',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "minutes" INTEGER,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderTimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderMaterialEntry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "article_number" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'st',
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "supplier" TEXT,
    "stock_status" TEXT NOT NULL DEFAULT 'used',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "created_by_id" TEXT NOT NULL,
    "created_by_name" TEXT,
    "created_by_email" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderMaterialEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderProfitabilitySettings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "internal_hourly_cost" DECIMAL(14,2) NOT NULL DEFAULT 350,
    "customer_hourly_rate" DECIMAL(14,2) NOT NULL DEFAULT 650,
    "material_markup_percent" DECIMAL(7,2) NOT NULL DEFAULT 15,
    "other_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fixed_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderProfitabilitySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderInvoiceDraft" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "customer_name" TEXT NOT NULL DEFAULT '',
    "customer_org_number" TEXT NOT NULL DEFAULT '',
    "customer_reference" TEXT NOT NULL DEFAULT '',
    "invoice_date" TEXT NOT NULL,
    "due_days" INTEGER NOT NULL DEFAULT 30,
    "discount_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "vat_percent" DECIMAL(7,2) NOT NULL DEFAULT 25,
    "note" TEXT NOT NULL DEFAULT '',
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderInvoiceDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderInvoiceExportJob" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "invoice_version_id" TEXT NOT NULL,
    "error" TEXT,
    "provider_status" INTEGER,
    "external_id" TEXT,
    "provider_response" TEXT,
    "processing_started_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "acted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderInvoiceExportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderProfitabilitySettings_work_order_id_key" ON "WorkOrderProfitabilitySettings"("work_order_id");
CREATE UNIQUE INDEX "WorkOrderInvoiceDraft_version_id_key" ON "WorkOrderInvoiceDraft"("version_id");

CREATE INDEX "WorkOrderTimeEntry_company_id_work_order_id_status_idx" ON "WorkOrderTimeEntry"("company_id", "work_order_id", "status");
CREATE INDEX "WorkOrderTimeEntry_work_order_id_created_at_idx" ON "WorkOrderTimeEntry"("work_order_id", "created_at");
CREATE INDEX "WorkOrderTimeEntry_user_id_idx" ON "WorkOrderTimeEntry"("user_id");

CREATE INDEX "WorkOrderMaterialEntry_company_id_work_order_id_status_idx" ON "WorkOrderMaterialEntry"("company_id", "work_order_id", "status");
CREATE INDEX "WorkOrderMaterialEntry_work_order_id_created_at_idx" ON "WorkOrderMaterialEntry"("work_order_id", "created_at");
CREATE INDEX "WorkOrderMaterialEntry_created_by_id_idx" ON "WorkOrderMaterialEntry"("created_by_id");

CREATE INDEX "WorkOrderProfitabilitySettings_company_id_idx" ON "WorkOrderProfitabilitySettings"("company_id");
CREATE INDEX "WorkOrderProfitabilitySettings_updated_by_id_idx" ON "WorkOrderProfitabilitySettings"("updated_by_id");

CREATE INDEX "WorkOrderInvoiceDraft_company_id_work_order_id_created_at_idx" ON "WorkOrderInvoiceDraft"("company_id", "work_order_id", "created_at");
CREATE INDEX "WorkOrderInvoiceDraft_work_order_id_status_idx" ON "WorkOrderInvoiceDraft"("work_order_id", "status");
CREATE INDEX "WorkOrderInvoiceDraft_updated_by_id_idx" ON "WorkOrderInvoiceDraft"("updated_by_id");

CREATE INDEX "WorkOrderInvoiceExportJob_company_id_work_order_id_status_idx" ON "WorkOrderInvoiceExportJob"("company_id", "work_order_id", "status");
CREATE INDEX "WorkOrderInvoiceExportJob_status_created_at_idx" ON "WorkOrderInvoiceExportJob"("status", "created_at");
CREATE INDEX "WorkOrderInvoiceExportJob_invoice_version_id_idx" ON "WorkOrderInvoiceExportJob"("invoice_version_id");
CREATE INDEX "WorkOrderInvoiceExportJob_created_by_id_idx" ON "WorkOrderInvoiceExportJob"("created_by_id");

ALTER TABLE "WorkOrderTimeEntry" ADD CONSTRAINT "WorkOrderTimeEntry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderTimeEntry" ADD CONSTRAINT "WorkOrderTimeEntry_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderTimeEntry" ADD CONSTRAINT "WorkOrderTimeEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderMaterialEntry" ADD CONSTRAINT "WorkOrderMaterialEntry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderMaterialEntry" ADD CONSTRAINT "WorkOrderMaterialEntry_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderMaterialEntry" ADD CONSTRAINT "WorkOrderMaterialEntry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderProfitabilitySettings" ADD CONSTRAINT "WorkOrderProfitabilitySettings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderProfitabilitySettings" ADD CONSTRAINT "WorkOrderProfitabilitySettings_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderProfitabilitySettings" ADD CONSTRAINT "WorkOrderProfitabilitySettings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceDraft" ADD CONSTRAINT "WorkOrderInvoiceDraft_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderInvoiceExportJob" ADD CONSTRAINT "WorkOrderInvoiceExportJob_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceExportJob" ADD CONSTRAINT "WorkOrderInvoiceExportJob_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderInvoiceExportJob" ADD CONSTRAINT "WorkOrderInvoiceExportJob_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
