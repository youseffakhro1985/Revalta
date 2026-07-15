ALTER TABLE "PropertyTechnicalAsset"
  ADD COLUMN "component_class" TEXT,
  ADD COLUMN "commissioned_at" TIMESTAMP(3),
  ADD COLUMN "installation_year" INTEGER,
  ADD COLUMN "technical_lifetime_years" INTEGER,
  ADD COLUMN "economic_lifetime_years" INTEGER,
  ADD COLUMN "expected_replacement_year" INTEGER,
  ADD COLUMN "condition_grade" INTEGER,
  ADD COLUMN "replacement_value" DECIMAL(14,2),
  ADD COLUMN "responsible_supplier" TEXT;

CREATE TABLE "ComponentLifecycleEvent" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "technical_asset_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "work_order_id" TEXT,
  "project_id" TEXT,
  "event_type" TEXT NOT NULL,
  "event_date" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "provider" TEXT,
  "result" TEXT,
  "next_due_at" TIMESTAMP(3),
  "meter_reading" DECIMAL(14,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComponentLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentCostEntry" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "technical_asset_id" TEXT NOT NULL,
  "lifecycle_event_id" TEXT,
  "work_order_id" TEXT,
  "project_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "cost_type" TEXT NOT NULL,
  "description" TEXT,
  "supplier" TEXT,
  "amount_ex_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
  "cost_date" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComponentCostEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyTechnicalAsset_component_class_idx" ON "PropertyTechnicalAsset"("component_class");
CREATE INDEX "PropertyTechnicalAsset_expected_replacement_year_idx" ON "PropertyTechnicalAsset"("expected_replacement_year");
CREATE INDEX "ComponentLifecycleEvent_asset_event_date_idx" ON "ComponentLifecycleEvent"("technical_asset_id", "event_date");
CREATE INDEX "ComponentLifecycleEvent_company_property_next_due_idx" ON "ComponentLifecycleEvent"("company_id", "property_id", "next_due_at");
CREATE INDEX "ComponentCostEntry_asset_cost_date_idx" ON "ComponentCostEntry"("technical_asset_id", "cost_date");
CREATE INDEX "ComponentCostEntry_company_property_cost_date_idx" ON "ComponentCostEntry"("company_id", "property_id", "cost_date");

ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_lifecycle_event_id_fkey" FOREIGN KEY ("lifecycle_event_id") REFERENCES "ComponentLifecycleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_installation_year_check" CHECK ("installation_year" IS NULL OR "installation_year" BETWEEN 1800 AND 2300);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_technical_lifetime_check" CHECK ("technical_lifetime_years" IS NULL OR "technical_lifetime_years" > 0);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_economic_lifetime_check" CHECK ("economic_lifetime_years" IS NULL OR "economic_lifetime_years" > 0);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_replacement_year_check" CHECK ("expected_replacement_year" IS NULL OR "expected_replacement_year" BETWEEN 1800 AND 2300);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_condition_grade_check" CHECK ("condition_grade" IS NULL OR "condition_grade" BETWEEN 1 AND 5);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_replacement_value_nonnegative" CHECK ("replacement_value" IS NULL OR "replacement_value" >= 0);
ALTER TABLE "ComponentLifecycleEvent" ADD CONSTRAINT "ComponentLifecycleEvent_type_check" CHECK ("event_type" IN ('installation', 'commissioning', 'service', 'repair', 'inspection', 'warranty', 'damage', 'replacement', 'shutdown', 'restart'));
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_cost_type_check" CHECK ("cost_type" IN ('service', 'repair', 'spare_part', 'inspection', 'contractor', 'investment', 'replacement', 'other'));
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_amount_nonnegative" CHECK ("amount_ex_vat" >= 0);
ALTER TABLE "ComponentCostEntry" ADD CONSTRAINT "ComponentCostEntry_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
