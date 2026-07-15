ALTER TABLE "WorkOrderExecutionEntry"
  ADD COLUMN IF NOT EXISTS "is_voided" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voided_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "hourly_rate" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "WorkOrderTimerSession" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "description" TEXT,
  "segment_started_at" TIMESTAMP(3),
  "accumulated_minutes" INTEGER NOT NULL DEFAULT 0,
  "hourly_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stopped_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderTimerSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkOrderTimerSession_work_order_idx" ON "WorkOrderTimerSession"("work_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "WorkOrderTimerSession_company_user_idx" ON "WorkOrderTimerSession"("company_id", "user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrderTimerSession_active_user_key"
  ON "WorkOrderTimerSession"("company_id", "user_id")
  WHERE "status" IN ('running', 'paused');
CREATE INDEX IF NOT EXISTS "WorkOrderExecutionEntry_active_idx" ON "WorkOrderExecutionEntry"("company_id", "work_order_id", "is_voided");

DO $$ BEGIN
  ALTER TABLE "WorkOrderExecutionEntry" ADD CONSTRAINT "WorkOrderExecutionEntry_voided_by_id_fkey"
    FOREIGN KEY ("voided_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderTimerSession" ADD CONSTRAINT "WorkOrderTimerSession_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorkOrderTimerSession" ADD CONSTRAINT "WorkOrderTimerSession_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorkOrderTimerSession" ADD CONSTRAINT "WorkOrderTimerSession_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderTimerSession" ADD CONSTRAINT "WorkOrderTimerSession_status_check"
    CHECK ("status" IN ('running', 'paused', 'stopped', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderTimerSession" ADD CONSTRAINT "WorkOrderTimerSession_minutes_check"
    CHECK ("accumulated_minutes" >= 0 AND "hourly_rate" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
