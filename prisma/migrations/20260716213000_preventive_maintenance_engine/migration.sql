ALTER TABLE "PropertyTechnicalAsset"
  ADD COLUMN IF NOT EXISTS "service_interval_months" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "auto_create_service_work_orders" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "service_lead_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "maintenance_cycle_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_company_maintenance_cycle_key_unique"
  ON "WorkOrder" ("company_id", "maintenance_cycle_key")
  WHERE "maintenance_cycle_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "PropertyTechnicalAsset_service_planning_idx"
  ON "PropertyTechnicalAsset" ("company_id", "next_service_at", "auto_create_service_work_orders");
