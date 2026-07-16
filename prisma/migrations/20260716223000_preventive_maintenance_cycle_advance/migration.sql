ALTER TABLE "WorkOrder"
ADD COLUMN IF NOT EXISTS "maintenance_cycle_advanced_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WorkOrder_company_id_maintenance_cycle_advanced_at_idx"
ON "WorkOrder"("company_id", "maintenance_cycle_advanced_at");
