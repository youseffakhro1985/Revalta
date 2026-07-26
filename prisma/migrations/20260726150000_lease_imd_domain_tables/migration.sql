CREATE TABLE "LeaseHandoverRecord" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaseHandoverRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaseHandoverRecord_lease_id_key" ON "LeaseHandoverRecord"("lease_id");
CREATE UNIQUE INDEX "LeaseHandoverRecord_company_id_lease_id_key" ON "LeaseHandoverRecord"("company_id", "lease_id");
CREATE INDEX "LeaseHandoverRecord_company_id_status_idx" ON "LeaseHandoverRecord"("company_id", "status");
CREATE INDEX "LeaseHandoverRecord_created_by_id_idx" ON "LeaseHandoverRecord"("created_by_id");
CREATE INDEX "LeaseHandoverRecord_updated_by_id_idx" ON "LeaseHandoverRecord"("updated_by_id");

ALTER TABLE "LeaseHandoverRecord" ADD CONSTRAINT "LeaseHandoverRecord_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseHandoverRecord" ADD CONSTRAINT "LeaseHandoverRecord_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseHandoverRecord" ADD CONSTRAINT "LeaseHandoverRecord_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaseHandoverRecord" ADD CONSTRAINT "LeaseHandoverRecord_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LeaseInspectionRecord" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaseInspectionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaseInspectionRecord_lease_id_key" ON "LeaseInspectionRecord"("lease_id");
CREATE UNIQUE INDEX "LeaseInspectionRecord_company_id_lease_id_key" ON "LeaseInspectionRecord"("company_id", "lease_id");
CREATE INDEX "LeaseInspectionRecord_company_id_status_idx" ON "LeaseInspectionRecord"("company_id", "status");
CREATE INDEX "LeaseInspectionRecord_created_by_id_idx" ON "LeaseInspectionRecord"("created_by_id");
CREATE INDEX "LeaseInspectionRecord_updated_by_id_idx" ON "LeaseInspectionRecord"("updated_by_id");

ALTER TABLE "LeaseInspectionRecord" ADD CONSTRAINT "LeaseInspectionRecord_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionRecord" ADD CONSTRAINT "LeaseInspectionRecord_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionRecord" ADD CONSTRAINT "LeaseInspectionRecord_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionRecord" ADD CONSTRAINT "LeaseInspectionRecord_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LeaseInspectionWorkOrderLink" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "record_version" INTEGER NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaseInspectionWorkOrderLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaseInspectionWorkOrderLink_company_id_lease_id_item_id_key" ON "LeaseInspectionWorkOrderLink"("company_id", "lease_id", "item_id");
CREATE INDEX "LeaseInspectionWorkOrderLink_company_id_lease_id_idx" ON "LeaseInspectionWorkOrderLink"("company_id", "lease_id");
CREATE INDEX "LeaseInspectionWorkOrderLink_work_order_id_idx" ON "LeaseInspectionWorkOrderLink"("work_order_id");
CREATE INDEX "LeaseInspectionWorkOrderLink_created_by_id_idx" ON "LeaseInspectionWorkOrderLink"("created_by_id");

ALTER TABLE "LeaseInspectionWorkOrderLink" ADD CONSTRAINT "LeaseInspectionWorkOrderLink_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionWorkOrderLink" ADD CONSTRAINT "LeaseInspectionWorkOrderLink_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionWorkOrderLink" ADD CONSTRAINT "LeaseInspectionWorkOrderLink_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseInspectionWorkOrderLink" ADD CONSTRAINT "LeaseInspectionWorkOrderLink_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ImdDebitLine" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "imd_reading_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "lease_id" TEXT,
    "rent_notice_id" TEXT,
    "unit" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "meter_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "consumption" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImdDebitLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImdDebitLine_imd_reading_id_key" ON "ImdDebitLine"("imd_reading_id");
CREATE INDEX "ImdDebitLine_company_id_status_created_at_idx" ON "ImdDebitLine"("company_id", "status", "created_at");
CREATE INDEX "ImdDebitLine_company_id_property_id_idx" ON "ImdDebitLine"("company_id", "property_id");
CREATE INDEX "ImdDebitLine_company_id_lease_id_idx" ON "ImdDebitLine"("company_id", "lease_id");
CREATE INDEX "ImdDebitLine_rent_notice_id_idx" ON "ImdDebitLine"("rent_notice_id");
CREATE INDEX "ImdDebitLine_created_by_id_idx" ON "ImdDebitLine"("created_by_id");

ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_imd_reading_id_fkey" FOREIGN KEY ("imd_reading_id") REFERENCES "ImdReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_rent_notice_id_fkey" FOREIGN KEY ("rent_notice_id") REFERENCES "RentNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImdDebitLine" ADD CONSTRAINT "ImdDebitLine_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
