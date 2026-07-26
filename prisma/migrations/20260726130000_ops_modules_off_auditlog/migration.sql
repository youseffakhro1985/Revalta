-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "audience" TEXT NOT NULL DEFAULT 'Alla användare',
    "author_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "reader_user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioMaintenanceItem" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "planned_year" INTEGER NOT NULL,
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "interval_years" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "work_order_id" TEXT,
    "work_order_number" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioMaintenanceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BudgetEntry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "forecast" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnergyReading" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "value_per_sqm" DECIMAL(14,6),
    "cost_per_sqm" DECIMAL(14,6),
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnergyReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorContract" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT,
    "name" TEXT NOT NULL,
    "org_number" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Övrigt',
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contract_title" TEXT,
    "contract_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notice_months" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceInspection" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "responsible" TEXT,
    "supplier" TEXT,
    "interval_months" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComplianceInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "damage_type" TEXT NOT NULL,
    "incident_date" TIMESTAMP(3),
    "location" TEXT,
    "insurer" TEXT,
    "claim_number" TEXT,
    "responsible" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductible" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "compensation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RentNotice" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "lease_id" TEXT,
    "tenant_name" TEXT NOT NULL,
    "unit" TEXT,
    "period" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "base_rent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "index_percent" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "indexed_rent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RentNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Aktivitet',
    "property_name" TEXT,
    "responsible" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRead_notification_id_reader_user_id_key" ON "NotificationRead"("notification_id", "reader_user_id");
CREATE INDEX "AppNotification_company_id_created_at_idx" ON "AppNotification"("company_id", "created_at");
CREATE INDEX "AppNotification_created_by_id_idx" ON "AppNotification"("created_by_id");
CREATE INDEX "NotificationRead_company_id_reader_user_id_idx" ON "NotificationRead"("company_id", "reader_user_id");
CREATE INDEX "NotificationRead_reader_user_id_idx" ON "NotificationRead"("reader_user_id");
CREATE INDEX "PortfolioMaintenanceItem_company_id_created_at_idx" ON "PortfolioMaintenanceItem"("company_id", "created_at");
CREATE INDEX "PortfolioMaintenanceItem_company_id_property_id_idx" ON "PortfolioMaintenanceItem"("company_id", "property_id");
CREATE INDEX "PortfolioMaintenanceItem_company_id_status_idx" ON "PortfolioMaintenanceItem"("company_id", "status");
CREATE INDEX "PortfolioMaintenanceItem_created_by_id_idx" ON "PortfolioMaintenanceItem"("created_by_id");
CREATE INDEX "BudgetEntry_company_id_year_idx" ON "BudgetEntry"("company_id", "year");
CREATE INDEX "BudgetEntry_company_id_property_id_idx" ON "BudgetEntry"("company_id", "property_id");
CREATE INDEX "BudgetEntry_created_by_id_idx" ON "BudgetEntry"("created_by_id");
CREATE INDEX "EnergyReading_company_id_created_at_idx" ON "EnergyReading"("company_id", "created_at");
CREATE INDEX "EnergyReading_company_id_property_id_type_idx" ON "EnergyReading"("company_id", "property_id", "type");
CREATE INDEX "EnergyReading_created_by_id_idx" ON "EnergyReading"("created_by_id");
CREATE INDEX "VendorContract_company_id_created_at_idx" ON "VendorContract"("company_id", "created_at");
CREATE INDEX "VendorContract_company_id_property_id_idx" ON "VendorContract"("company_id", "property_id");
CREATE INDEX "VendorContract_created_by_id_idx" ON "VendorContract"("created_by_id");
CREATE INDEX "ComplianceInspection_company_id_due_date_idx" ON "ComplianceInspection"("company_id", "due_date");
CREATE INDEX "ComplianceInspection_company_id_property_id_idx" ON "ComplianceInspection"("company_id", "property_id");
CREATE INDEX "ComplianceInspection_created_by_id_idx" ON "ComplianceInspection"("created_by_id");
CREATE INDEX "InsuranceClaim_company_id_created_at_idx" ON "InsuranceClaim"("company_id", "created_at");
CREATE INDEX "InsuranceClaim_company_id_property_id_idx" ON "InsuranceClaim"("company_id", "property_id");
CREATE INDEX "InsuranceClaim_company_id_status_idx" ON "InsuranceClaim"("company_id", "status");
CREATE INDEX "InsuranceClaim_created_by_id_idx" ON "InsuranceClaim"("created_by_id");
CREATE INDEX "RentNotice_company_id_created_at_idx" ON "RentNotice"("company_id", "created_at");
CREATE INDEX "RentNotice_company_id_property_id_idx" ON "RentNotice"("company_id", "property_id");
CREATE INDEX "RentNotice_company_id_lease_id_idx" ON "RentNotice"("company_id", "lease_id");
CREATE INDEX "RentNotice_created_by_id_idx" ON "RentNotice"("created_by_id");
CREATE INDEX "CalendarEvent_company_id_date_idx" ON "CalendarEvent"("company_id", "date");
CREATE INDEX "CalendarEvent_created_by_id_idx" ON "CalendarEvent"("created_by_id");

ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "AppNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_reader_user_id_fkey" FOREIGN KEY ("reader_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioMaintenanceItem" ADD CONSTRAINT "PortfolioMaintenanceItem_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioMaintenanceItem" ADD CONSTRAINT "PortfolioMaintenanceItem_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioMaintenanceItem" ADD CONSTRAINT "PortfolioMaintenanceItem_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorContract" ADD CONSTRAINT "VendorContract_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorContract" ADD CONSTRAINT "VendorContract_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorContract" ADD CONSTRAINT "VendorContract_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceInspection" ADD CONSTRAINT "ComplianceInspection_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceInspection" ADD CONSTRAINT "ComplianceInspection_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceInspection" ADD CONSTRAINT "ComplianceInspection_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentNotice" ADD CONSTRAINT "RentNotice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentNotice" ADD CONSTRAINT "RentNotice_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentNotice" ADD CONSTRAINT "RentNotice_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
