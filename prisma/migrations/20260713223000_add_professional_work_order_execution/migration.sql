-- Extend work orders with explicit SLA milestones.
ALTER TABLE "WorkOrder"
ADD COLUMN "response_due_at" TIMESTAMP(3),
ADD COLUMN "completion_due_at" TIMESTAMP(3),
ADD COLUMN "responded_at" TIMESTAMP(3),
ADD COLUMN "sla_status" TEXT NOT NULL DEFAULT 'not_set';

-- Checklist items support required controls and completion traceability.
CREATE TABLE "WorkOrderChecklistItem" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("id")
);

-- One ledger for time, materials, travel and external costs.
CREATE TABLE "WorkOrderExecutionEntry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_cost" DECIMAL(14,2),
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minutes" INTEGER,
    "distance_km" DECIMAL(10,2),
    "supplier" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderExecutionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrder_response_due_at_idx" ON "WorkOrder"("response_due_at");
CREATE INDEX "WorkOrder_completion_due_at_idx" ON "WorkOrder"("completion_due_at");
CREATE INDEX "WorkOrder_company_id_sla_status_idx" ON "WorkOrder"("company_id", "sla_status");
CREATE INDEX "WorkOrderChecklistItem_company_id_work_order_id_idx" ON "WorkOrderChecklistItem"("company_id", "work_order_id");
CREATE INDEX "WorkOrderChecklistItem_work_order_id_sort_order_idx" ON "WorkOrderChecklistItem"("work_order_id", "sort_order");
CREATE INDEX "WorkOrderExecutionEntry_company_id_work_order_id_idx" ON "WorkOrderExecutionEntry"("company_id", "work_order_id");
CREATE INDEX "WorkOrderExecutionEntry_work_order_id_entry_type_idx" ON "WorkOrderExecutionEntry"("work_order_id", "entry_type");
CREATE INDEX "WorkOrderExecutionEntry_occurred_at_idx" ON "WorkOrderExecutionEntry"("occurred_at");

ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_title_not_blank" CHECK (length(trim("title")) > 0);
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_type_check" CHECK ("entry_type" IN ('time', 'material', 'travel', 'external'));
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_amount_nonnegative" CHECK ("total_amount" >= 0);
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_minutes_nonnegative" CHECK ("minutes" IS NULL OR "minutes" >= 0);
ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_distance_nonnegative" CHECK ("distance_km" IS NULL OR "distance_km" >= 0);
