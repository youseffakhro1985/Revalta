-- Property entrances / stairwells.
CREATE TABLE "PropertyEntrance" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "building_id" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "floors" INTEGER,
    "accessibility" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyEntrance_pkey" PRIMARY KEY ("id")
);

-- Technical assets and systems belonging to a property.
CREATE TABLE "PropertyTechnicalAsset" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "building_id" TEXT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "location" TEXT,
    "installed_at" TIMESTAMP(3),
    "last_service_at" TIMESTAMP(3),
    "next_service_at" TIMESTAMP(3),
    "service_provider" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyTechnicalAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyWarranty" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "technical_asset_id" TEXT,
    "title" TEXT NOT NULL,
    "supplier" TEXT,
    "scope" TEXT,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "document_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyWarranty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyInspection" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "technical_asset_id" TEXT,
    "inspection_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "performed_at" TIMESTAMP(3),
    "next_due_at" TIMESTAMP(3),
    "provider" TEXT,
    "contact_name" TEXT,
    "result" TEXT,
    "summary" TEXT,
    "document_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyServiceAgreement" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "technical_asset_id" TEXT,
    "supplier" TEXT NOT NULL,
    "agreement_number" TEXT,
    "service_area" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "notice_period_months" INTEGER,
    "cost_amount" DECIMAL(14,2),
    "cost_interval" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "document_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyServiceAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyEntrance_company_id_property_id_idx" ON "PropertyEntrance"("company_id", "property_id");
CREATE INDEX "PropertyEntrance_building_id_idx" ON "PropertyEntrance"("building_id");
CREATE INDEX "PropertyTechnicalAsset_company_id_property_id_idx" ON "PropertyTechnicalAsset"("company_id", "property_id");
CREATE INDEX "PropertyTechnicalAsset_property_id_category_idx" ON "PropertyTechnicalAsset"("property_id", "category");
CREATE INDEX "PropertyTechnicalAsset_next_service_at_idx" ON "PropertyTechnicalAsset"("next_service_at");
CREATE INDEX "PropertyWarranty_company_id_property_id_idx" ON "PropertyWarranty"("company_id", "property_id");
CREATE INDEX "PropertyWarranty_expires_at_idx" ON "PropertyWarranty"("expires_at");
CREATE INDEX "PropertyInspection_company_id_property_id_idx" ON "PropertyInspection"("company_id", "property_id");
CREATE INDEX "PropertyInspection_next_due_at_idx" ON "PropertyInspection"("next_due_at");
CREATE INDEX "PropertyServiceAgreement_company_id_property_id_idx" ON "PropertyServiceAgreement"("company_id", "property_id");
CREATE INDEX "PropertyServiceAgreement_ends_at_idx" ON "PropertyServiceAgreement"("ends_at");

ALTER TABLE "PropertyEntrance" ADD CONSTRAINT "PropertyEntrance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyEntrance" ADD CONSTRAINT "PropertyEntrance_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyEntrance" ADD CONSTRAINT "PropertyEntrance_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyWarranty" ADD CONSTRAINT "PropertyWarranty_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWarranty" ADD CONSTRAINT "PropertyWarranty_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWarranty" ADD CONSTRAINT "PropertyWarranty_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyInspection" ADD CONSTRAINT "PropertyInspection_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyInspection" ADD CONSTRAINT "PropertyInspection_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyInspection" ADD CONSTRAINT "PropertyInspection_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyServiceAgreement" ADD CONSTRAINT "PropertyServiceAgreement_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyServiceAgreement" ADD CONSTRAINT "PropertyServiceAgreement_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyServiceAgreement" ADD CONSTRAINT "PropertyServiceAgreement_technical_asset_id_fkey" FOREIGN KEY ("technical_asset_id") REFERENCES "PropertyTechnicalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropertyEntrance" ADD CONSTRAINT "PropertyEntrance_name_not_blank" CHECK (length(trim("name")) > 0);
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_category_check" CHECK ("category" IN ('elevator', 'ventilation', 'heating', 'electricity', 'water', 'fire', 'access', 'other'));
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_criticality_check" CHECK ("criticality" IN ('low', 'normal', 'high', 'critical'));
ALTER TABLE "PropertyTechnicalAsset" ADD CONSTRAINT "PropertyTechnicalAsset_status_check" CHECK ("status" IN ('active', 'service_due', 'out_of_service', 'decommissioned'));
ALTER TABLE "PropertyWarranty" ADD CONSTRAINT "PropertyWarranty_dates_check" CHECK ("expires_at" IS NULL OR "starts_at" IS NULL OR "expires_at" >= "starts_at");
ALTER TABLE "PropertyInspection" ADD CONSTRAINT "PropertyInspection_status_check" CHECK ("status" IN ('planned', 'completed', 'approved', 'remark', 'overdue'));
ALTER TABLE "PropertyServiceAgreement" ADD CONSTRAINT "PropertyServiceAgreement_dates_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at");
ALTER TABLE "PropertyServiceAgreement" ADD CONSTRAINT "PropertyServiceAgreement_cost_nonnegative" CHECK ("cost_amount" IS NULL OR "cost_amount" >= 0);
