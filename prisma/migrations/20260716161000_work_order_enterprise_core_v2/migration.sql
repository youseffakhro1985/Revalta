ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "work_order_number" TEXT,
  ADD COLUMN IF NOT EXISTS "work_type" TEXT NOT NULL DEFAULT 'corrective',
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS "sla_response_due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sla_resolution_due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "responded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pause_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WorkOrderNumberCounter" (
  "company_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderNumberCounter_pkey" PRIMARY KEY ("company_id", "year")
);

CREATE TABLE IF NOT EXISTS "WorkOrderStatusEvent" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_company_number_key"
  ON "WorkOrder"("company_id", "work_order_number")
  WHERE "work_order_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "WorkOrder_company_sla_response_idx"
  ON "WorkOrder"("company_id", "sla_response_due_at");
CREATE INDEX IF NOT EXISTS "WorkOrder_company_sla_resolution_idx"
  ON "WorkOrder"("company_id", "sla_resolution_due_at");
CREATE INDEX IF NOT EXISTS "WorkOrderStatusEvent_work_order_created_idx"
  ON "WorkOrderStatusEvent"("work_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "WorkOrderStatusEvent_company_created_idx"
  ON "WorkOrderStatusEvent"("company_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "WorkOrderNumberCounter"
    ADD CONSTRAINT "WorkOrderNumberCounter_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderStatusEvent"
    ADD CONSTRAINT "WorkOrderStatusEvent_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderStatusEvent"
    ADD CONSTRAINT "WorkOrderStatusEvent_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderStatusEvent"
    ADD CONSTRAINT "WorkOrderStatusEvent_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrder"
    ADD CONSTRAINT "WorkOrder_work_type_check"
    CHECK ("work_type" IN ('corrective', 'preventive', 'inspection', 'emergency', 'project', 'warranty'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrder"
    ADD CONSTRAINT "WorkOrder_source_check"
    CHECK ("source" IN ('internal', 'ticket', 'maintenance_plan', 'inspection', 'component', 'resident', 'supplier'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
