ALTER TABLE "ComponentLifecycleEvent"
  ADD COLUMN "sync_key" TEXT;

ALTER TABLE "ComponentCostEntry"
  ADD COLUMN "sync_key" TEXT;

CREATE UNIQUE INDEX "ComponentLifecycleEvent_company_sync_key_key"
  ON "ComponentLifecycleEvent"("company_id", "sync_key")
  WHERE "sync_key" IS NOT NULL;

CREATE UNIQUE INDEX "ComponentCostEntry_company_sync_key_key"
  ON "ComponentCostEntry"("company_id", "sync_key")
  WHERE "sync_key" IS NOT NULL;

CREATE INDEX "ComponentLifecycleEvent_work_order_idx"
  ON "ComponentLifecycleEvent"("work_order_id");

CREATE INDEX "ComponentCostEntry_work_order_idx"
  ON "ComponentCostEntry"("work_order_id");
