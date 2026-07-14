CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "base_year" INTEGER NOT NULL,
    "horizon_years" INTEGER NOT NULL DEFAULT 30,
    "annual_index_rate" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "summary" TEXT,
    "assumptions" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaintenanceAction" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "maintenance_plan_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "building_id" TEXT,
    "technical_asset_id" TEXT,
    "source_work_order_id" TEXT,
    "project_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "planned_year" INTEGER NOT NULL,
    "recurrence_years" INTEGER,
    "technical_lifetime_years" INTEGER,
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "annual_index_rate" DECIMAL(5,2),
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "risk" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "contractor" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenancePlan_property_id_version_key" ON "MaintenancePlan"("property_id", "version");
CREATE INDEX "MaintenancePlan_company_id_property_id_status_idx" ON "MaintenancePlan"("company_id", "property_id", "status");
CREATE INDEX "MaintenanceAction_company_id_property_id_planned_year_idx" ON "MaintenanceAction"("company_id", "property_id", "planned_year");
CREATE INDEX "MaintenanceAction_plan_status_idx" ON "MaintenanceAction"("maintenance_plan_id", "status");
CREATE INDEX "MaintenanceAction_building_id_idx" ON "MaintenanceAction"("building_id");
CREATE INDEX "MaintenanceAction_technical_asset_id_idx" ON "MaintenanceAction"("technical_asset_id");
CREATE INDEX "MaintenanceAction_project_id_idx" ON "MaintenanceAction"("project_id");

ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_maintenance_plan_id_fkey" FOREIGN KEY ("maintenance_plan_id") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_status_check" CHECK ("status" IN ('draft', 'active', 'archived'));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_horizon_check" CHECK ("horizon_years" IN (5, 10, 20, 30));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_index_check" CHECK ("annual_index_rate" >= 0 AND "annual_index_rate" <= 25);
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_cost_nonnegative" CHECK ("estimated_cost" >= 0);
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_risk_check" CHECK ("risk" IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_status_check" CHECK ("status" IN ('planned', 'approved', 'in_progress', 'completed', 'deferred', 'cancelled'));
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_recurrence_check" CHECK ("recurrence_years" IS NULL OR "recurrence_years" > 0);
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_lifetime_check" CHECK ("technical_lifetime_years" IS NULL OR "technical_lifetime_years" > 0);
ALTER TABLE "MaintenanceAction" ADD CONSTRAINT "MaintenanceAction_index_check" CHECK ("annual_index_rate" IS NULL OR ("annual_index_rate" >= 0 AND "annual_index_rate" <= 25));
