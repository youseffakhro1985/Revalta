CREATE TABLE "RecurringWorkOrderSchedule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "property_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "estimated_cost" DECIMAL(14,2),
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated_at" TIMESTAMP(3),
    "last_work_order_id" TEXT,
    "last_work_order_number" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringWorkOrderSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringWorkOrderRun" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "recipient" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringWorkOrderRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringIncidentEvent" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringIncidentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringWorkOrderSchedule_company_id_active_next_run_at_idx" ON "RecurringWorkOrderSchedule"("company_id", "active", "next_run_at");
CREATE INDEX "RecurringWorkOrderSchedule_company_id_property_id_idx" ON "RecurringWorkOrderSchedule"("company_id", "property_id");
CREATE INDEX "RecurringWorkOrderSchedule_created_by_id_idx" ON "RecurringWorkOrderSchedule"("created_by_id");
CREATE INDEX "RecurringWorkOrderSchedule_updated_by_id_idx" ON "RecurringWorkOrderSchedule"("updated_by_id");
CREATE INDEX "RecurringWorkOrderRun_company_id_status_created_at_idx" ON "RecurringWorkOrderRun"("company_id", "status", "created_at");
CREATE INDEX "RecurringWorkOrderRun_status_created_at_idx" ON "RecurringWorkOrderRun"("status", "created_at");
CREATE INDEX "RecurringIncidentEvent_company_id_notification_key_created_at_idx" ON "RecurringIncidentEvent"("company_id", "notification_key", "created_at");
CREATE INDEX "RecurringIncidentEvent_company_id_event_type_created_at_idx" ON "RecurringIncidentEvent"("company_id", "event_type", "created_at");

ALTER TABLE "RecurringWorkOrderSchedule" ADD CONSTRAINT "RecurringWorkOrderSchedule_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringWorkOrderSchedule" ADD CONSTRAINT "RecurringWorkOrderSchedule_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringWorkOrderSchedule" ADD CONSTRAINT "RecurringWorkOrderSchedule_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringWorkOrderRun" ADD CONSTRAINT "RecurringWorkOrderRun_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringIncidentEvent" ADD CONSTRAINT "RecurringIncidentEvent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
