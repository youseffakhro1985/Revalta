-- This migration is intentionally idempotent because an earlier production attempt
-- was recorded as failed after only part of the schema had been created.
-- It repairs missing columns before indexes and foreign keys are added.

CREATE TABLE IF NOT EXISTS "WorkOrder" (
    "id" TEXT NOT NULL,
    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Repair a partially created WorkOrder table without deleting existing data.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "company_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "ticket_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "property_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "assigned_to_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'planned';
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'normal';
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "scheduled_start" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "scheduled_end" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "estimated_cost" DECIMAL(14,2);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "actual_cost" DECIMAL(14,2);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Repair a partially created Project table without deleting existing data.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "company_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "property_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "source_work_order_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "manager_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'planned';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "risk" TEXT DEFAULT 'low';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "contractor" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "budget" DECIMAL(14,2) DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "forecast" DECIMAL(14,2) DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "actual" DECIMAL(14,2) DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- Enforce the Prisma-required fields only after every column exists. If legacy rows
-- contain incomplete required data, deployment stops rather than inventing ownership.
ALTER TABLE "WorkOrder" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "property_id" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "created_by_id" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'planned';
ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "priority" SET DEFAULT 'normal';
ALTER TABLE "WorkOrder" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WorkOrder" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WorkOrder" ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "Project" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "property_id" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "created_by_id" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'planned';
ALTER TABLE "Project" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "risk" SET DEFAULT 'low';
ALTER TABLE "Project" ALTER COLUMN "risk" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "budget" SET DEFAULT 0;
ALTER TABLE "Project" ALTER COLUMN "budget" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "forecast" SET DEFAULT 0;
ALTER TABLE "Project" ALTER COLUMN "forecast" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "actual" SET DEFAULT 0;
ALTER TABLE "Project" ALTER COLUMN "actual" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ALTER COLUMN "updated_at" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_pkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_pkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_company_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_ticket_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_property_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_unit_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_assigned_to_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrder_created_by_id_fkey' AND conrelid = '"WorkOrder"'::regclass) THEN
    ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_company_id_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_property_id_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_source_work_order_id_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_manager_id_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_created_by_id_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
