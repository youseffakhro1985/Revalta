-- This migration is intentionally idempotent because an earlier production attempt
-- was recorded as failed. It can safely be retried without deleting existing data.

CREATE TABLE IF NOT EXISTS "WorkOrder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "property_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduled_start" TIMESTAMP(3),
    "scheduled_end" TIMESTAMP(3),
    "estimated_cost" DECIMAL(14,2),
    "actual_cost" DECIMAL(14,2),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "source_work_order_id" TEXT,
    "manager_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "risk" TEXT NOT NULL DEFAULT 'low',
    "contractor" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "forecast" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_ticket_id_key" ON "WorkOrder"("ticket_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_company_id_status_idx" ON "WorkOrder"("company_id", "status");
CREATE INDEX IF NOT EXISTS "WorkOrder_property_id_idx" ON "WorkOrder"("property_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_unit_id_idx" ON "WorkOrder"("unit_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_assigned_to_id_idx" ON "WorkOrder"("assigned_to_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_scheduled_start_idx" ON "WorkOrder"("scheduled_start");
CREATE INDEX IF NOT EXISTS "Project_company_id_status_idx" ON "Project"("company_id", "status");
CREATE INDEX IF NOT EXISTS "Project_property_id_idx" ON "Project"("property_id");
CREATE INDEX IF NOT EXISTS "Project_source_work_order_id_idx" ON "Project"("source_work_order_id");
CREATE INDEX IF NOT EXISTS "Project_manager_id_idx" ON "Project"("manager_id");
CREATE INDEX IF NOT EXISTS "Project_start_date_idx" ON "Project"("start_date");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_company_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_ticket_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_property_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_unit_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_assigned_to_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_created_by_id_fkey') THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_company_id_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_property_id_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_source_work_order_id_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_manager_id_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_created_by_id_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;